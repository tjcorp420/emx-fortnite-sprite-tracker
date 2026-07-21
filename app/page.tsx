'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import appInfo from '../package.json';
import bundledSprites from '../data/sprites.json';
import { claimAnonymousAccount, createInvite, createTracker, deleteAccount, deleteTracker, ensureDefaultTracker, getLeaderboard, getProfile, getSession, isSupabaseConfigured, listTrackers, loadProgress, redeemInvite, refreshCloudSession, requestPasswordReset, saveAchievements, saveProgress, setLeaderboardTracker, signInAnonymously, signInWithPassword, signOut, signUpWithPassword, supabase, updateLeaderboardOptIn, updatePassword, updateProfileCosmetics, updateTracker, type CloudTracker, type LeaderboardRow } from '../lib/cloud';

type Sprite = { id: string; name: string; type: string; variant: string; rarity: string; released: boolean; image: string; imageStatus: string; description: string; stats: string[]; abilities: string[]; effects: string[]; acquisition: string; spawnInfo: string; releaseDate: string; dataStatus?: string };
type Progress = Record<string, { owned?: boolean; mastered?: boolean; favorite?: boolean; notes?: string }>;
type AuthUser = { id: string; email?: string; is_anonymous?: boolean };
type Achievement = { id: string; title: string; description: string; icon: string; reward: number };
type SoundSettings = { effects: boolean; music: boolean };
type ProfileCosmetics = { profile_badge: string; profile_title: string; avatar_frame: string };
type CatalogAlert = { releases: string[]; verified: string[] };
type CosmeticOption = { id: string; label: string; unlockHint?: string; unlocked: (level: number, owned: number, mastered: number, achievements: Achievement[]) => boolean };
type LiveCatalog = { schema: number; updatedAt: string; patch?: string; indexedCount: number; releasedCount: number; sprites: Sprite[] };

const APP_VERSION = appInfo.version;

const STORAGE = 'emx-sprite-progress-v1';
const SEEN_ACHIEVEMENTS = 'emx-sprite-achievements-v1';
const SOUND_SETTINGS = 'emx-sprite-sound-settings-v1';
const PROFILE_COSMETICS = 'emx-sprite-profile-cosmetics-v1';
const CATALOG_SNAPSHOT = 'emx-sprite-catalog-snapshot-v1';
const LIVE_CATALOG_CACHE = 'emx-live-catalog-v1';
const LIVE_CATALOG_URL = 'https://raw.githubusercontent.com/tjcorp420/emx-fortnite-sprite-tracker/main/public/data/catalog-live.json';
const rarityOrder: Record<string, number> = { mythic: 5, legendary: 4, epic: 3, rare: 2, special: 1 };
const friendlySyncMessage = (message: string) => /jwt issued at future/i.test(message) ? 'Your saved cloud session was briefly out of sync. Your local collection is safe. Refresh the cloud connection to continue syncing.' : 'Cloud save could not connect right now. Your local collection remains safe on this device.';
const DEFAULT_COSMETICS: ProfileCosmetics = { profile_badge: 'spark', profile_title: 'Sprite Scout', avatar_frame: 'neon' };
const BADGE_IMAGES: Record<string, string> = {
  spark: '/badges/spark.png',
  collector: '/badges/collector.png',
  master: '/badges/master.png',
  legend: '/badges/legend.png',
  water: '/badges/water-crest.png',
  holo: '/badges/holo-prism.png',
  mastery: '/badges/mastery-flame.png',
  cosmic: '/badges/cosmic-vault.png',
};
const PROFILE_OPTIONS: { badges: CosmeticOption[]; titles: CosmeticOption[]; frames: CosmeticOption[] } = {
  badges: [
    { id: 'spark', label: 'First Spark', unlockHint: 'Starter badge', unlocked: () => true },
    { id: 'collector', label: 'Crystal Vault', unlockHint: 'Own 10 Sprites', unlocked: (_level: number, owned: number) => owned >= 10 },
    { id: 'water', label: 'Tidal Crest', unlockHint: 'Own every released Water Sprite', unlocked: (_level, _owned, _mastered, achievements) => achievements.some((item) => item.id === 'type-owned-Water') },
    { id: 'holo', label: 'Holo Prism', unlockHint: 'Own 5 Holofoil Sprites', unlocked: (_level, _owned, _mastered, achievements) => achievements.some((item) => item.id === 'holo-5') },
    { id: 'master', label: 'Volt Crown', unlockHint: 'Master 10 Sprites', unlocked: (_level: number, _owned: number, mastered: number) => mastered >= 10 },
    { id: 'mastery', label: 'Mastery Flame', unlockHint: 'Master 25 Sprites', unlocked: (_level, _owned, mastered) => mastered >= 25 },
    { id: 'cosmic', label: 'Cosmic Vault', unlockHint: 'Own 50 Sprites', unlocked: (_level, owned) => owned >= 50 },
    { id: 'legend', label: 'EMX Legend', unlockHint: 'Master every Sprite', unlocked: (_level: number, _owned: number, _mastered: number, achievements: Achievement[]) => achievements.some((item) => item.id === 'all-mastered') },
  ],
  titles: [
    { id: 'Sprite Scout', label: 'Sprite Scout', unlocked: () => true },
    { id: 'Collection Commander', label: 'Collection Commander', unlocked: (_level: number, owned: number) => owned >= 10 },
    { id: 'EMX Trainer', label: 'EMX Trainer', unlocked: (level: number) => level >= 5 },
    { id: 'Variant Hunter', label: 'Variant Hunter', unlocked: (_level, owned) => owned >= 25 },
    { id: 'Vault Architect', label: 'Vault Architect', unlocked: (_level, owned) => owned >= 50 },
    { id: 'Mastery Elite', label: 'Mastery Elite', unlocked: (_level, _owned, mastered) => mastered >= 25 },
    { id: 'Sprite Legend', label: 'Sprite Legend', unlocked: (_level: number, _owned: number, _mastered: number, achievements: Achievement[]) => achievements.some((item) => item.id === 'all-mastered') },
  ],
  frames: [
    { id: 'neon', label: 'Neon Core', unlocked: () => true },
    { id: 'volt', label: 'Volt Ring', unlocked: (level: number) => level >= 3 },
    { id: 'royal', label: 'Royal Charge', unlocked: (_level: number, _owned: number, mastered: number) => mastered >= 10 },
    { id: 'prism', label: 'Prism Surge', unlocked: (_level, owned) => owned >= 25 },
    { id: 'cosmic', label: 'Cosmic Reactor', unlocked: (level) => level >= 10 },
    { id: 'legend', label: 'Legend Crown', unlocked: (_level: number, _owned: number, _mastered: number, achievements: Achievement[]) => achievements.some((item) => item.id === 'all-mastered') },
  ],
};
const baseAchievements: Achievement[] = [
  { id: 'first-owned', title: 'First Find', description: 'Own your first Sprite.', icon: '*', reward: 50 },
  { id: 'first-mastered', title: 'Spark Master', description: 'Master your first Sprite.', icon: '+', reward: 100 },
  { id: 'owned-10', title: 'Growing Collection', description: 'Own 10 Sprites.', icon: '*', reward: 150 },
  { id: 'mastered-10', title: 'Dedicated Trainer', description: 'Master 10 Sprites.', icon: '#', reward: 300 },
  { id: 'owned-25', title: 'Variant Hunter', description: 'Own 25 Sprites.', icon: '*', reward: 300 },
  { id: 'mastered-25', title: 'Mastery Elite', description: 'Master 25 Sprites.', icon: '#', reward: 600 },
  { id: 'owned-50', title: 'Cosmic Collection', description: 'Own 50 Sprites.', icon: '*', reward: 750 },
  { id: 'holo-5', title: 'Holo Hunter', description: 'Own 5 released Holofoil Sprites.', icon: '+', reward: 500 },
  { id: 'all-owned', title: 'Full Squad', description: 'Own every Sprite in the catalog.', icon: '*', reward: 1000 },
  { id: 'all-mastered', title: 'Sprite Legend', description: 'Master every Sprite in the catalog.', icon: 'X', reward: 2500 },
];

