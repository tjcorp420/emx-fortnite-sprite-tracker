import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const livePath = path.join(root, 'public', 'data', 'catalog-live.json');
const bundledPath = path.join(root, 'data', 'sprites.json');
const imageDir = path.join(root, 'public', 'sprites');
const rawAssetRoot = 'https://raw.githubusercontent.com/tjcorp420/emx-fortnite-sprite-tracker/main/public/sprites';
const variants = ['Holofoil', 'Galaxy', 'Gummy', 'Gold', 'Gem', 'Cube', 'Quack'];

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function identity(linkName) {
  const baseName = linkName.trim();
  const variant = variants.find((item) => baseName.startsWith(`${item} `)) || 'Base';
  const familyName = variant === 'Base' ? baseName : baseName.slice(variant.length + 1);
  const name = baseName === 'Burnt Peanut' ? baseName : `${baseName} Sprite`;
  const type = baseName === 'Burnt Peanut' ? 'Peanut' : familyName;
  return { id: `sprite-${slug(name)}`, name, type, variant };
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }

async function scrapeCatalog() {
  // Fortnite.GG protects the HTML page with a browser challenge. The reader endpoint
  // transports that same public page as markdown so the EMX feed can refresh unattended.
  const response = await fetch('https://r.jina.ai/http://fortnite.gg/sprites', {
    headers: { 'User-Agent': 'EMX-Sprite-Tracker/1.1.9' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Catalog reader returned HTTP ${response.status}`);
  const markdown = await response.text();
  if (!markdown.includes('All Fortnite Sprites')) throw new Error('Catalog reader returned an unexpected page.');
  const pattern = /\[!\[Image \d+: [^\]]+\]\((https?:\/\/fortnite\.gg\/img\/x\/sprites\/icons\/[^)]+)\)\]\((https?:\/\/fortnite\.gg\/sprites\/\d+-[^)]+)\)\s+\[([^\]]+)\]\(\2\)\s+(rare|epic|legendary|mythic|special)\s+[^\r\n]+\s+(Not owned|Unreleased)/gim;
  const rows = [];
  for (const match of markdown.matchAll(pattern)) {
    rows.push({
      linkName: match[3].trim(),
      href: match[2].replace('http://', 'https://'),
      released: match[5].toLowerCase() !== 'unreleased',
      rarity: match[4].toLowerCase(),
      imageSource: match[1].replace('http://', 'https://'),
    });
  }
  return Array.from(new Map(rows.map((row) => [row.href, row])).values());
}

const existingPayload = await readJson(await exists(livePath) ? livePath : bundledPath);
const currentSprites = Array.isArray(existingPayload) ? existingPayload : existingPayload.sprites;
const scraped = await scrapeCatalog();
const liveRows = new Map(scraped.map((row) => [identity(row.linkName).id, { ...identity(row.linkName), ...row }]));
const releasedCount = [...liveRows.values()].filter((row) => row.released).length;
if (liveRows.size < 100 || releasedCount < 60) throw new Error(`Refusing incomplete live catalog (${liveRows.size} indexed / ${releasedCount} released).`);

const merged = [];
for (const current of currentSprites) {
  const live = liveRows.get(current.id);
  if (!live) { merged.push(current); continue; }
  const target = path.join(imageDir, `${current.id}.webp`);
  const hadBundledImage = await exists(target);
  if (live.released && live.imageSource && !hadBundledImage) {
    const response = await fetch(live.imageSource);
    if (!response.ok) throw new Error(`Image ${current.id} returned HTTP ${response.status}`);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  merged.push({
    ...current,
    released: live.released,
    rarity: live.rarity || current.rarity,
    image: live.released && live.imageSource ? (hadBundledImage ? current.image : `${rawAssetRoot}/${current.id}.webp`) : '/sprites/unreleased-outline.svg',
    imageStatus: live.released && live.imageSource ? 'verified' : 'unreleased-outline',
    dataStatus: live.released ? (current.dataStatus || 'live-release') : current.dataStatus,
  });
  liveRows.delete(current.id);
}

for (const live of liveRows.values()) {
  const target = path.join(imageDir, `${live.id}.webp`);
  if (live.released && live.imageSource) {
    const response = await fetch(live.imageSource);
    if (!response.ok) throw new Error(`Image ${live.id} returned HTTP ${response.status}`);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  merged.push({
    id: live.id, name: live.name, type: live.type, variant: live.variant, rarity: live.rarity, released: live.released,
    image: live.released && live.imageSource ? `${rawAssetRoot}/${live.id}.webp` : '/sprites/unreleased-outline.svg',
    imageStatus: live.released && live.imageSource ? 'verified' : 'unreleased-outline',
    description: '', stats: [], abilities: [], effects: [], acquisition: '', spawnInfo: '', releaseDate: '', dataStatus: 'live-release',
  });
}

merged.sort((a, b) => a.name.localeCompare(b.name));
const oldFingerprint = JSON.stringify(currentSprites.map(({ released, image, rarity, id }) => ({ id, released, image, rarity })).sort((a, b) => a.id.localeCompare(b.id)));
const newFingerprint = JSON.stringify(merged.map(({ released, image, rarity, id }) => ({ id, released, image, rarity })).sort((a, b) => a.id.localeCompare(b.id)));
if (oldFingerprint === newFingerprint) { console.log(`Catalog unchanged: ${releasedCount} released / ${merged.length} indexed.`); process.exit(0); }

await fs.mkdir(path.dirname(livePath), { recursive: true });
await fs.writeFile(livePath, `${JSON.stringify({ schema: 1, updatedAt: new Date().toISOString(), indexedCount: merged.length, releasedCount, sprites: merged }, null, 2)}\n`);
console.log(`Catalog refreshed: ${releasedCount} released / ${merged.length} indexed.`);
