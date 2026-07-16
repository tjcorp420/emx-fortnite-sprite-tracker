import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

export type CloudProgress = { owned?: boolean; mastered?: boolean; favorite?: boolean; notes?: string };
export type CloudTracker = { id: string; owner_id: string; name: string; description: string; visibility: 'private' | 'shared'; role?: 'owner' | 'editor' | 'viewer' };
export type LeaderboardRow = { rank: number; user_id: string; display_name: string; avatar_color: string; profile_badge: string; profile_badge_mark: string; profile_title: string; avatar_frame: string; xp: number; level: number; owned_count: number; mastered_count: number; owned_percent: number; mastered_percent: number; indexed_count: number };

function cleanDisplayName(value: string) { return value.replace(/[^a-zA-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'EMX Trainer'; }
async function syncProfileDisplayName(userId: string, value: string) { if (!supabase) return; const { error } = await supabase.from('profiles').update({ display_name: cleanDisplayName(value) }).eq('id', userId); if (error) throw error; }

export async function signInAnonymously() { if (!supabase) throw new Error('Supabase is not configured.'); return supabase.auth.signInAnonymously(); }
export async function signInWithPassword(email: string, password: string) { if (!supabase) throw new Error('Supabase is not configured.'); const result = await supabase.auth.signInWithPassword({ email, password }); const displayName = result.data.user?.user_metadata?.display_name; if (result.data.user && displayName) await syncProfileDisplayName(result.data.user.id, displayName); return result; }
export async function signUpWithPassword(email: string, password: string, displayName: string) { if (!supabase) throw new Error('Supabase is not configured.'); const result = await supabase.auth.signUp({ email, password, options: { data: { display_name: cleanDisplayName(displayName) } } }); if (result.data.user) await syncProfileDisplayName(result.data.user.id, displayName); return result; }
export async function claimAnonymousAccount(email: string, password: string, displayName: string) { if (!supabase) throw new Error('Supabase is not configured.'); const result = await supabase.auth.updateUser({ email, password, data: { display_name: cleanDisplayName(displayName) } }); if (result.data.user) await syncProfileDisplayName(result.data.user.id, displayName); return result; }
export async function requestPasswordReset(email: string) { if (!supabase) throw new Error('Supabase is not configured.'); const appUrl = 'https://sprite-tracker-to-track-all-sprites.vercel.app/'; const redirectTo = typeof window === 'undefined' ? appUrl : window.location.hostname === 'tauri.localhost' ? appUrl : `${window.location.origin}${window.location.pathname}`; return supabase.auth.resetPasswordForEmail(email, { redirectTo }); }
export async function updatePassword(password: string) { if (!supabase) throw new Error('Supabase is not configured.'); return supabase.auth.updateUser({ password }); }
export async function signOut() { if (!supabase) return; return supabase.auth.signOut(); }
export async function getSession(): Promise<{ session: Session | null; user: User | null }> {
  if (!supabase) return { session: null, user: null };
  const initial = await supabase.auth.getSession();
  if (initial.error) throw initial.error;
  if (!initial.data.session) return { session: null, user: null };
  // A fresh access token on launch prevents a sleeping desktop app from using a stale session.
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) return { session: initial.data.session, user: initial.data.session.user };
  return { session: refreshed.data.session, user: refreshed.data.session.user };
}
export async function refreshCloudSession(): Promise<{ session: Session | null; user: User | null }> {
  if (!supabase) return { session: null, user: null };
  const result = await supabase.auth.refreshSession();
  if (result.error) throw result.error;
  return { session: result.data.session, user: result.data.session?.user ?? null };
}

export async function listTrackers(userId: string): Promise<CloudTracker[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('tracker_members').select('role, trackers!inner(id,owner_id,name,description,visibility)').eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row: any) => ({ ...row.trackers, role: row.role }));
}

export async function ensureDefaultTracker(userId: string): Promise<CloudTracker> {
  const existing = await listTrackers(userId);
  if (existing[0]) return existing[0];
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('trackers').insert({ owner_id: userId, name: 'My EMX Tracker', description: 'My personal Fortnite Sprite collection.' }).select().single();
  if (error) throw error;
  return { ...data, role: 'owner' };
}