function getAchievements(progress: Progress, catalog: Sprite[]): Achievement[] {
  const collectible = catalog.filter((sprite) => sprite.released);
  const owned = collectible.filter((s) => progress[s.id]?.owned).length;
  const mastered = collectible.filter((s) => progress[s.id]?.mastered).length;
  const unlocked = baseAchievements.filter((a) =>
    (a.id === 'first-owned' && owned >= 1) || (a.id === 'first-mastered' && mastered >= 1) ||
    (a.id === 'owned-10' && owned >= 10) || (a.id === 'mastered-10' && mastered >= 10) ||
    (a.id === 'owned-25' && owned >= 25) || (a.id === 'mastered-25' && mastered >= 25) ||
    (a.id === 'owned-50' && owned >= 50) ||
    (a.id === 'holo-5' && collectible.filter((sprite) => sprite.variant === 'Holofoil' && progress[sprite.id]?.owned).length >= 5) ||
    (a.id === 'all-owned' && owned === collectible.length) || (a.id === 'all-mastered' && mastered === collectible.length));
  Array.from(new Set(collectible.map((s) => s.type))).forEach((type) => {
    const items = collectible.filter((s) => s.type === type);
    if (items.every((s) => progress[s.id]?.owned)) unlocked.push({ id: `type-owned-${type}`, title: `${type} Collector`, description: `Own every ${type} Sprite.`, icon: '+', reward: 250 });
    if (items.every((s) => progress[s.id]?.mastered)) unlocked.push({ id: `type-mastered-${type}`, title: `${type} Master`, description: `Master every ${type} Sprite.`, icon: 'X', reward: 500 });
  });
  return unlocked;
}

