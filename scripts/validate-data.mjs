import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const sprites = JSON.parse(fs.readFileSync(path.join(root, 'data', 'sprites.json'), 'utf8'));
const types = new Set(['Water','Earth','Fire','Duck','Ghost','Dream','Demon','Punk','King','Zero Point','Fishy','Striker','Aura','Boss','Grim','Air','Seven','Peanut','John Wick','Batman','Pollo','Vini Jr.']);
const variants = new Set(['Base','Gold','Gummy','Galaxy','Gem','Holofoil','Cube','Quack']);
const rarities = new Set(['rare','epic','legendary','mythic','special']);
const errors = [], warnings = [], seen = new Set();
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
console.log(`Sprite validation report\n========================\nTotal records: ${sprites.length}\nVerified released: ${sprites.filter(s => s.released && s.imageStatus === 'verified').length}\nUnreleased outlines: ${sprites.filter(s => !s.released && s.imageStatus === 'unreleased-outline').length}\nReleased requiring verification: ${warnings.filter(w => w.includes('released')).length}\nMissing/invalid records: ${errors.length}`);
if (warnings.length) console.log(`\nWarnings:\n- ${warnings.join('\n- ')}`);
if (errors.length) { console.error(`\nErrors:\n- ${errors.join('\n- ')}`); process.exitCode = 1; }
