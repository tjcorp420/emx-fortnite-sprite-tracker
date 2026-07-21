import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const livePath = path.join(root, 'public', 'data', 'catalog-live.json');
const bundledPath = path.join(root, 'data', 'sprites.json');
const imageDir = path.join(root, 'public', 'sprites');
const rawAssetRoot = 'https://raw.githubusercontent.com/tjcorp420/emx-fortnite-sprite-tracker/main/public/sprites';
const variants = ['Holofoil', 'Galaxy', 'Gummy', 'Gold', 'Gem', 'Cube', 'Quack'];
const catalogUrl = process.env.EMX_CATALOG_SOURCE_URL || 'https://r.jina.ai/http://fortnite.gg/sprites';
const sourceRetryAttempts = 4;
const sourceTimeoutMs = 15_000;

class CatalogSourceError extends Error {}

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
function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function parseCatalog(markdown) {
  if (!markdown.includes('All Fortnite Sprites')) throw new CatalogSourceError('Catalog reader returned an unexpected page.');
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
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.href, row])).values());
  const releasedCount = uniqueRows.filter((row) => row.released).length;
  if (uniqueRows.length < 100 || releasedCount < 60) {
    throw new CatalogSourceError(`Catalog reader returned incomplete data (${uniqueRows.length} indexed / ${releasedCount} released).`);
  }
  return uniqueRows;
}

async function scrapeCatalog() {
  // Fortnite.GG protects the HTML page with a browser challenge. The reader endpoint
  // transports that same public page as markdown so the EMX feed can refresh unattended.
  const failures = [];
  for (let attempt = 1; attempt <= sourceRetryAttempts; attempt += 1) {
    try {
      const response = await fetch(catalogUrl, {
        headers: { 'User-Agent': 'EMX-Sprite-Tracker/catalog-sync' },
        signal: AbortSignal.timeout(sourceTimeoutMs),
      });
      if (!response.ok) throw new CatalogSourceError(`Catalog reader returned HTTP ${response.status}.`);
      return parseCatalog(await response.text());
    } catch (error) {
      if (!(error instanceof CatalogSourceError) && !(error instanceof Error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      failures.push(message);
      if (attempt < sourceRetryAttempts) {
        const delay = attempt * 1_500;
        console.warn(`Catalog source attempt ${attempt}/${sourceRetryAttempts} failed: ${message} Retrying in ${delay / 1000}s.`);
        await wait(delay);
      }
    }
  }
  throw new CatalogSourceError(`Catalog reader was unavailable after ${sourceRetryAttempts} attempts: ${failures.at(-1) || 'unknown source error'}`);
}

const existingPayload = await readJson(await exists(livePath) ? livePath : bundledPath);
const currentSprites = Array.isArray(existingPayload) ? existingPayload : existingPayload.sprites;
if (!Array.isArray(currentSprites)) {
  throw new Error('The existing catalog has an invalid sprite list.');
}
const cachedReleasedCount = currentSprites.filter((sprite) => sprite.released).length;
if (currentSprites.length < 100 || cachedReleasedCount < 60) {
  throw new Error('The existing catalog is not complete enough to safely use as a fallback.');
}

let scraped;
try {
  scraped = await scrapeCatalog();
} catch (error) {
  if (!(error instanceof CatalogSourceError)) throw error;
  console.warn(`::warning title=Catalog refresh skipped::${error.message} Keeping the last verified catalog.`);
  console.log(`Catalog refresh skipped safely: ${cachedReleasedCount} released / ${currentSprites.length} indexed.`);
}

if (scraped) {
  const liveRows = new Map(scraped.map((row) => [identity(row.linkName).id, { ...identity(row.linkName), ...row }]));
  const releasedCount = [...liveRows.values()].filter((row) => row.released).length;

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
  if (oldFingerprint === newFingerprint) {
    console.log(`Catalog unchanged: ${releasedCount} released / ${merged.length} indexed.`);
  } else {
    await fs.mkdir(path.dirname(livePath), { recursive: true });
    await fs.writeFile(livePath, `${JSON.stringify({ schema: 1, updatedAt: new Date().toISOString(), indexedCount: merged.length, releasedCount, sprites: merged }, null, 2)}\n`);
    console.log(`Catalog refreshed: ${releasedCount} released / ${merged.length} indexed.`);
  }
}