export default function Home() {
  const [catalog, setCatalog] = useState<Sprite[]>(bundledSprites as Sprite[]);
  const [catalogStatus, setCatalogStatus] = useState<'bundled' | 'checking' | 'live' | 'offline'>('bundled');
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState('');
  const [progress, setProgress] = useState<Progress>({});
  const [selected, setSelected] = useState<Sprite | null>(null);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [variant, setVariant] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [status, setStatus] = useState('all');
  const [release, setRelease] = useState('all');
  const [sort, setSort] = useState('name');
  const [celebration, setCelebration] = useState<Achievement | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [trackers, setTrackers] = useState<CloudTracker[]>([]);
  const [activeTracker, setActiveTracker] = useState<CloudTracker | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'create'>('sign-in');
  const [syncStatus, setSyncStatus] = useState<'local' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'merge-needed' | 'error'>('local');
  const [syncError, setSyncError] = useState('');
  const [pendingCloud, setPendingCloud] = useState<Progress | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({ effects: false, music: false });
  const [profileCosmetics, setProfileCosmetics] = useState<ProfileCosmetics>(DEFAULT_COSMETICS);
  const [catalogAlert, setCatalogAlert] = useState<CatalogAlert | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [cloudRetry, setCloudRetry] = useState(0);
  const [activity, setActivity] = useState<{ title: string; detail: string; tone: 'collect' | 'master' | 'favorite' } | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const seenRef = useRef<string[]>([]);
  const loadedTrackerRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundLoadedRef = useRef(false);
  const activityTimerRef = useRef<number | null>(null);

  const acceptLiveCatalog = (payload: LiveCatalog) => {
    if (payload?.schema !== 1 || !Array.isArray(payload.sprites) || payload.sprites.length < 100 || payload.releasedCount < 60) throw new Error('Live catalog validation failed.');
    const clean = payload.sprites.filter((sprite) => sprite?.id && sprite?.name && Array.isArray(sprite.stats) && Array.isArray(sprite.abilities) && Array.isArray(sprite.effects));
    if (clean.length !== payload.sprites.length) throw new Error('Live catalog contains invalid entries.');
    setCatalog(clean);
    setCatalogUpdatedAt(payload.updatedAt || '');
    setCatalogStatus('live');
    localStorage.setItem(LIVE_CATALOG_CACHE, JSON.stringify(payload));
  };

  const refreshCatalog = async () => {
    setCatalogStatus('checking');
    let lastError: unknown;
    for (const url of [`${LIVE_CATALOG_URL}?v=${Date.now()}`, `/data/catalog-live.json?v=${Date.now()}`]) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
        acceptLiveCatalog(await response.json() as LiveCatalog);
        return;
      } catch (error) { lastError = error; }
    }
    setCatalogStatus('offline');
    if (!catalog.length) setCatalog(bundledSprites as Sprite[]);
    console.warn('EMX live catalog unavailable; using the last verified offline catalog.', lastError);
  };

  const playSound = (kind: 'collect' | 'master' | 'favorite' | 'interact' | 'achievement' | 'music', force = false) => {
    if (!force && ((kind === 'music' && !soundSettings.music) || (kind !== 'music' && !soundSettings.effects))) return;
    try {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtor) return;
      const context = audioContextRef.current || new AudioCtor();
      audioContextRef.current = context;
      const begin = () => {
        const notes: Record<typeof kind, [number, number, number]> = {
          collect: [523.25, 0.15, 0.055], master: [783.99, 0.25, 0.065], favorite: [659.25, 0.12, 0.04],
          interact: [440, 0.1, 0.035], achievement: [1046.5, 0.4, 0.085], music: [220, 2.6, 0.018],
        };
        const [frequency, duration, volume] = notes[kind];
        const frequencies = kind === 'music' ? [frequency, frequency * 1.25, frequency * 1.5] : [frequency];
        frequencies.forEach((tone, index) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = kind === 'music' ? 'sine' : 'triangle';
          oscillator.frequency.setValueAtTime(tone, context.currentTime);
          if (kind === 'achievement') oscillator.frequency.exponentialRampToValueAtTime(1567.98, context.currentTime + duration);
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(volume / (index + 1), context.currentTime + 0.02 + index * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(context.currentTime + index * 0.08);
          oscillator.stop(context.currentTime + duration + 0.05);
        });
      };
      if (context.state === 'suspended') void context.resume().then(begin); else begin();
    } catch { /* Audio is optional and should never interrupt tracking. */ }
  };

  useEffect(() => {
    try {
      setProgress(JSON.parse(localStorage.getItem(STORAGE) || '{}'));
      const cachedCatalog = JSON.parse(localStorage.getItem(LIVE_CATALOG_CACHE) || 'null');
      if (cachedCatalog) acceptLiveCatalog(cachedCatalog);
      const savedSeen = JSON.parse(localStorage.getItem(SEEN_ACHIEVEMENTS) || '[]');
      seenRef.current = Array.isArray(savedSeen) ? savedSeen : [];
      const savedSound = JSON.parse(localStorage.getItem(SOUND_SETTINGS) || '{}');
      if (typeof savedSound.effects === 'boolean' || typeof savedSound.music === 'boolean') setSoundSettings({ effects: Boolean(savedSound.effects), music: Boolean(savedSound.music) });
      const savedCosmetics = JSON.parse(localStorage.getItem(PROFILE_COSMETICS) || '{}');
      if (savedCosmetics.profile_badge && savedCosmetics.profile_title && savedCosmetics.avatar_frame) setProfileCosmetics(savedCosmetics);
    } catch { setProgress({}); }
    soundLoadedRef.current = true;
    setLocalReady(true);
  }, []);
  useEffect(() => { void refreshCatalog(); }, []);
  useEffect(() => { if (localReady) localStorage.setItem(STORAGE, JSON.stringify(progress)); }, [progress, localReady]);
  useEffect(() => { if (soundLoadedRef.current) localStorage.setItem(SOUND_SETTINGS, JSON.stringify(soundSettings)); }, [soundSettings]);
  useEffect(() => {
    if (!soundSettings.music) return;
    playSound('music');
    const timer = window.setInterval(() => playSound('music'), 9000);
    return () => window.clearInterval(timer);
  }, [soundSettings.music]);
  useEffect(() => {
    if (!localReady) return;
    const fresh = getAchievements(progress, catalog).find((item) => !seenRef.current.includes(item.id));
    if (fresh) { seenRef.current = [...seenRef.current, fresh.id]; localStorage.setItem(SEEN_ACHIEVEMENTS, JSON.stringify(seenRef.current)); playSound('achievement'); setCelebration(fresh); }
  }, [progress, localReady, catalog]);
  useEffect(() => {
    if (!localReady) return;
    const next = Object.fromEntries(catalog.map((sprite) => [sprite.id, {
      released: sprite.released,
      verified: sprite.dataStatus === 'verified' || sprite.imageStatus === 'verified',
      details: `${sprite.description}|${sprite.stats.join('|')}|${sprite.abilities.join('|')}|${sprite.effects.join('|')}`,
    }]));
    try {
      const previous = JSON.parse(localStorage.getItem(CATALOG_SNAPSHOT) || 'null');
      if (previous && typeof previous === 'object') {
        const releases = catalog.filter((sprite) => sprite.released && !previous[sprite.id]?.released).map((sprite) => sprite.name);
        const verified = catalog.filter((sprite) => {
          const nowVerified = sprite.dataStatus === 'verified' || sprite.imageStatus === 'verified';
          return nowVerified && previous[sprite.id] && (!previous[sprite.id].verified || previous[sprite.id].details !== next[sprite.id].details);
        }).map((sprite) => sprite.name);
        if (releases.length || verified.length) setCatalogAlert({ releases, verified });
      }
      localStorage.setItem(CATALOG_SNAPSHOT, JSON.stringify(next));
    } catch { localStorage.setItem(CATALOG_SNAPSHOT, JSON.stringify(next)); }
  }, [localReady, catalog]);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let mounted = true;
    setSyncStatus('connecting');
    getSession().then(async ({ user }) => {
      if (!mounted) return;
      if (user) setAuthUser({ id: user.id, email: user.email, is_anonymous: user.is_anonymous });
      else setSyncStatus('local');
    }).catch((error) => { if (mounted) { setSyncStatus('error'); setSyncError(error.message); } });
    const listener = supabase.auth.onAuthStateChange((event, session) => { if (!mounted) return; setAuthUser(session?.user ? { id: session.user.id, email: session.user.email, is_anonymous: session.user.is_anonymous } : null); if (event === 'PASSWORD_RECOVERY') { setPasswordRecovery(true); setAuthOpen(true); } });
    return () => { mounted = false; listener.data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const client = supabase;
    if (!isSupabaseConfigured || !client || typeof window === 'undefined') return;
    let cancelled = false;
    const resumePasswordRecovery = async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
      const code = url.searchParams.get('code');
      const isRecovery = url.searchParams.get('type') === 'recovery' || hash.get('type') === 'recovery';
      if (!code && !isRecovery) return;
      try {
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const accessToken = hash.get('access_token');
          const refreshToken = hash.get('refresh_token');
          if (!accessToken || !refreshToken) throw new Error('The recovery link is missing its secure session. Request a new password reset email.');
          const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
        }
        if (cancelled) return;
        setPasswordRecovery(true);
        setAuthOpen(true);
        url.searchParams.delete('code');
        url.searchParams.delete('type');
        url.hash = '';
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
      } catch (error: any) {
        if (!cancelled) { setSyncStatus('error'); setSyncError(error.message || 'This password recovery link is invalid or expired. Request a new one.'); }
      }
    };
    void resumePasswordRecovery();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    setSyncStatus('connecting');
    listTrackers(authUser.id).then(async (items) => {
      if (cancelled) return;
      const next = items.length ? items : [await ensureDefaultTracker(authUser.id)];
      setTrackers(next);
      setActiveTracker((current) => current && next.some((item) => item.id === current.id) ? current : next[0]);
    }).catch((error) => { if (!cancelled) { setSyncStatus('error'); setSyncError(error.message); } });
    return () => { cancelled = true; };
  }, [authUser?.id, cloudRetry]);
  useEffect(() => {
    if (!authUser || authUser.is_anonymous) { setLeaderboardOptIn(false); return; }
    getProfile(authUser.id).then((profile) => {
      setLeaderboardOptIn(Boolean(profile?.leaderboard_opt_in));
      if (profile) setProfileCosmetics({
        profile_badge: profile.profile_badge || DEFAULT_COSMETICS.profile_badge,
        profile_title: profile.profile_title || DEFAULT_COSMETICS.profile_title,
        avatar_frame: profile.avatar_frame || DEFAULT_COSMETICS.avatar_frame,
      });
    }).catch(() => setLeaderboardOptIn(false));
  }, [authUser?.id, authUser?.is_anonymous]);
  useEffect(() => {
    if (!authUser || !activeTracker || loadedTrackerRef.current === activeTracker.id) return;
    loadedTrackerRef.current = activeTracker.id;
    setCloudReady(false);
    loadProgress(activeTracker.id, authUser.id).then((cloud) => {
      const local = JSON.parse(localStorage.getItem(STORAGE) || '{}') as Progress;
      if (Object.keys(local).length && !localStorage.getItem(`emx-cloud-merged-${authUser.id}-${activeTracker.id}`)) { setPendingCloud(cloud); setSyncStatus('merge-needed'); }
      else { setProgress(cloud); setCloudReady(true); setSyncStatus('synced'); }
    }).catch((error) => { setSyncStatus('error'); setSyncError(error.message); });
  }, [authUser?.id, activeTracker?.id, cloudRetry]);
  useEffect(() => {
    if (!authUser || !activeTracker || !cloudReady) return;
    const timer = window.setTimeout(() => { setSyncStatus('syncing'); saveProgress(activeTracker.id, authUser.id, progress).then(async () => { await saveAchievements(activeTracker.id, authUser.id, unlockedAchievements); setSyncStatus(navigator.onLine ? 'synced' : 'offline'); }).catch((error) => { setSyncStatus('error'); setSyncError(error.message); }); }, 800);
    return () => window.clearTimeout(timer);
  }, [progress, authUser?.id, activeTracker?.id, cloudReady]);
  useEffect(() => { if (!authUser || authUser.is_anonymous || !activeTracker) return; setLeaderboardTracker(authUser.id, activeTracker.id).catch(() => undefined); }, [authUser?.id, authUser?.is_anonymous, activeTracker?.id]);
  useEffect(() => { const on = () => { if (!navigator.onLine) setSyncStatus('offline'); else if (syncStatus !== 'error') setSyncStatus(authUser ? 'synced' : 'local'); }; window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, [authUser, syncStatus]);

  const values = (key: keyof Sprite) => Array.from(new Set(catalog.map((s) => String(s[key])))).sort();
  const filtered = useMemo(() => catalog.filter((s) => {
    const p = progress[s.id] || {};
    return (!query || `${s.name} ${s.id}`.toLowerCase().includes(query.toLowerCase())) && (type === 'all' || s.type === type) && (variant === 'all' || s.variant === variant) && (rarity === 'all' || s.rarity === rarity) && (release === 'all' || (release === 'released' ? s.released : !s.released)) && (status === 'all' || (status === 'owned' ? p.owned : status === 'mastered' ? p.mastered : status === 'needs-mastering' ? p.owned && !p.mastered : status === 'favorites' ? p.favorite : !p.owned));
  }).sort((a, b) => sort === 'rarity' ? (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0) : sort === 'type' ? a.type.localeCompare(b.type) : a.name.localeCompare(b.name)), [catalog, query, type, variant, rarity, release, status, sort, progress]);
  const collectible = catalog.filter((sprite) => sprite.released);
  const owned = collectible.filter((s) => progress[s.id]?.owned).length;
  const mastered = collectible.filter((s) => progress[s.id]?.mastered).length;
  const unlockedAchievements = getAchievements(progress, catalog);
  const xp = owned * 25 + mastered * 100 + unlockedAchievements.reduce((sum, item) => sum + item.reward, 0);
  const level = Math.floor(xp / 500) + 1;
  const levelProgress = (xp % 500) / 500;
  const profileUnlocks = {
    badges: PROFILE_OPTIONS.badges.filter((option) => option.unlocked(level, owned, mastered, unlockedAchievements)).map((option) => option.id),
    titles: PROFILE_OPTIONS.titles.filter((option) => option.unlocked(level, owned, mastered, unlockedAchievements)).map((option) => option.id),
    frames: PROFILE_OPTIONS.frames.filter((option) => option.unlocked(level, owned, mastered, unlockedAchievements)).map((option) => option.id),
  };
  const update = (id: string, patch: Progress[string]) => {
    const current = progress[id] || {};
    const nextPatch = patch.mastered === true ? { ...patch, owned: true } : patch.owned === false ? { ...patch, mastered: false } : patch;
    const sprite = catalog.find((item) => item.id === id);
    const showActivity = (title: string, detail: string, tone: 'collect' | 'master' | 'favorite') => { if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current); setActivity({ title, detail, tone }); activityTimerRef.current = window.setTimeout(() => setActivity(null), 2200); };
    if (nextPatch.owned === true && !current.owned) playSound('collect');
    if (nextPatch.mastered === true && !current.mastered) playSound('master');
    if (nextPatch.favorite === true && !current.favorite) playSound('favorite');
    if (nextPatch.mastered !== undefined && nextPatch.mastered !== current.mastered) showActivity(nextPatch.mastered ? 'Mastery recorded' : 'Mastery removed', `${sprite?.name || 'Sprite'} ${nextPatch.mastered ? 'is mastered' : 'is no longer mastered'}`, 'master');
    else if (nextPatch.owned !== undefined && nextPatch.owned !== current.owned) showActivity(nextPatch.owned ? 'Sprite indexed' : 'Removed from collection', `${sprite?.name || 'Sprite'} ${nextPatch.owned ? 'is now owned' : 'is no longer marked owned'}`, 'collect');
    else if (nextPatch.favorite !== undefined && nextPatch.favorite !== current.favorite) showActivity(nextPatch.favorite ? 'Favorite saved' : 'Favorite removed', sprite?.name || 'Sprite', 'favorite');
    setProgress((items) => ({ ...items, [id]: { ...items[id], ...nextPatch } }));
  };
  const saveProfileCosmetics = async (patch: Partial<ProfileCosmetics>) => {
    const next = { ...profileCosmetics, ...patch };
    setProfileCosmetics(next);
    localStorage.setItem(PROFILE_COSMETICS, JSON.stringify(next));
    if (authUser && !authUser.is_anonymous) await updateProfileCosmetics(authUser.id, next);
  };
  const exportProgress = () => { const blob = new Blob([JSON.stringify({ app: 'EMX Fortnite Sprite Tracker', version: 1, progress }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'emx-sprite-progress.json'; a.click(); URL.revokeObjectURL(url); };
  const importProgress = (file?: File) => { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); if (!parsed.progress || typeof parsed.progress !== 'object') throw new Error(); setProgress(parsed.progress); } catch { alert('That progress file is not valid.'); } }; reader.readAsText(file); };
  const mergeProgress = async (useLocal: boolean) => { if (!pendingCloud || !authUser || !activeTracker) return; const local = JSON.parse(localStorage.getItem(STORAGE) || '{}') as Progress; const next = useLocal ? { ...pendingCloud, ...local } : pendingCloud; setProgress(next); setPendingCloud(null); setCloudReady(true); localStorage.setItem(`emx-cloud-merged-${authUser.id}-${activeTracker.id}`, '1'); try { await saveProgress(activeTracker.id, authUser.id, next); setSyncStatus('synced'); } catch (error: any) { setSyncStatus('error'); setSyncError(error.message); } };
  const handleSignOut = async () => { localStorage.setItem('emx-auth-signed-out', '1'); await signOut(); setAuthUser(null); setTrackers([]); setActiveTracker(null); setCloudReady(false); setSyncStatus('local'); };
  const continueAnonymous = async () => { localStorage.removeItem('emx-auth-signed-out'); setSyncStatus('connecting'); try { const result = await signInAnonymously(); if (result.data.user) { setAuthUser({ id: result.data.user.id, email: result.data.user.email, is_anonymous: result.data.user.is_anonymous }); setAuthOpen(false); } } catch (error: any) { setSyncStatus('error'); setSyncError(error.message); } };
  const retryCloudSync = async () => { if (!isSupabaseConfigured) return; setSyncStatus('connecting'); setSyncError(''); try { const { user } = await refreshCloudSession(); if (!user) throw new Error('Your cloud session needs you to sign in again.'); loadedTrackerRef.current = null; setCloudReady(false); setAuthUser({ id: user.id, email: user.email, is_anonymous: user.is_anonymous }); setCloudRetry((attempt) => attempt + 1); } catch (error: any) { setSyncStatus('error'); setSyncError(error.message || 'Cloud session refresh failed.'); } };
  const redeem = async (code: string) => { try { const id = await redeemInvite(code); const next = authUser ? await listTrackers(authUser.id) : []; setTrackers(next); setActiveTracker(next.find((item) => item.id === id) || next[0] || null); return true; } catch (error: any) { setSyncStatus('error'); setSyncError(error.message); return false; } };
  const openLeaderboard = async () => { setLeaderboardOpen(true); setLeaderboardLoading(true); try { setLeaderboard(await getLeaderboard(50)); } catch (error: any) { setSyncError(error.message); } finally { setLeaderboardLoading(false); } };

  return <main>
    <header className="topbar"><div className="brand"><img src="/branding/logo.png" alt="EMX Tweaks" /><div><span className="eyebrow">EMX TWEAKS</span><h1>FORTNITE SPRITES</h1></div></div><div className="header-actions"><span className="version-tag" title={`EMX build ${APP_VERSION}`}>v{APP_VERSION}</span><button className={`catalog-sync ${catalogStatus}`} onClick={refreshCatalog} disabled={catalogStatus === 'checking'} title={catalogUpdatedAt ? `Catalog updated ${new Date(catalogUpdatedAt).toLocaleString()}` : 'Refresh the EMX Sprite catalog'}><i />{catalogStatus === 'checking' ? 'Checking catalog' : catalogStatus === 'live' ? `${collectible.length} live` : catalogStatus === 'offline' ? 'Catalog offline' : 'Catalog'}</button><span className={`sync-pill ${syncStatus}`}><i />{syncStatus === 'synced' ? 'Cloud synced' : syncStatus === 'connecting' ? 'Connecting' : syncStatus === 'syncing' ? 'Syncing' : syncStatus === 'offline' ? 'Offline' : syncStatus === 'error' ? 'Sync issue' : isSupabaseConfigured ? 'Cloud ready' : 'Local mode'}</span><UpdateButton />{isSupabaseConfigured && <button className="leaderboard-button" onClick={openLeaderboard}>Leaderboard</button>}{authUser && <button className="ghost" onClick={() => setTrackerOpen(true)}>My Trackers</button>}<button className="account-button" onClick={() => setAuthOpen(true)}>{authUser ? (authUser.is_anonymous ? 'Anonymous' : 'Account') : 'Sign in'}</button><button className="ghost" onClick={() => setSelected(null)}>About</button></div></header>
    {!isSupabaseConfigured && <div className="cloud-notice">Cloud sync is optional. Add Supabase URL and anon key to enable accounts and sharing; local tracking still works normally.</div>}
    {syncStatus === 'error' && syncError && <div className="cloud-notice error sync-recovery"><div><strong>Cloud save needs attention</strong><span>{friendlySyncMessage(syncError)}</span></div><button onClick={retryCloudSync}>Refresh cloud</button><button className="dismiss-intel" onClick={() => { setSyncError(''); setSyncStatus('offline'); }}>Use offline</button></div>}
    {catalogAlert && <div className="catalog-alert"><div><strong>EMX Sprite Intel</strong><span>{catalogAlert.releases.length ? `${catalogAlert.releases.length} newly released` : ''}{catalogAlert.releases.length && catalogAlert.verified.length ? ' and ' : ''}{catalogAlert.verified.length ? `${catalogAlert.verified.length} verified or updated` : ''} Sprite {catalogAlert.releases.length + catalogAlert.verified.length === 1 ? 'entry' : 'entries'} added to your catalog.</span></div><button onClick={() => { setRelease('released'); setStatus('all'); document.querySelector('.toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>View intel</button><button className="dismiss-intel" aria-label="Dismiss Sprite Intel" onClick={() => setCatalogAlert(null)}>X</button></div>}
    <section className="hero"><div><p className="eyebrow accent">COLLECTION COMMAND CENTER</p><h2>Track every Sprite.<br /><span>Master the set.</span></h2><p className="muted">A personal, offline-first checklist with live EMX catalog intelligence.</p><div className="catalog-meta"><b>{collectible.length}</b> obtainable <span /> <b>{catalog.length}</b> indexed {catalogUpdatedAt && <><span /> Updated {new Date(catalogUpdatedAt).toLocaleDateString()}</>}</div></div><div className="stats"><Stat label="Owned" value={`${owned}/${collectible.length}`} percent={collectible.length ? owned / collectible.length : 0} /><Stat label="Mastered" value={`${mastered}/${collectible.length}`} percent={collectible.length ? mastered / collectible.length : 0} /></div></section>
    <section className="progress-hub"><div className="xp-card"><div className="xp-orb">{level}</div><div className="xp-copy"><span className="eyebrow accent">EMX TRAINER RANK</span><h3>Level {level} <span>&bull;</span> {xp.toLocaleString()} XP</h3><div className="xp-bar"><i style={{ width: `${Math.round(levelProgress * 100)}%` }} /></div><small>{500 - (xp % 500)} XP to next level</small></div></div><div className="achievement-summary"><span className="eyebrow">ACHIEVEMENTS</span><strong>{unlockedAchievements.length}</strong><small>unlocked</small><button onClick={() => document.getElementById('achievements')?.scrollIntoView({ behavior: 'smooth' })}>View rewards</button></div></section>
    {activeTracker && <div className="active-tracker"><span>TRACKER</span><strong>{activeTracker.name}</strong><em>{activeTracker.role || 'owner'}</em></div>}
    <section className="toolbar"><input aria-label="Search Sprites" placeholder="Search name or ID..." value={query} onChange={(e) => setQuery(e.target.value)} /><Select label="Type" value={type} setValue={setType} options={values('type')} /><Select label="Variant" value={variant} setValue={setVariant} options={values('variant')} /><Select label="Rarity" value={rarity} setValue={setRarity} options={values('rarity')} /><Select label="Status" value={status} setValue={setStatus} options={['owned', 'missing', 'needs-mastering', 'mastered', 'favorites']} /><Select label="Release" value={release} setValue={setRelease} options={['released', 'unreleased']} /><Select label="Sort" value={sort} setValue={setSort} options={['name', 'type', 'rarity']} /></section>
    <div className="quick-filters"><span>Quick view</span><button className={status === 'missing' ? 'active' : ''} onClick={() => setStatus(status === 'missing' ? 'all' : 'missing')}>Need to collect</button><button className={status === 'owned' ? 'active' : ''} onClick={() => setStatus(status === 'owned' ? 'all' : 'owned')}>Owned</button><button className={status === 'needs-mastering' ? 'active' : ''} onClick={() => setStatus(status === 'needs-mastering' ? 'all' : 'needs-mastering')}>Need to master</button><button className={status === 'mastered' ? 'active' : ''} onClick={() => setStatus(status === 'mastered' ? 'all' : 'mastered')}>Mastered</button><button className={status === 'favorites' ? 'active' : ''} onClick={() => setStatus(status === 'favorites' ? 'all' : 'favorites')}>Favorites</button><button onClick={() => { setStatus('all'); setRelease('released'); }}>Released only</button><button onClick={() => { setStatus('all'); setRelease('all'); setQuery(''); setType('all'); setVariant('all'); setRarity('all'); }}>Clear filters</button></div>
    <section className="actions"><span className="result-count">Showing <b>{filtered.length}</b> Sprites</span><div><button onClick={exportProgress}>Export</button><label className="button">Import<input type="file" accept="application/json" hidden onChange={(e) => importProgress(e.target.files?.[0])} /></label><button className="danger" onClick={() => confirm('Reset all EMX progress?') && setProgress({})}>Reset</button></div></section>
    <section className="achievements" id="achievements"><div className="section-heading"><div><p className="eyebrow accent">REWARD TRACK</p><h3>Achievements</h3></div><span>{unlockedAchievements.length} unlocked</span></div><div className="achievement-grid">{[...baseAchievements, ...Array.from(new Set(collectible.map((s) => s.type))).flatMap((item) => [{ id: `type-owned-${item}`, title: `${item} Collector`, description: `Own every released ${item} Sprite.`, icon: '+', reward: 250 }, { id: `type-mastered-${item}`, title: `${item} Master`, description: `Master every released ${item} Sprite.`, icon: 'X', reward: 500 }])].map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} unlocked={unlockedAchievements.some((item) => item.id === achievement.id)} />)}</div></section>
    <section className="grid">{filtered.map((sprite) => <SpriteCard key={sprite.id} sprite={sprite} progress={progress[sprite.id] || {}} update={update} onOpen={() => { playSound('interact'); setSelected(sprite); }} />)}</section>
    {!filtered.length && <div className="empty"><span>*</span><h3>No Sprites found</h3><p>Try changing your filters or search.</p></div>}
    <footer>EMX Fortnite Sprite Tracker <span>&bull;</span> Independent fan-made project <span>&bull;</span> Progress stays private</footer>
    {pendingCloud && <MergeModal merge={() => mergeProgress(true)} useCloud={() => mergeProgress(false)} />}
    {authOpen && <AuthModal user={authUser} recovery={passwordRecovery} finishRecovery={() => setPasswordRecovery(false)} leaderboardOptIn={leaderboardOptIn} setLeaderboardOptIn={async (enabled) => { if (authUser) { await updateLeaderboardOptIn(authUser.id, enabled); setLeaderboardOptIn(enabled); } }} cosmetics={profileCosmetics} unlocks={profileUnlocks} saveCosmetics={saveProfileCosmetics} soundSettings={soundSettings} setSoundSettings={setSoundSettings} testSound={(kind) => playSound(kind, true)} close={() => setAuthOpen(false)} continueAnonymous={continueAnonymous} onSignedIn={(user) => { setAuthUser(user); setAuthOpen(false); localStorage.removeItem('emx-auth-signed-out'); }} onSignedOut={handleSignOut} />}
    {trackerOpen && <TrackerModal trackers={trackers} active={activeTracker} user={authUser} close={() => setTrackerOpen(false)} select={(tracker) => { setActiveTracker(tracker); loadedTrackerRef.current = null; setTrackerOpen(false); }} create={async (name) => { if (!authUser) return; const tracker = await createTracker(authUser.id, name); setTrackers((items) => [...items, tracker]); setActiveTracker(tracker); loadedTrackerRef.current = null; }} share={async (role) => authUser && activeTracker ? createInvite(activeTracker.id, authUser.id, role) : ''} redeem={redeem} update={async (patch) => { if (!activeTracker) return; await updateTracker(activeTracker.id, patch); setActiveTracker({ ...activeTracker, ...patch }); setTrackers((items) => items.map((item) => item.id === activeTracker.id ? { ...item, ...patch } : item)); }} remove={async () => { if (!activeTracker) return; await deleteTracker(activeTracker.id); const next = trackers.filter((item) => item.id !== activeTracker.id); setTrackers(next); setActiveTracker(next[0] || null); loadedTrackerRef.current = null; }} />}
    {leaderboardOpen && <LeaderboardModal rows={leaderboard} loading={leaderboardLoading} optedIn={leaderboardOptIn} indexedCount={catalog.length} collectibleCount={collectible.length} close={() => setLeaderboardOpen(false)} />}
    {selected && <Preview sprite={selected} progress={progress[selected.id] || {}} update={update} sound={playSound} close={() => setSelected(null)} />}
    {celebration && <Celebration achievement={celebration} close={() => setCelebration(null)} />}
    {activity && <ActivityToast title={activity.title} detail={activity.detail} tone={activity.tone} />}
  </main>;
}

function Stat({ label, value, percent }: { label: string; value: string; percent: number }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><div className="bar"><i style={{ width: `${Math.round(percent * 100)}%` }} /></div><small>{Math.round(percent * 100)}% complete</small></div>; }
function optionLabel(option: string) { return option === 'all' ? 'All' : option === 'needs-mastering' ? 'Need to master' : option[0].toUpperCase() + option.slice(1); }
function EmxSelect({ label, value, setValue, options, includeAll = true, disabled = false }: { label: string; value: string; setValue: (value: string) => void; options: Array<string | { id: string; label: string }>; includeAll?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const items = [...(includeAll ? [{ id: 'all', label: 'All' }] : []), ...options.map((option) => typeof option === 'string' ? { id: option, label: optionLabel(option) } : option)];
  const current = items.find((item) => item.id === value) || items[0];
  useEffect(() => { const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); }; window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, []);
  return <div ref={rootRef} className={`select emx-select ${open ? 'is-open' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><button type="button" className="select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((shown) => !shown)}><small>{label}</small><span>{current?.label || value}</span><i aria-hidden="true" /></button>{open && <div className="select-menu" role="listbox" aria-label={label}>{items.map((item) => <button type="button" role="option" aria-selected={item.id === value} className={item.id === value ? 'selected' : ''} key={item.id} onClick={() => { setValue(item.id); setOpen(false); }}>{item.label}<b>{item.id === value ? '✓' : ''}</b></button>)}</div>}</div>;
}
function Select({ label, value, setValue, options }: { label: string; value: string; setValue: (value: string) => void; options: string[] }) { return <EmxSelect label={label} value={value} setValue={setValue} options={options} />; }
function sanitizeDisplayName(value: string) { return value.replace(/[^a-zA-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'EMX Trainer'; }
function UpdateButton() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingUpdate, setPendingUpdate] = useState<{ version: string; notes?: string } | null>(null);
  useEffect(() => { setIsDesktop(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window); }, []);
  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 5000); };
  const check = async () => {
    setBusy(true); setMessage('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const update = await invoke<{ version: string; currentVersion: string; notes?: string } | null>('check_for_update');
      if (!update) { notify('EMX is up to date.'); return; }
      setPendingUpdate({ version: update.version, notes: update.notes?.replace(/[#*_`]/g, '').trim().slice(0, 600) || '' });
    } catch (error: any) { notify(error.message || 'Could not check for updates.'); }
    finally { setBusy(false); }
  };
  const install = async () => {
    if (!pendingUpdate) return;
    setBusy(true);
    setMessage(`Installing EMX ${pendingUpdate.version}...`);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('install_update');
    } catch (error: any) { notify(error.message || 'Could not check for updates.'); }
    finally { setBusy(false); }
  };
  if (!isDesktop) return null;
  return <>{message && <span className="update-status" role="status">{message}</span>}<button className="update-button" onClick={check} disabled={busy}>{busy ? 'Checking...' : 'Check for updates'}</button>{pendingUpdate && <UpdateModal version={pendingUpdate.version} notes={pendingUpdate.notes} busy={busy} install={install} close={() => setPendingUpdate(null)} />}</>;
}
function AppPortal({ children }: { children: React.ReactNode }) { const [mounted, setMounted] = useState(false); useEffect(() => { setMounted(true); }, []); return mounted ? createPortal(children, document.body) : null; }
function UpdateModal({ version, notes, busy, install, close }: { version: string; notes?: string; busy: boolean; install: () => Promise<void>; close: () => void }) { return <AppPortal><div className="modal-backdrop update-backdrop" onClick={!busy ? close : undefined}><section className="update-modal" role="dialog" aria-modal="true" aria-labelledby="update-title" onClick={(event) => event.stopPropagation()}><button className="close-preview" onClick={close} disabled={busy} aria-label="Close update">X</button><img src="/branding/logo.png" alt="EMX" /><p className="eyebrow accent">EMX DESKTOP UPDATE</p><h2 id="update-title">Version {version}<br /><span>is ready.</span></h2><p className="muted">Your signed EMX update is ready to install. The app will close, update, and restart automatically.</p>{notes && <div className="update-notes"><span>WHAT&apos;S NEW</span><p>{notes}</p></div>}<div className="update-actions"><button className="ghost" onClick={close} disabled={busy}>Not now</button><button className="primary-action" onClick={install} disabled={busy}>{busy ? 'Installing update...' : 'Install and restart'}</button></div></section></div></AppPortal>; }

