'use strict';

// B-Roll Randomiser — Phase 2 Generation (local CLI, pre-Discord).
// voiceover audio → Whisper word timestamps → 3–6s windows → per-window theme →
// matched clips (junk-filtered, per-source-capped, seeded reshuffle) → trim/concat
// → mux voice → out/<job>-broll.mp4 + a manifest of clips used.
//
//   node generate.js path/to/voiceover.mp3 [--seed 123]
//
// Submagic captions + Discord delivery are Phases 3–4. Spec §5.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

const { transcribe } = require('./lib/transcribe');
const { segmentWindows } = require('./lib/segmenter');
const { assignThemes } = require('./lib/theme');
const { matchClips } = require('./lib/matcher');
const { buildAssemblyPlan, planTotalDuration, renderReel } = require('./lib/assembler');

const ROOT = path.join(__dirname, '../..');
const DATA_DIR = path.join(ROOT, 'data/broll-randomiser');
const OUT_DIR = path.join(DATA_DIR, 'out');

async function generate(audioPath, { seed, state = null, strict = false, domain = null } = {}) {
  const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'));
  const vocab = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'vocabulary.json'), 'utf8'));
  const runSeed = seed != null ? seed : Math.floor(Date.now() % 2147483647);

  console.log(`Transcribing ${path.basename(audioPath)}...`);
  const { words, duration } = await transcribe(audioPath);
  console.log(`  ${words.length} words, ${duration.toFixed(1)}s`);

  const windows = segmentWindows(words, duration);
  console.log(`Segmented into ${windows.length} window(s). Assigning themes...`);
  const themes = await assignThemes(windows, vocab);
  windows.forEach((w, i) => { w.theme = themes[i] || 'generic-action'; });

  if (domain) console.log(`Domain gate: ${domain}`);
  if (state) console.log(`Region gate: ${state}${strict ? ' (strict)' : ' (loose)'}`);
  const clips = matchClips(windows, catalog, { seed: runSeed, state, strict, domain });
  const missing = clips.filter((c) => !c).length;
  if (missing) console.warn(`  WARNING: ${missing} window(s) had no eligible clip and will be skipped.`);

  // Keep only windows that matched, so the plan stays gapless.
  const pairs = windows.map((w, i) => ({ w, c: clips[i] })).filter((p) => p.c);
  const plan = buildAssemblyPlan(pairs.map((p) => p.w), pairs.map((p) => p.c));

  const job = `${path.basename(audioPath).replace(/\.[^.]+$/, '')}-${runSeed}`;
  const outPath = path.join(OUT_DIR, `${job}-broll.mp4`);
  console.log(`Rendering ${plan.length} clip(s) (${planTotalDuration(plan).toFixed(1)}s, seed ${runSeed})...`);
  renderReel(plan, audioPath, outPath, { rootDir: ROOT });

  const manifest = pairs.map((p, i) => `${i}. [${p.w.theme}] ${p.c.id}  (${p.w.text})`).join('\n');
  fs.writeFileSync(outPath.replace(/\.mp4$/, '.manifest.txt'), manifest);
  console.log(`\nDone → ${path.relative(ROOT, outPath)}\n\nClips used:\n${manifest}`);
  return { outPath, plan, windows };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  // Parse flags first, then the lone positional arg is the audio path.
  const flagValue = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const seed = args.includes('--seed') ? Number(flagValue('--seed')) : undefined;
  const state = flagValue('--state') || null;
  const domain = flagValue('--domain') || null;
  const strict = args.includes('--strict');
  const consumed = new Set(['--seed', flagValue('--seed'), '--state', flagValue('--state'), '--domain', flagValue('--domain'), '--strict']);
  const audioPath = args.find((a) => !a.startsWith('--') && !consumed.has(a));
  if (!audioPath) {
    console.error('Usage: node generate.js <voiceover.mp3|wav> [--domain roofing|remodeling] [--state "New Jersey"] [--seed N] [--strict]');
    process.exit(1);
  }
  generate(audioPath, { seed, state, strict, domain }).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { generate };
