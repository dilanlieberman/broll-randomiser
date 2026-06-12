'use strict';

// Safety sweep: re-check every library clip currently marked has_text=false for
// overlaid text the ingest tagger missed (it samples ~1 frame/4s, so brief/subtle
// text — barcode stickers, handles, captions — slips through). Samples 6 frames
// per clip and asks Claude vision strictly. Only flips false -> true (never the
// reverse). Checkpoints the catalog as it goes. Run on the Mac (library lives here).

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

const ROOT = path.join(__dirname, '../..');
const LIB = path.join(ROOT, 'data/broll-randomiser/library');
const CATALOG = path.join(ROOT, 'data/broll-randomiser/catalog.json');
const TMP = path.join(ROOT, 'data/broll-randomiser/.text-frames');
const MODEL = 'claude-sonnet-4-6';

const client = new Anthropic();

const TOOL = {
  name: 'text_check',
  description: 'Report whether any sampled frame shows overlaid text.',
  input_schema: {
    type: 'object',
    properties: { has_text: { type: 'boolean' }, what: { type: 'string', description: 'brief note on the text seen, or empty' } },
    required: ['has_text'],
  },
};

function frames(clipPath, dur, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  const span = Math.max(0.5, (dur || 7) - 0.3); // stay before the last frame
  for (let i = 0; i < 6; i++) {
    const t = (span * i) / 5; // 0 .. span across 6 points
    const p = path.join(outDir, `f${i}.png`);
    try {
      execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-ss', t.toFixed(2), '-i', clipPath, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '3', p], { stdio: 'pipe' });
      if (fs.existsSync(p)) out.push(p);
    } catch (_) { /* skip a bad frame */ }
  }
  return out;
}

async function withRetry(fn, n = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const s = e?.status || e?.statusCode;
      if (i >= n - 1 || !(s >= 500 || s === 429 || /overloaded/i.test(e?.message || ''))) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
}

async function hasText(framePaths) {
  const content = [{
    type: 'text',
    text:
      'These frames are from one b-roll clip for a contractor ad. Flag has_text=TRUE only if the clip ' +
      'would look unprofessional or like a reposted social clip because of text:\n' +
      '• OVERLAID / edited-in text — captions, subtitles, on-screen titles, social @handles, ' +
      'watermarks, logos added in post, lower-thirds, graphics/annotations; OR\n' +
      '• PROMINENT printed stickers/labels/packaging that cover or dominate the work surface or main ' +
      'subject (e.g. product/barcode stickers all over the tiles, a label slapped across the subject).\n' +
      'Do NOT flag incidental real-world branding that is just a natural part of a professional work ' +
      'scene — a brand name on a tool, machine, or vehicle (e.g. an excavator logo), or product ' +
      'packaging sitting in the background. Call text_check; in "what" note the text and whether it is ' +
      'overlay/surface-sticker (flag) or incidental branding (do not flag).',
  }];
  for (const p of framePaths) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(p).toString('base64') } });
  const res = await withRetry(() => client.messages.create({
    model: MODEL, max_tokens: 300, tools: [TOOL], tool_choice: { type: 'tool', name: 'text_check' },
    messages: [{ role: 'user', content }],
  }));
  const b = res.content.find((x) => x.type === 'tool_use');
  return b ? b.input : { has_text: false };
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const todo = catalog.filter((r) => !r.has_text);
  console.log(`Re-checking ${todo.length} has_text=false clips (of ${catalog.length})...`);
  let flipped = 0, done = 0;
  for (const r of todo) {
    const clip = path.join(ROOT, r.path);
    if (!fs.existsSync(clip)) { done++; continue; }
    const dir = path.join(TMP, r.id);
    try {
      const fr = frames(clip, r.duration || 7, dir);
      if (!fr.length) { done++; continue; }
      const res = await hasText(fr);
      if (res.has_text) { r.has_text = true; flipped++; console.log(`  + ${r.id} TEXT${res.what ? ' — ' + res.what : ''}`); }
    } catch (e) {
      console.error(`  ERR ${r.id}: ${e.message}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (++done % 25 === 0) { fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2)); console.log(`  ...${done}/${todo.length} (${flipped} flagged)`); }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\nDone. Flagged ${flipped} previously-missed text clips. Catalog updated.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