function AchievementCard({ achievement, unlocked }: { achievement: Achievement; unlocked: boolean }) { return <article className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}><div className="achievement-icon">{unlocked ? achievement.icon : '!'}</div><div><h4>{achievement.title}</h4><p>{achievement.description}</p><small>+{achievement.reward} XP</small></div></article>; }
function ActivityToast({ title, detail, tone }: { title: string; detail: string; tone: 'collect' | 'master' | 'favorite' }) { return <aside className={`activity-toast ${tone}`} role="status"><span className="toast-orb" /><div><strong>{title}</strong><small>{detail}</small></div></aside>; }
function Celebration({ achievement, close }: { achievement: Achievement; close: () => void }) { return <div className="celebration-backdrop" onClick={close}><div className="celebration" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="confetti">*  *  *  *  *</div><div className="celebration-icon">{achievement.icon}</div><p className="eyebrow accent">ACHIEVEMENT UNLOCKED</p><h2>{achievement.title}</h2><p>{achievement.description}</p><strong>+{achievement.reward} XP</strong><button onClick={close}>Continue</button></div></div>; }

function CollectionToggle({ label, checked, onChange, compact = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; compact?: boolean }) { const [burst, setBurst] = useState(false); const toggle = () => { setBurst(false); window.requestAnimationFrame(() => setBurst(true)); onChange(!checked); window.setTimeout(() => setBurst(false), 520); }; return <label className={`emx-toggle ${checked ? 'is-on' : ''} ${burst ? 'is-bursting' : ''} ${compact ? 'compact' : ''}`} onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked} onChange={toggle} /><span className="toggle-track" aria-hidden="true"><i /></span><span>{label}</span><b>{checked ? 'ON' : 'OFF'}</b></label>; }

