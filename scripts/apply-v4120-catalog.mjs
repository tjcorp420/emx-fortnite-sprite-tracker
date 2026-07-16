import fs from 'node:fs/promises';
import path from 'node:path';
import { enrichRecords } from './sprite-details.mjs';

const root = process.cwd();
const catalogPath = path.join(root, 'data', 'sprites.json');
const mapPath = path.join(root, 'data', 'image-map.json');
const livePath = path.join(root, 'public', 'data', 'catalog-live.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const imageMap = JSON.parse(await fs.readFile(mapPath, 'utf8'));

Object.assign(imageMap, {
  Batman: {
    Base: 'T_Icon_BR_FossilMeal_Default_L.webp',
    Gold: 'T_Icon_BR_FossilMeal_Gold_L.webp',
    Gummy: 'T_Icon_BR_FossilMeal_Candy_L.webp',
    Galaxy: 'T_Icon_BR_FossilMeal_Galaxy_L.webp',
    Gem: 'tmp_batman_gem.webp',
    Holofoil: 'T_Icon_BR_FossilMeal_Holofoil_L.webp',
    Cube: 'tmp_batman_cube.webp',
    Quack: 'tmp_batman_quack.webp',
  },
  Pollo: { Base: 'T_Icon_BR_CompanyStargazer_Default_L.webp' },
  'Vini Jr.': { Base: 'T_Icon_BR_CokeParmesan_Default_L.webp' },
});

const released = new Set([
  ...['Base', 'Gold', 'Gummy', 'Galaxy', 'Holofoil'].map((variant) => `Batman:${variant}`),
  ...['Base', 'Gold', 'Gummy', 'Galaxy', 'Holofoil'].map((variant) => `Air:${variant}`),
  ...['Base', 'Gold', 'Gummy', 'Galaxy', 'Holofoil'].map((variant) => `Seven:${variant}`),
]);

const updated = catalog.map((sprite) => {
  if (!released.has(`${sprite.type}:${sprite.variant}`)) return sprite;
  return {
    ...sprite,
    released: true,
    image: `/sprites/${sprite.id}.webp`,
    imageStatus: 'verified',
    dataStatus: 'verified',
  };
});

const additions = [
  {
    id: 'sprite-pollo-sprite', name: 'Pollo Sprite', type: 'Pollo', variant: 'Base', rarity: 'mythic', released: true,
    image: '/sprites/sprite-pollo-sprite.webp', imageStatus: 'verified', description: '', stats: [], abilities: [], effects: [],
    acquisition: '', spawnInfo: '', releaseDate: '2026-07-16', dataStatus: 'verified',
  },
  {
    id: 'sprite-vini-jr-sprite', name: 'Vini Jr. Sprite', type: 'Vini Jr.', variant: 'Base', rarity: 'mythic', released: true,
    image: '/sprites/sprite-vini-jr-sprite.webp', imageStatus: 'verified', description: '', stats: [], abilities: [], effects: [],
    acquisition: '', spawnInfo: '', releaseDate: '2026-07-16', dataStatus: 'verified',
  },
];

const merged = enrichRecords(Array.from(new Map([...updated, ...additions].map((sprite) => [sprite.id, sprite])).values()));
await fs.mkdir(path.dirname(livePath), { recursive: true });
await fs.writeFile(catalogPath, `${JSON.stringify(merged, null, 2)}\n`);
await fs.writeFile(mapPath, `${JSON.stringify(imageMap, null, 2)}\n`);
await fs.writeFile(livePath, `${JSON.stringify({
  schema: 1,
  updatedAt: '2026-07-16T16:45:00-04:00',
  patch: 'v41.20',
  indexedCount: merged.length,
  releasedCount: merged.filter((sprite) => sprite.released).length,
  sprites: merged,
}, null, 2)}\n`);
console.log(`Updated catalog: ${merged.filter((sprite) => sprite.released).length} released / ${merged.length} indexed.`);