export async function createTracker(userId: string, name: string, description = ''): Promise<CloudTracker> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('trackers').insert({ owner_id: userId, name, description }).select().single();
  if (error) throw error;
  return { ...data, role: 'owner' };
}

export async function updateTracker(id: string, patch: Partial<Pick<CloudTracker, 'name' | 'description' | 'visibility'>>) { if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.from('trackers').update(patch).eq('id', id); if (error) throw error; }
export async function deleteTracker(id: string) { if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.from('trackers').delete().eq('id', id); if (error) throw error; }

export async function loadProgress(trackerId: string, userId: string): Promise<Record<string, CloudProgress>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('sprite_progress').select('sprite_id,owned,mastered,favorite,notes').eq('tracker_id', trackerId).eq('user_id', userId);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row) => [row.sprite_id, { owned: row.owned, mastered: row.mastered, favorite: row.favorite, notes: row.notes }]));
}

export async function saveProgress(trackerId: string, userId: string, progress: Record<string, CloudProgress>) {
  if (!supabase) return;
  const updatedAt = new Date().toISOString();
  const rows = Object.entries(progress).map(([sprite_id, value]) => ({ tracker_id: trackerId, user_id: userId, sprite_id, owned: Boolean(value.owned), mastered: Boolean(value.mastered), favorite: Boolean(value.favorite), notes: value.notes || '', updated_by: userId, updated_at: updatedAt }));
  if (!rows.length) return;
  const { error } = await supabase.from('sprite_progress').upsert(rows, { onConflict: 'tracker_id,user_id,sprite_id' });
  if (error) throw error;
}

export async function saveAchievements(trackerId: string, userId: string, achievements: Array<{ id: string; reward: number }>) {
  if (!supabase || !achievements.length) return;
  const rows = achievements.map((achievement) => ({ tracker_id: trackerId, user_id: userId, achievement_id: achievement.id, xp_awarded: achievement.reward }));
  const { error } = await supabase.from('user_tracker_achievements').upsert(rows, { onConflict: 'tracker_id,user_id,achievement_id' });
  if (error) throw error;
}

export async function setLeaderboardTracker(userId: string, trackerId: string) {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').update({ leaderboard_tracker_id: trackerId }).eq('id', userId);
  if (error) throw error;
}

async function sha256(value: string) { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', bytes); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function randomCode() { const bytes = new Uint8Array(24); crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export async function createInvite(trackerId: string, userId: string, role: 'editor' | 'viewer') { if (!supabase) throw new Error('Supabase is not configured.'); const code = randomCode(); const { error } = await supabase.from('tracker_invites').insert({ tracker_id: trackerId, created_by: userId, role, invite_code_hash: await sha256(code) }); if (error) throw error; return `${window.location.origin}/?invite=${code}`; }
export async function redeemInvite(code: string) { if (!supabase) throw new Error('Supabase is not configured.'); const { data, error } = await supabase.rpc('redeem_tracker_invite', { invite_code: code }); if (error) throw error; return data as string; }
export async function deleteAccount() { if (!supabase) throw new Error('Supabase is not configured.'); const { error } = await supabase.functions.invoke('delete-account', { body: {} }); if (error) throw error; await supabase.auth.signOut(); }
export async function getLeaderboard(limit = 50): Promise<LeaderboardRow[]> { if (!supabase) return []; const { data, error } = await supabase.rpc('get_emx_leaderboard', { requested_limit: limit }); if (error) throw error; return (data || []) as LeaderboardRow[]; }
export async function getProfile(userId: string) { if (!supabase) return null; const { data, error } = await supabase.from('profiles').select('username,display_name,avatar_color,leaderboard_opt_in,profile_badge,profile_title,avatar_frame').eq('id', userId).single(); if (error) throw error; return data; }
export async function updateLeaderboardOptIn(userId: string, enabled: boolean) { if (!supabase) return; const { error } = await supabase.from('profiles').update({ leaderboard_opt_in: enabled }).eq('id', userId); if (error) throw error; }
export async function updateProfileCosmetics(userId: string, cosmetics: { profile_badge: string; profile_title: string; avatar_frame: string }) { if (!supabase) return; const { error } = await supabase.from('profiles').update(cosmetics).eq('id', userId); if (error) throw error; }

export { isSupabaseConfigured, supabase };