function SpriteCard({ sprite, progress, update, onOpen }: { sprite: Sprite; progress: Progress[string]; update: (id: string, patch: Progress[string]) => void; onOpen: () => void }) { return <article className={`card ${progress.owned ? 'is-owned' : ''} ${!sprite.released ? 'is-unreleased' : ''}`} onClick={(event) => { if (!(event.target as HTMLElement).closest('input,button,textarea,label')) onOpen(); }} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen()}><div className="sprite-art"><img src={sprite.image} alt={sprite.name} /><span className={`rarity ${sprite.rarity}`}>{sprite.rarity}</span><button className={`favorite ${progress.favorite ? 'active' : ''}`} aria-label={`Favorite ${sprite.name}`} onClick={(event) => { event.stopPropagation(); update(sprite.id, { favorite: !progress.favorite }); }}>*</button></div><div className="card-body"><div className="card-title"><div><h3>{sprite.name}</h3><small>{sprite.id}</small></div><span className="type">{sprite.type}</span></div><div className="chips"><span>{sprite.variant}</span><span>{sprite.released ? 'Released' : 'Unreleased'}</span>{sprite.imageStatus !== 'verified' && <span className="verify">{sprite.released ? 'Verify image' : 'Outline'}</span>}{sprite.dataStatus === 'verified' && <span className="verified-data">Verified data</span>}</div><p className="card-description">{sprite.description || (sprite.released ? 'Information not documented.' : 'Official artwork is not available yet.')}</p><div className="checks"><CollectionToggle label="Owned" checked={!!progress.owned} onChange={(owned) => update(sprite.id, { owned })} /><CollectionToggle label="Mastered" checked={!!progress.mastered} onChange={(mastered) => update(sprite.id, { mastered })} /></div><input className="notes" aria-label={`Notes for ${sprite.name}`} placeholder="Add a note..." value={progress.notes || ''} onClick={(event) => event.stopPropagation()} onChange={(event) => update(sprite.id, { notes: event.target.value })} /></div></article>; }

