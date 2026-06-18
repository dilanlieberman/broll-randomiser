'use strict';

// Flag photo-slideshow clips (stills shown as "video") so the matcher never uses
// them. ffmpeg freezedetect catches held-still frames; a real shot has continuous
// motion (0 freezes), a slideshow holds each photo (multiple freeze segments).
// Local + free (no API). Sets exclude=true on clips with >= MIN_FREEZES segments.
// Run on the Mac (library lives here).

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '../..');
const CATALOG = path.join(ROOT, 'data/broll-randomiser/catalog.json');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const MIN_FREEZES = 2; // >=2 held stills => slideshow (a single static shot has <=1)

function freezeCount(clipPath) {
  // freezedetect logs to stderr and ffmpeg exits 0, so capture stderr via spawnSync.
  const r = spawnSync(FFMPEG, ['-i', clipPath, '-vf', 'freezedetect=n=0.004:d=0.4', '-map', '0:v', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return ((r.stderr || '').match(/freeze_start/g) || []).length;
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  let flagged = 0, done = 0;
  for (const r of catalog) {
    if (r.exclude) { done++; continue; }
    const clip = path.join(ROOT, r.path);
    if (!fs.existsSync(clip)) { done++; continue; }
    const n = freezeCount(clip);
    if (n >= MIN_FREEZES) {
      r.exclude = true;
      r.exclude_reason = 'slideshow';
      flagged++;
      console.log(`  + ${r.id} (${n} freezes) src=${r.src_file.split('/').pop()}`);
    }
    if (++done % 50 === 0) { fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2)); console.log(`  ...${done}/${catalog.length} (${flagged} slideshows)`); }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  console.log(`\nDone. Flagged ${flagged} slideshow clips (exclude=true).`);
}

if (require.main === module) main();
