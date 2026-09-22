import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const livePath = path.join(root, 'public', 'data', 'catalog-live.json');
const bundledPath = path.join(root, 'data', 'sprites.json');
const activeSeasonPath = path.join(root, 'data', 'active-season.json');
const imageDir = path.join(root, 'public', 'sprites');
const rawAssetRoot = 'https://raw.githubusercontent.com/tjcorp420/emx-fortnite-sprite-tracker/main/public/sprites';
// Ordered so multi-word / more specific variant prefixes match before shorter ones.
const variants = ['Bounty Hunter', 'Cheat Master', 'Loot Hacker', 'Holofoil', 'Galaxy', 'Gummy', 'Gold', 'Gem', 'Cube', 'Quack'];
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

// Fortnite.GG protects its pages behind a Cloudflare browser challenge, so the
// unattended sync reads the same public pages through the r.jina.ai reader (as
// markdown). The site redesign reduced the grid to bare image links, so rarity
// and released status now come from each Sprite's own detail page. Artwork is
// pulled through the images.weserv.nl proxy because the icon CDN is challenged
// for non-browser clients too.
const catalogUrl = process.env.EMX_CATALOG_SOURCE_URL || 'https://r.jina.ai/http://fortnite.gg/sprites';
const detailBase = process.env.EMX_CATALOG_DETAIL_BASE || 'https://r.jina.ai/http://fortnite.gg/sprites/';
const imageProxy = 'https://images.weserv.nl/?url=';
const requestHeaders = { 'User-Agent': 'EMX-Sprite-Tracker/catalog-sync' };
const rarities = new Set(['rare', 'epic', 'legendary', 'mythic', 'special']);
const detailConcurrency = 2;
const sourceRetryAttempts = 6;
const sourceTimeoutMs = 25_000;
// The reader allows ~20 requests per rolling minute. Pace request starts a bit
// under that so refreshes stay reliable instead of exhausting retry budgets.
const readerMinIntervalMs = Number(process.env.EMX_READER_INTERVAL_MS || 3_300);
const imageTimeoutMs = 20_000;
const gridRowPattern = /\[!\[Image \d+: ([^\]]+)\]\((https?:\/\/fortnite\.gg\/img\/x\/sprites\/icons\/[^)]+)\)\]\((https?:\/\/fortnite\.gg\/sprites\/(\d+-[^)]+))\)/g;

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
// The grid's image alt text already carries the " Sprite" suffix that identity()
// re-adds, so strip it to keep ids stable (`sprite-<slug(name)>`).
function linkNameFromAlt(alt) {
  const trimmed = alt.trim();
  return trimmed === 'Burnt Peanut' ? trimmed : trimmed.replace(/ Sprite$/i, '');
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

let readerNextSlot = 0;
async function reserveReaderSlot() {
  const now = Date.now();
  const start = Math.max(now, readerNextSlot);
  readerNextSlot = start + readerMinIntervalMs;
  if (start > now) await wait(start - now);
}

async function fetchText(url, tries = sourceRetryAttempts) {
  const failures = [];
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      await reserveReaderSlot();
      const response = await fetch(url, { headers: requestHeaders, signal: AbortSignal.timeout(sourceTimeoutMs) });
      // The reader is rate limited; on 429 it recovers after a longer pause.
      if (response.status === 429) throw Object.assign(new Error('HTTP 429'), { rateLimited: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
      if (attempt < tries) await wait((error && error.rateLimited ? 4_000 : 1_500) * attempt);
    }
  }
  throw new CatalogSourceError(`Reader unavailable for ${url} after ${tries} attempts: ${failures.at(-1) || 'unknown error'}`);
}

// The grid lists every Sprite as a single image link. It no longer carries
// rarity or released status, so it is used only to enumerate the catalog.
function parseGrid(markdown) {
  if (!markdown.includes('Fortnite Sprites')) throw new CatalogSourceError('Catalog reader returned an unexpected page.');
  const rows = [];
  const seen = new Set();
  for (const match of markdown.matchAll(gridRowPattern)) {
    const linkName = linkNameFromAlt(match[1]);
    const { id } = identity(linkName);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, linkName, imageSource: match[2].replace('http://', 'https://'), href: match[4] });
  }
  if (rows.length < 100) throw new CatalogSourceError(`Grid reader returned incomplete data (${rows.length} indexed).`);
  return rows;
}

