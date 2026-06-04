'use strict';

// B-Roll Randomiser — Phase 1 Ingest orchestrator (content-timeline approach).
// Per source clip: sample frames across the whole clip → one Claude vision call
// returns a timestamped content map → sub-cut each span into ~7s pieces →
// normalize each piece to 9:16 + write a catalog record. Resumable: skips any
// src_file already in the catalog.
//
//   node ingest.js                         # full vault
//   node ingest.js --batch "Gorilla" "Remodel vid.mp4"   # only matching basenames
//
// Design spec: docs/superpowers/specs/2026-06-01-broll-randomiser-design.md

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

const { planSampleTimes, subCutSpan } = require('./lib/sampling');
const { isAlreadyIngested, makeClipId } = require('./lib/catalog');
const { getDuration, getDimensions, sampleFramesAtTimes, normalizeSegment } = require('./lib/normalize');
const { tagTimeline } = require('./lib/tagger');

const ROOT = path.join(__dirname, '../..');
const VAULT = path.join(ROOT, 'PINNACLE SERVICE DELIVERY');
const DATA_DIR = path.join(ROOT, 'data/broll-randomiser');
const LIBRARY_DIR = path.join(DATA_DIR, 'library');
const FRAMES_DIR = path.join(DATA_DIR, '.frames');
const CATALOG_PATH = path.join(DATA_DIR, 'catalog.json');
const VOCAB_PATH = path.join(DATA_DIR, 'vocabulary.json');

function loadJson(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
}

// Recursively collect .mp4 paths under the vault.
function walkVault(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkVault(full));
    else if (/\.mp4$/i.test(entry.name)) out.push(full);
  }
  return out;
}

// Append any tags the model invented (not already in vocab) into an "extra" group.
function mergeNewTags(vocab, tags) {
  const known = new Set(Object.values(vocab).flat());
  const extra = (vocab.extra = vocab.extra || []);
  for (const t of tags) {
    if (!known.has(t) && !extra.includes(t)) extra.push(t);
  }
}

// Keep a span inside the real clip bounds (the model can over/undershoot slightly).
function clampSpan(span, duration) {
  return { start: Math.max(0, Math.min(span.start, duration - 0.1)), end: Math.min(span.end, duration) };
}

async function ingestOne(file, catalog, vocab) {
  const srcRel = path.relative(ROOT, file);
  if (isAlreadyIngested(catalog, srcRel)) {
    console.log(`  skip (already ingested): ${path.basename(file)}`);
    return 0;
  }

  const duration = getDuration(file);
  const { width, height } = getDimensions(file);
  const times = planSampleTimes(duration);

  const frameDir = path.join(FRAMES_DIR, `tmp-${path.basename(file).replace(/\W+/g, '_')}`);
  let spans;
  try {
    const frames = sampleFramesAtTimes(file, times, frameDir, 'frame');
    spans = await tagTimeline(frames, times, duration, vocab);
  } finally {
    fs.rmSync(frameDir, { recursive: true, force: true });
  }

  const pieceCount = spans.reduce((sum, s) => sum + subCutSpan(clampSpan(s, duration)).length, 0);
  console.log(`  ${path.basename(file)} — ${width}x${height} ${duration.toFixed(1)}s → ${spans.length} span(s) → ${pieceCount} piece(s)`);

  let added = 0;
  for (const span of spans) {
    const tags = Array.isArray(span.tags) && span.tags.length ? span.tags : ['generic-action'];
    const primary = tags[0];
    for (const piece of subCutSpan(clampSpan(span, duration))) {
      const id = makeClipId(primary, catalog.map((r) => r.id));
      const outPath = path.join(LIBRARY_DIR, `${id}.mp4`);
      normalizeSegment(file, piece.start, piece.end, outPath);
      catalog.push({
        id,
        src_file: srcRel,
        src_segment: { start: Number(piece.start.toFixed(2)), end: Number(piece.end.toFixed(2)) },
        path: path.relative(ROOT, outPath),
        duration: Number((piece.end - piece.start).toFixed(2)),
        description: span.description,
        tags,
        has_people: span.has_people,
        setting: span.setting,
        motion: span.motion,
        quality: span.quality,
      });
      mergeNewTags(vocab, tags);
      added++;
      console.log(`    + ${id} [${tags.join(', ')}] (${span.quality}) ${piece.start.toFixed(1)}-${piece.end.toFixed(1)}s`);
    }
  }
  return added;
}

async function main() {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf('--batch');
  const batchNames = batchIdx >= 0 ? args.slice(batchIdx + 1) : null;

  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  const catalog = loadJson(CATALOG_PATH, []);
  const vocab = loadJson(VOCAB_PATH, {});

  let files = walkVault(VAULT);
  if (batchNames) {
    files = files.filter((f) => batchNames.some((n) => path.basename(f).includes(n)));
    console.log(`Batch mode: ${files.length} clip(s) matched ${JSON.stringify(batchNames)}`);
  }
  console.log(`Ingesting ${files.length} source file(s)...\n`);

  let total = 0;
  for (const file of files) {
    try {
      total += await ingestOne(file, catalog, vocab);
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2)); // checkpoint after each clip
      fs.writeFileSync(VOCAB_PATH, JSON.stringify(vocab, null, 2));
    } catch (err) {
      console.error(`  ERROR on ${path.basename(file)}: ${err.message}`);
    }
  }

  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  console.log(`\nDone. ${total} piece(s) added. Catalog now holds ${catalog.length} clip(s).`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { walkVault, clampSpan };
