import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const livePath = path.join(root, 'public', 'data', 'catalog-live.json');
const bundledPath = path.join(root, 'data', 'sprites.json');
const activeSeasonPath = path.join(root, 'data', 'active-season.json');
const imageDir = path.join(root, 'public', 'sprites');
const rawAssetRoot = 'https://raw.githubusercontent.com/tjcorp420/emx-fortnite-sprite-tracker/main/public/sprites';
const variants = ['Cheat Master', 'Holofoil', 'Galaxy', 'Gummy', 'Gold', 'Gem', 'Cube', 'Quack'];
// These families were present in the catalog before this season. A previous
// refresh mistakenly marked them as current because it treated every
// `live-release` record as new. Keep this boundary explicit: only a Sprite
// that becomes released during this season (or is newly discovered) may enter
// the current-season roster.
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
  if (!markdown.includes('Fortnite Sprites')) throw new CatalogSourceError('Catalog reader returned an unexpected page.');
  const legacyPattern = /\[!\[Image \d+: [^\]]+\]\((https?:\/\/fortnite\.gg\/img\/x\/sprites\/icons\/[^)]+)\)\]\((https?:\/\/fortnite\.gg\/sprites\/\d+-[^)]+)\)\s+\[([^\]]+)\]\(\2\)\s+(rare|epic|legendary|mythic|special)\s+[^\r\n]+\s+(Not owned|Unreleased)/gim;
  const currentSeasonPattern = /\[!\[Image \d+: [^\]]+\]\((https?:\/\/fortnite\.gg\/img\/x\/sprites\/icons\/[^)]+)\)\]\((https?:\/\/fortnite\.gg\/sprites\/\d+-[^)]+)\)\s*\r?\n+\s*\[([^\]]+)\]\(\2\)/gim;
  const rows = [];
  for (const match of markdown.matchAll(legacyPattern)) {
    rows.push({
      linkName: match[3].trim(),
      href: match[2].replace('http://', 'https://'),
      released: match[5].toLowerCase() !== 'unreleased',
      rarity: match[4].toLowerCase(),
      imageSource: match[1].replace('http://', 'https://'),
    });
  }
  if (!rows.length) {
    for (const match of markdown.matchAll(currentSeasonPattern)) {
      rows.push({
        linkName: match[3].trim(),
        href: match[2].replace('http://', 'https://'),
        released: true,
        rarity: 'special',
        imageSource: match[1].replace('http://', 'https://'),
      });
    }
  }
  const uniqueRows = Array.from(new Map(rows.map((row) => [row.href, row])).values());
  const releasedCount = uniqueRows.filter((row) => row.released).length;
  if (uniqueRows.length < 25 || !releasedCount) {
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
const activeSeason = await readJson(activeSeasonPath);
if (!activeSeason?.id || !activeSeason?.label || !activeSeason?.startedAt) {
  throw new Error('The active Sprite season manifest is invalid.');
}
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

  const merged = [];
  for (const current of currentSprites) {
    const live = liveRows.get(current.id);
    if (!live) {
      const { seasonId: existingSeasonId, ...spriteWithoutSeason } = current;
      merged.push(legacySeasonCarryoverIds.has(current.id) ? spriteWithoutSeason : current);
      continue;
    }
    const { seasonId: existingSeasonId, ...spriteWithoutSeason } = current;
    const target = path.join(imageDir, `${current.id}.webp`);
    const hadBundledImage = await exists(target);
    if (live.released && live.imageSource && !hadBundledImage) {
      const response = await fetch(live.imageSource);
      if (!response.ok) throw new Error(`Image ${current.id} returned HTTP ${response.status}`);
      await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
    }
    const newlyReleased = live.released && !current.released;
    const seasonId = legacySeasonCarryoverIds.has(current.id)
      ? undefined
      : (live.released && newlyReleased ? activeSeason.id : existingSeasonId);
    merged.push({
      ...spriteWithoutSeason,
      released: live.released,
      rarity: live.rarity || current.rarity,
      image: live.released && live.imageSource ? (hadBundledImage ? current.image : `${rawAssetRoot}/${current.id}.webp`) : '/sprites/unreleased-outline.svg',
      imageStatus: live.released && live.imageSource ? 'verified' : 'unreleased-outline',
      dataStatus: live.released ? (current.dataStatus || 'live-release') : current.dataStatus,
      ...(seasonId ? { seasonId } : {}),
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
      id: live.id, name: live.name, type: live.type, variant: live.variant, rarity: live.rarity || 'special', released: live.released,
      image: live.released && live.imageSource ? `${rawAssetRoot}/${live.id}.webp` : '/sprites/unreleased-outline.svg',
      imageStatus: live.released && live.imageSource ? 'verified' : 'unreleased-outline',
      description: '', stats: [], abilities: [], effects: [], acquisition: '', spawnInfo: '', releaseDate: '', dataStatus: 'live-release',
      ...(live.released ? { seasonId: activeSeason.id } : {}),
    });
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));
  const mergedReleasedCount = merged.filter((sprite) => sprite.released).length;
  const oldFingerprint = JSON.stringify({ seasonId: existingPayload.activeSeason?.id, sprites: currentSprites.map(({ released, image, rarity, id, seasonId }) => ({ id, released, image, rarity, seasonId })).sort((a, b) => a.id.localeCompare(b.id)) });
  const newFingerprint = JSON.stringify({ seasonId: activeSeason.id, sprites: merged.map(({ released, image, rarity, id, seasonId }) => ({ id, released, image, rarity, seasonId })).sort((a, b) => a.id.localeCompare(b.id)) });
  if (oldFingerprint === newFingerprint) {
    console.log(`Catalog unchanged: ${mergedReleasedCount} released / ${merged.length} indexed.`);
  } else {
    await fs.mkdir(path.dirname(livePath), { recursive: true });
    await fs.writeFile(livePath, `${JSON.stringify({ schema: 2, updatedAt: new Date().toISOString(), activeSeason, indexedCount: merged.length, releasedCount: mergedReleasedCount, sprites: merged }, null, 2)}\n`);
    console.log(`Catalog refreshed: ${mergedReleasedCount} released / ${merged.length} indexed.`);
  }
}