// A Sprite detail page still carries rarity and the "Unreleased" marker that the
// grid redesign removed.
function parseDetail(markdown) {
  const lines = markdown.split('\n');
  const headingIndex = lines.findIndex((line) => /^# \S/.test(line));
  if (headingIndex < 0) return null;
  let statusIndex = headingIndex + 1;
  while (statusIndex < lines.length && !lines[statusIndex].trim()) statusIndex += 1;
  const statusLine = lines[statusIndex] || '';
  const rarityMatch = statusLine.match(/\b(rare|epic|legendary|mythic|special)\b/i);
  if (!rarityMatch) return null;
  return { rarity: rarityMatch[1].toLowerCase(), released: !/unreleased/i.test(statusLine) };
}

async function fetchDetail(href) {
  try {
    return parseDetail(await fetchText(`${detailBase}${href}`));
  } catch {
    return null;
  }
}

async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length || 1) }, next));
  return results;
}

// Self-host released artwork. The icon CDN 403s non-browser clients, so fetch
// through the image proxy. Returns true when a file is present on disk.
async function ensureImage(id, imageSource) {
  const target = path.join(imageDir, `${id}.webp`);
  if (await exists(target)) return true;
  const proxied = `${imageProxy}${encodeURIComponent(imageSource.replace(/^https?:\/\//, ''))}&output=webp`;
  const response = await fetch(proxied, { signal: AbortSignal.timeout(imageTimeoutMs) });
  if (!response.ok) throw new Error(`Image ${id} returned HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 200) throw new Error(`Image ${id} was empty`);
  await fs.mkdir(imageDir, { recursive: true });
  await fs.writeFile(target, buffer);
  return true;
}

// Build the scraped-row list the merge step expects. Released Sprites never
// regress, so only new and still-unreleased Sprites need a detail lookup; this
// keeps steady-state refreshes small and self-healing.
async function scrapeCatalog(currentMap) {
  const grid = parseGrid(await fetchText(catalogUrl));
  const needDetail = grid.filter((row) => {
    const existing = currentMap.get(row.id);
    return !existing || !existing.released;
  });
  console.log(`Grid indexed ${grid.length} Sprites; resolving status for ${needDetail.length} (new or unreleased).`);
  const detailResults = await runPool(needDetail, detailConcurrency, (row) => fetchDetail(row.href));
  const detailMap = new Map(needDetail.map((row, index) => [row.id, detailResults[index]]));
  console.log(`Detail fetch: ${detailResults.filter(Boolean).length}/${needDetail.length} resolved.`);

  const rows = [];
  let skipped = 0;
  for (const row of grid) {
    const existing = currentMap.get(row.id);
    if (existing && existing.released) {
      rows.push({ linkName: row.linkName, href: row.href, released: true, rarity: existing.rarity, imageSource: row.imageSource });
      continue;
    }
    const detail = detailMap.get(row.id);
    if (!detail) {
      // Keep an existing unreleased Sprite untouched; skip a brand-new one whose
      // status could not be confirmed rather than guessing.
      if (existing) rows.push({ linkName: row.linkName, href: row.href, released: false, rarity: existing.rarity, imageSource: row.imageSource });
      else skipped += 1;
      continue;
    }
    const rarity = rarities.has(detail.rarity) ? detail.rarity : (existing?.rarity || 'special');
    rows.push({ linkName: row.linkName, href: row.href, released: detail.released, rarity, imageSource: row.imageSource });
  }
  if (skipped) console.log(`Skipped ${skipped} new Sprite(s) with unresolved status; they will be retried next run.`);

  const releasedCount = rows.filter((row) => row.released).length;
  if (rows.length < 100 || releasedCount < 60) {
    throw new CatalogSourceError(`Resolved catalog is incomplete (${rows.length} indexed / ${releasedCount} released).`);
  }
  return rows;
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
const currentMap = new Map(currentSprites.map((sprite) => [sprite.id, sprite]));

let scraped;
try {
  scraped = await scrapeCatalog(currentMap);
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
      await ensureImage(current.id, live.imageSource);
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
    if (live.released && live.imageSource) {
      await ensureImage(live.id, live.imageSource);
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
