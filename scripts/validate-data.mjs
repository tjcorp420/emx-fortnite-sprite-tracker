import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const sprites = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sprites.json'), 'utf8'));
const activeSeason = JSON.parse(fs.readFileSync(path.join(root, 'data', 'active-season.json'), 'utf8'));
const liveCatalog = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'catalog-live.json'), 'utf8'));
const types = new Set(['Water','Earth','Fire','Duck','Ghost','Dream','Demon','Punk','King','Zero Point','Fishy','Striker','Aura','Boss','Grim','Air','Seven','Peanut','John Wick','Batman','Pollo','Vini Jr.']);
const variants = new Set(['Base','Gold','Gummy','Galaxy','Gem','Holofoil','Cube','Quack','Cheat Master']);
const rarities = new Set(['rare','epic','legendary','mythic','special']);
const errors = [], warnings = [], seen = new Set();
if (!activeSeason.id || !activeSeason.label || Number.isNaN(Date.parse(activeSeason.startedAt))) errors.push('Active season manifest is invalid');
if (liveCatalog.schema !== 2 || !Array.isArray(liveCatalog.sprites)) errors.push('Live catalog schema is invalid');
if (!liveCatalog.activeSeason || liveCatalog.activeSeason.id !== activeSeason.id) errors.push('Live catalog is not stamped with the active season');
if (liveCatalog.indexedCount !== liveCatalog.sprites.length) errors.push('Live catalog indexed count does not match its records');
if (liveCatalog.releasedCount !== liveCatalog.sprites.filter((sprite) => sprite.released).length) errors.push('Live catalog released count does not match its records');
const liveCurrent = Array.isArray(liveCatalog.sprites) ? liveCatalog.sprites.filter((sprite) => sprite.released && sprite.seasonId === activeSeason.id) : [];
const legacySeasonCarryoverIds = new Set([
  'sprite-cube-batman-sprite', 'sprite-cube-boss-sprite', 'sprite-cube-dream-sprite',
  'sprite-cube-earth-sprite', 'sprite-cube-fire-sprite', 'sprite-cube-fishy-sprite',
  'sprite-cube-grim-sprite', 'sprite-cube-punk-sprite', 'sprite-cube-zero-point-sprite',
  'sprite-galaxy-llama-sprite', 'sprite-galaxy-peely-sprite',
  'sprite-gem-aura-sprite', 'sprite-gem-demon-sprite', 'sprite-gem-duck-sprite',
  'sprite-gem-earth-sprite', 'sprite-gem-grim-sprite', 'sprite-gem-llama-sprite',
  'sprite-gem-water-sprite', 'sprite-gem-zero-point-sprite',
  'sprite-gold-llama-sprite', 'sprite-gold-peely-sprite',
  'sprite-gummy-llama-sprite', 'sprite-gummy-peely-sprite',
  'sprite-holofoil-grim-sprite', 'sprite-holofoil-peely-sprite', 'sprite-holofoil-zero-point-sprite',
  'sprite-ironmouse-sprite', 'sprite-john-wick-sprite', 'sprite-llama-sprite',
  'sprite-peely-sprite', 'sprite-quack-earth-sprite', 'sprite-quack-fire-sprite',
  'sprite-quack-water-sprite', 'sprite-quack-zero-point-sprite',
]);
for (const sprite of liveCurrent) {
  if (legacySeasonCarryoverIds.has(sprite.id)) errors.push(`Legacy Sprite is incorrectly marked current-season: ${sprite.id}`);
}
if (!liveCurrent.length) errors.push('Live catalog has no released current-season Sprites');
for (const sprite of liveCurrent) {
  if (!sprite.id || !sprite.name || !sprite.image) errors.push(`Current-season Sprite is incomplete: ${sprite.id || sprite.name || 'unknown'}`);
  if (!/^https?:\/\//.test(sprite.image) && !fs.existsSync(path.join(root, 'public', sprite.image.replace(/^\//, '')))) errors.push(`Current-season Sprite is missing artwork: ${sprite.id}`);
}
for (const s of sprites) {
  if (seen.has(s.id)) errors.push(`Duplicate ID: ${s.id}`); seen.add(s.id);
  if (!s.name) errors.push(`${s.id}: missing name`);
  if (!types.has(s.type)) errors.push(`${s.id}: invalid type ${s.type}`);
  if (!variants.has(s.variant)) errors.push(`${s.id}: invalid variant ${s.variant}`);
  if (!rarities.has(s.rarity)) errors.push(`${s.id}: invalid rarity ${s.rarity}`);
  if (!s.image || s.image.startsWith('http')) errors.push(`${s.id}: image must be a local path`);
  else if (!fs.existsSync(path.join(root, 'public', s.image.replace(/^\//, '')))) errors.push(`${s.id}: missing image ${s.image}`);
  if (s.released && s.imageStatus !== 'verified') warnings.push(`${s.id}: released image/data verification required`);
  if (!s.released && s.imageStatus !== 'unreleased-outline') warnings.push(`${s.id}: unreleased item should use outline status`);
  if (!Array.isArray(s.stats) || !Array.isArray(s.abilities) || !Array.isArray(s.effects)) errors.push(`${s.id}: stats, abilities, and effects must be arrays`);
  if (s.released && (!s.description || !s.abilities.length || !s.stats.length)) errors.push(`${s.id}: released Sprite is missing verified details`);
}
console.log(`Sprite validation report\n========================\nOffline records: ${sprites.length}\nLive catalog records: ${liveCatalog.indexedCount}\nCurrent-season released: ${liveCurrent.length}\nVerified released: ${sprites.filter(s => s.released && s.imageStatus === 'verified').length}\nUnreleased outlines: ${sprites.filter(s => !s.released && s.imageStatus === 'unreleased-outline').length}\nReleased requiring verification: ${warnings.filter(w => w.includes('released')).length}\nMissing/invalid records: ${errors.length}`);
if (warnings.length) console.log(`\nWarnings:\n- ${warnings.join('\n- ')}`);
if (errors.length) { console.error(`\nErrors:\n- ${errors.join('\n- ')}`); process.exitCode = 1; }