function Preview({ sprite, progress, update, sound, close }: { sprite: Sprite; progress: Progress[string]; update: (id: string, patch: Progress[string]) => void; sound: (kind: 'interact') => void; close: () => void }) { const closeRef = useRef<HTMLButtonElement>(null); const [playing, setPlaying] = useState(false); const [reaction, setReaction] = useState(''); useEffect(() => { closeRef.current?.focus(); }, []); const interact = () => { sound('interact'); setReaction(['Sparkly!', 'Cute!', 'Sprite activated!', 'EMX energy!'][Math.floor(Math.random() * 4)]); setPlaying(false); window.setTimeout(() => setPlaying(true), 20); window.setTimeout(() => setPlaying(false), 950); }; const list = (items: string[]) => items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="unknown">Not documented.</p>; return <div className="modal-backdrop" onClick={close}><div className="preview-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button ref={closeRef} className="close-preview" onClick={close} aria-label="Exit preview">X</button><div className={'preview-art ' + (playing ? 'is-playing' : '')} role="button" tabIndex={0} aria-label={'Interact with ' + sprite.name} onClick={interact} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); interact(); } }}><span className="sprite-sparkles" aria-hidden="true">&#10022; &#10023; &#10022;</span><img src={sprite.image} alt={sprite.name} /><strong className={'sprite-reaction ' + (playing ? 'show' : '')}>{reaction}</strong><small className="sprite-hint">Click the Sprite to interact</small></div><div className="preview-info"><div className="preview-kicker">{sprite.type} <span>&bull;</span> {sprite.variant}</div><h2>{sprite.name}</h2><div className="preview-badges"><span className={'rarity ' + sprite.rarity}>{sprite.rarity}</span><span>{sprite.released ? 'Released' : 'Unreleased'}</span>{sprite.dataStatus === 'verified' && <span>Verified details</span>}</div><p className="preview-description">{sprite.description || (sprite.released ? 'Description not documented.' : 'This Sprite does not have official released artwork yet.')}</p><div className="detail-columns"><div><h4>Stats</h4>{list(sprite.stats)}</div><div><h4>Abilities and effects</h4>{list([...sprite.abilities, ...sprite.effects])}</div></div><p className="detail-line"><b>Acquisition:</b> {sprite.acquisition || 'Not documented.'}</p><p className="detail-line"><b>Location:</b> {sprite.spawnInfo || 'Not documented.'}</p><div className="preview-controls"><CollectionToggle label="Owned" checked={!!progress.owned} onChange={(owned) => update(sprite.id, { owned })} compact /><CollectionToggle label="Mastered" checked={!!progress.mastered} onChange={(mastered) => update(sprite.id, { mastered })} compact /></div><input className="notes" aria-label={'Notes for ' + sprite.name} placeholder="Add a personal note..." value={progress.notes || ''} onChange={(event) => update(sprite.id, { notes: event.target.value })} /><button className="exit-button" onClick={close}>Exit Preview</button></div></div></div>; }

function LeaderboardModal({ rows, loading, optedIn, indexedCount, collectibleCount, close }: { rows: LeaderboardRow[]; loading: boolean; optedIn: boolean; indexedCount: number; collectibleCount: number; close: () => void }) { return <div className="modal-backdrop" onClick={close}><div className="leaderboard-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="close-preview" onClick={close} aria-label="Close leaderboard">X</button><div className="section-heading"><div><p className="eyebrow accent">EMX COMMUNITY</p><h2>Leaderboard</h2></div><span>{optedIn ? 'You are visible' : 'Hidden from rankings'}</span></div><p className="muted leaderboard-intro">Accounts are ranked from saved Owned, Mastered, and Achievement XP. Anonymous saves stay private. Use Account to hide or show your stats.</p>{loading ? <div className="leaderboard-empty">Loading rankings...</div> : rows.length ? <div className="leaderboard-list">{rows.map((row) => <div className={`leaderboard-row ${row.rank <= 3 ? 'top-rank' : ''}`} key={row.user_id}><strong className="rank">{row.rank}</strong><span className={`avatar avatar-frame-${row.avatar_frame || 'neon'}`} style={{ background: row.avatar_color }} title={row.profile_badge || 'EMX Trainer'}><img src={BADGE_IMAGES[row.profile_badge] || BADGE_IMAGES.spark} alt="" /></span><div className="rank-name"><b>{row.display_name}</b><small className="profile-title">{row.profile_title || 'Sprite Scout'}</small><small>Level {row.level} &bull; {row.owned_count}/{collectibleCount} owned &bull; {row.mastered_count}/{collectibleCount} mastered</small></div><div className="rank-score"><b>{row.xp.toLocaleString()} XP</b><small>{collectibleCount ? ((row.mastered_count / collectibleCount) * 100).toFixed(1) : '0.0'}% mastered</small></div></div>)}</div> : <div className="leaderboard-empty"><strong>No public rankings yet.</strong><span>Create or claim an EMX account, then keep &quot;Show my stats on the public leaderboard&quot; enabled in Account.</span></div>}<div className="leaderboard-legend"><span><b>25 XP</b> owned</span><span><b>100 XP</b> mastered</span><span><b>{collectibleCount}</b> obtainable</span><span><b>{indexedCount}</b> indexed</span></div></div></div>; }

function AuthModal({ user, recovery, finishRecovery, leaderboardOptIn, setLeaderboardOptIn, cosmetics, unlocks, saveCosmetics, soundSettings, setSoundSettings, testSound, close, continueAnonymous, onSignedIn, onSignedOut }: { user: AuthUser | null; recovery: boolean; finishRecovery: () => void; leaderboardOptIn: boolean; setLeaderboardOptIn: (enabled: boolean) => Promise<void>; cosmetics: ProfileCosmetics; unlocks: { badges: string[]; titles: string[]; frames: string[] }; saveCosmetics: (patch: Partial<ProfileCosmetics>) => Promise<void>; soundSettings: SoundSettings; setSoundSettings: (settings: SoundSettings) => void; testSound: (kind: 'interact' | 'music') => void; close: () => void; continueAnonymous: () => Promise<void>; onSignedIn: (user: AuthUser) => void; onSignedOut: () => Promise<void> }) {
  const [mode, setMode] = useState<'sign-in' | 'create' | 'claim' | 'reset' | 'new-password'>(recovery ? 'new-password' : user?.is_anonymous ? 'claim' : 'sign-in'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try {
    if (mode === 'reset') { const result = await requestPasswordReset(email); if (result.error) throw result.error; setMessage('Recovery request accepted. Check your inbox and spam folder, then open the link on this device to choose a new password.'); return; }
    if (mode === 'new-password') { const result = await updatePassword(password); if (result.error) throw result.error; finishRecovery(); setMode('sign-in'); setMessage('Password updated. Your EMX account is ready.'); return; }
    const result = mode === 'claim' ? await claimAnonymousAccount(email, password, sanitizeDisplayName(displayName)) : mode === 'create' ? await signUpWithPassword(email, password, sanitizeDisplayName(displayName)) : await signInWithPassword(email, password); if (result.error) throw result.error; if (result.data.user) onSignedIn({ id: result.data.user.id, email: result.data.user.email, is_anonymous: result.data.user.is_anonymous }); else setMessage('Check your email to finish creating the account.');
  } catch (err: any) { setError(err.message || 'Authentication failed.'); } finally { setBusy(false); } };
  const removeAccount = async () => { if (!confirm('Delete your EMX account and cloud progress permanently?')) return; setBusy(true); try { await deleteAccount(); await onSignedOut(); close(); } catch (err: any) { setError(err.message || 'Deploy the Supabase delete-account function before using this.'); } finally { setBusy(false); } };
  let body;
  if (!isSupabaseConfigured) body = <><h2>Cloud is not configured</h2><p className="muted">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable accounts and sharing. Local tracking remains available.</p></>;
  else if (mode === 'reset') body = <><h2>Reset password</h2><p className="muted">Enter your EMX account email. We will request a secure recovery link.</p><form onSubmit={submit}><input required type="email" autoComplete="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} /><button className="primary-action" disabled={busy}>{busy ? 'Sending...' : 'Send reset email'}</button></form><p className="tiny-note">Check spam too. Email delivery is handled by the EMX Supabase mail provider.</p><button className="auth-link" onClick={() => setMode('sign-in')}>Back to sign in</button></>;
  else if (mode === 'new-password') body = <><h2>Choose a new password</h2><p className="muted">Your recovery link is verified. Set a new password for your EMX account.</p><form onSubmit={submit}><input required minLength={8} type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary-action" disabled={busy}>{busy ? 'Saving...' : 'Update password'}</button></form></>;
  else if (user?.is_anonymous) body = <><div className="auth-tabs"><button className={mode === 'claim' ? 'active' : ''} onClick={() => setMode('claim')}>Claim progress</button><button className={mode === 'sign-in' ? 'active' : ''} onClick={() => setMode('sign-in')}>Sign in</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button></div>{mode === 'claim' ? <><h2>Claim your progress</h2><p className="muted">Your anonymous collection is safe on this device. Add an account to use it everywhere.</p><AuthForm mode="claim" email={email} password={password} displayName={displayName} setEmail={setEmail} setPassword={setPassword} setDisplayName={setDisplayName} submit={submit} busy={busy} /></> : <><h2>{mode === 'create' ? 'Create your save' : 'Welcome back'}</h2><p className="muted">No Epic login. Use your EMX email and password to access an existing account.</p><AuthForm mode={mode} email={email} password={password} displayName={displayName} setEmail={setEmail} setPassword={setPassword} setDisplayName={setDisplayName} submit={submit} busy={busy} />{mode === 'sign-in' && <button className="auth-link" onClick={() => setMode('reset')}>Forgot your password?</button>}</>}</>;
  else if (user) body = <><h2>Your EMX account</h2><p className="muted">Signed in securely. Your tracker can sync across phone, browser, and Windows.</p><ProfileLoadout cosmetics={cosmetics} unlocks={unlocks} save={saveCosmetics} /><div className="leaderboard-opt"><CollectionToggle label="Public leaderboard" checked={leaderboardOptIn} onChange={(enabled) => setLeaderboardOptIn(enabled)} /><span>Show your public collection totals and XP.</span></div><p className="tiny-note">Enabled by default for account users. Only your display name, XP, level, and collection totals appear. Your email, notes, and Sprite details stay private.</p><button className="auth-link" onClick={() => { setEmail(user.email || ''); setMode('reset'); }}>Change password</button><button className="primary-action" onClick={onSignedOut}>Sign out</button><button className="danger account-delete" onClick={removeAccount} disabled={busy}>Delete account</button></>;
  else body = <><div className="auth-tabs"><button className={mode === 'sign-in' ? 'active' : ''} onClick={() => setMode('sign-in')}>Sign in</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Create account</button></div><h2>{mode === 'create' ? 'Create your save' : 'Welcome back'}</h2><p className="muted">No Epic login. Use an EMX account or continue anonymously.</p><AuthForm mode={mode as 'sign-in' | 'create'} email={email} password={password} displayName={displayName} setEmail={setEmail} setPassword={setPassword} setDisplayName={setDisplayName} submit={submit} busy={busy} />{mode === 'sign-in' && <button className="auth-link" onClick={() => setMode('reset')}>Forgot your password?</button>}<button className="anonymous-action" onClick={continueAnonymous}>Continue anonymously</button></>;
  return <div className="modal-backdrop" onClick={close}><div className="account-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="close-preview" onClick={close} aria-label="Close account">X</button><img src="/branding/logo.png" alt="EMX" /><p className="eyebrow accent">EMX CLOUD SAVE</p>{body}{user && mode !== 'reset' && mode !== 'new-password' && <SoundPreferences settings={soundSettings} setSettings={setSoundSettings} testSound={testSound} />}{error && <p className="form-error">{error}</p>}{message && <p className="form-success">{message}</p>}</div></div>;
}
function ProfileLoadout({ cosmetics, unlocks, save }: { cosmetics: ProfileCosmetics; unlocks: { badges: string[]; titles: string[]; frames: string[] }; save: (patch: Partial<ProfileCosmetics>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const choose = async (patch: Partial<ProfileCosmetics>) => { setSaving(true); try { await save(patch); } finally { setSaving(false); } };
  return <section className="profile-loadout"><div><p className="eyebrow accent">EMX PROFILE LOADOUT</p><span>Equip your unlocked image badge, title, and leaderboard frame.</span></div><div className="badge-gallery">{PROFILE_OPTIONS.badges.map((badge) => { const unlocked = unlocks.badges.includes(badge.id); const selected = cosmetics.profile_badge === badge.id; return <button type="button" key={badge.id} className={`badge-choice ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} disabled={!unlocked || saving} onClick={() => choose({ profile_badge: badge.id })}><img src={BADGE_IMAGES[badge.id]} alt="" /><span>{badge.label}</span><small>{unlocked ? (selected ? 'Equipped' : 'Unlocked') : badge.unlockHint}</small></button>; })}</div><p className="reward-hint">More rewards unlock at 25 mastered, 50 owned, Holofoil milestones, and full released-family completion.</p><CosmeticChoices label="Title" value={cosmetics.profile_title} options={PROFILE_OPTIONS.titles.map((item) => ({ id: item.id, label: item.label }))} unlocked={unlocks.titles} onChoose={(profile_title) => choose({ profile_title })} disabled={saving} /><CosmeticChoices label="Frame" value={cosmetics.avatar_frame} options={PROFILE_OPTIONS.frames.map((item) => ({ id: item.id, label: item.label }))} unlocked={unlocks.frames} onChoose={(avatar_frame) => choose({ avatar_frame })} disabled={saving} /></section>;
}
function CosmeticChoices({ label, value, options, unlocked, onChoose, disabled }: { label: string; value: string; options: Array<{ id: string; label: string }>; unlocked: string[]; onChoose: (value: string) => void; disabled: boolean }) { return <div className="cosmetic-choice"><EmxSelect label={label} value={value} disabled={disabled} includeAll={false} setValue={onChoose} options={options.filter((option) => unlocked.includes(option.id))} /></div>; }
function SoundPreferences({ settings, setSettings, testSound }: { settings: SoundSettings; setSettings: (settings: SoundSettings) => void; testSound: (kind: 'interact' | 'music') => void }) { return <section className="sound-preferences"><div className="audio-heading"><p className="eyebrow accent">EMX AUDIO</p><button type="button" className="audio-test" onClick={() => testSound('interact')}>Test sound</button></div><CollectionToggle label="Interaction sound effects" checked={settings.effects} onChange={(effects) => { setSettings({ ...settings, effects }); if (effects) testSound('interact'); }} /><CollectionToggle label="Ambient EMX music" checked={settings.music} onChange={(music) => { setSettings({ ...settings, music }); if (music) testSound('music'); }} /><small>Generated inside the app. Mobile browsers start audio after your first tap.</small></section>; }
function AuthForm({ mode, email, password, displayName, setEmail, setPassword, setDisplayName, submit, busy }: { mode: 'sign-in' | 'create' | 'claim'; email: string; password: string; displayName: string; setEmail: (value: string) => void; setPassword: (value: string) => void; setDisplayName: (value: string) => void; submit: (event: React.FormEvent) => Promise<void>; busy: boolean }) { return <form onSubmit={submit}>{mode !== 'sign-in' && <input required minLength={3} maxLength={24} autoComplete="nickname" placeholder="Public display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />}<input required type="email" inputMode="email" autoCapitalize="none" autoComplete="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} /><input required minLength={8} type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="Password (8+ characters)" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary-action" disabled={busy}>{busy ? 'Working...' : mode === 'claim' ? 'Claim my progress' : mode === 'create' ? 'Create account' : 'Sign in'}</button></form>; }
function MergeModal({ merge, useCloud }: { merge: () => Promise<void>; useCloud: () => Promise<void> }) { return <div className="modal-backdrop"><div className="account-modal merge-modal" role="dialog" aria-modal="true"><p className="eyebrow accent">CLOUD SAVE FOUND</p><h2>Merge your progress?</h2><p className="muted">This device has local progress and the cloud tracker has saved progress. Local progress will not be deleted automatically.</p><div className="merge-actions"><button onClick={useCloud}>Use cloud save</button><button className="primary-action" onClick={merge}>Merge local and cloud</button></div></div></div>; }

function TrackerModal({ trackers, active, user, close, select, create, share, redeem, update, remove }: { trackers: CloudTracker[]; active: CloudTracker | null; user: AuthUser | null; close: () => void; select: (tracker: CloudTracker) => void; create: (name: string) => Promise<void>; share: (role: 'editor' | 'viewer') => Promise<string>; redeem: (code: string) => Promise<boolean>; update: (patch: Partial<Pick<CloudTracker, 'name' | 'description' | 'visibility'>>) => Promise<void>; remove: () => Promise<void> }) { const [newName, setNewName] = useState(''); const [role, setRole] = useState<'editor' | 'viewer'>('viewer'); const [inviteLink, setInviteLink] = useState(''); const [inviteCode, setInviteCode] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const makeInvite = async () => { setBusy(true); try { const link = await share(role); setInviteLink(link); await navigator.clipboard?.writeText(link); setMessage('Invite link copied.'); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } }; const join = async () => { setBusy(true); const code = inviteCode.includes('invite=') ? inviteCode.split('invite=')[1].split('&')[0] : inviteCode; if (await redeem(code)) setMessage('Joined tracker successfully.'); setBusy(false); }; return <div className="modal-backdrop" onClick={close}><div className="tracker-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><button className="close-preview" onClick={close} aria-label="Close trackers">X</button><div className="section-heading"><div><p className="eyebrow accent">CLOUD COLLECTIONS</p><h2>My Trackers</h2></div><span>{trackers.length} total</span></div><div className="tracker-list">{trackers.map((tracker) => <button className={`tracker-row ${active?.id === tracker.id ? 'active' : ''}`} key={tracker.id} onClick={() => select(tracker)}><span>{tracker.name}</span><small>{tracker.role} - {tracker.visibility}</small></button>)}</div><div className="tracker-create"><input placeholder="New tracker name" value={newName} onChange={(event) => setNewName(event.target.value)} /><button onClick={async () => { if (newName.trim()) { await create(newName.trim()); setNewName(''); } }}>Create</button></div>{active && active.role !== 'viewer' && <div className="share-box"><h3>Share {active.name}</h3><select value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')}><option value="viewer">Viewer access</option><option value="editor">Editor access</option></select><button onClick={makeInvite} disabled={busy}>Create invite</button>{inviteLink && <input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} />}{message && <small>{message}</small>}<button onClick={() => update({ visibility: 'shared' })}>Make shared</button><button className="danger" onClick={remove}>Delete tracker</button></div>}<div className="join-box"><h3>Join a tracker</h3><input placeholder="Paste invite link or code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} /><button onClick={join} disabled={busy}>Join</button></div></div></div>; }
