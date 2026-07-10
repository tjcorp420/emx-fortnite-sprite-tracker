import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sprites = JSON.parse(await fs.readFile(path.join(root, 'data', 'sprites.json'), 'utf8'));
const imageMap = JSON.parse(await fs.readFile(path.join(root, 'data', 'image-map.json'), 'utf8'));
const outDir = path.join(root, 'public', 'sprites');
await fs.mkdir(outDir, { recursive: true });
let downloaded = 0;
const failed = [];
for (const sprite of sprites.filter((item) => item.released)) {
  const filename = imageMap[sprite.type]?.[sprite.variant];
  if (!filename) { failed.push(`${sprite.id}: no source mapping`); continue; }
  const target = path.join(outDir, `${sprite.id}.webp`);
  try {
    const response = await fetch(`https://fortnite.gg/img/x/sprites/icons/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
  } catch (error) { failed.push(`${sprite.id}: ${error.message}`); }
}
console.log(`Downloaded ${downloaded} local Sprite images.`);
if (failed.length) { console.log(`Failed ${failed.length}:\n- ${failed.join('\n- ')}`); process.exitCode = 1; }
