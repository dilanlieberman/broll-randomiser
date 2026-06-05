'use strict';

// Content-timeline tagger — sends the whole clip's timestamped frames to Claude
// vision in ONE call and gets back an ordered shot list of content spans. Each
// span becomes (after sub-cutting) one or more library pieces. Spec §4.2.

const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6'; // strong vision, cheap enough for bulk tagging

const SPAN_PROPS = {
  start: { type: 'number', description: 'Span start, seconds into the clip.' },
  end: { type: 'number', description: 'Span end, seconds into the clip.' },
  description: { type: 'string', description: 'Rich 1-3 sentence "story of the shot": what is happening and distinguishing visual details.' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Up to 4 specific content tags from the provided vocabulary. At most ONE new kebab-case tag if nothing fits. Do NOT include setting values (roof/interior/exterior/mixed) here.' },
  has_people: { type: 'boolean' },
  setting: { type: 'string', enum: ['roof', 'interior', 'exterior', 'mixed'] },
  motion: { type: 'string', enum: ['static', 'handheld', 'pan', 'pov', 'drone'] },
  quality: { type: 'string', enum: ['good', 'usable', 'weak'] },
  has_text: { type: 'boolean', description: 'TRUE if ANY overlaid text is visible — captions, title cards, logos, watermarks, social @handles, lower-thirds, on-screen graphics. Be strict: even a small corner watermark or username counts.' },
  scenery: {
    type: 'string',
    enum: ['temperate', 'arid', 'tropical-coastal', 'snowy', 'indeterminate'],
    description: 'The clip\'s plausible US region from visible environment cues. temperate = green deciduous trees / 4-season northeast-midwest-PNW suburb; arid = dry brown hills, desert, sparse vegetation (southwest); tropical-coastal = palms, lush tropical, beach; snowy = snow/ice/winter; indeterminate = roof+sky only or interior, no placeable outdoor cues (usable anywhere).',
  },
  has_palms: { type: 'boolean', description: 'TRUE if palm trees or clearly tropical/desert vegetation are visible.' },
  has_snow: { type: 'boolean', description: 'TRUE if snow or ice is visible on the ground/roof.' },
};

const TIMELINE_TOOL = {
  name: 'record_timeline',
  description: 'Record the ordered content-span timeline for one b-roll clip.',
  input_schema: {
    type: 'object',
    properties: {
      spans: {
        type: 'array',
        items: { type: 'object', properties: SPAN_PROPS, required: Object.keys(SPAN_PROPS) },
      },
    },
    required: ['spans'],
  },
};

function flattenVocab(vocab) {
  return Object.values(vocab).flat();
}

// Interleave a [t=..s] label before each frame so the model can place spans precisely.
function framesContent(framePaths, times) {
  const content = [];
  framePaths.forEach((p, i) => {
    content.push({ type: 'text', text: `[t=${times[i].toFixed(1)}s]` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: fs.readFileSync(p).toString('base64') } });
  });
  return content;
}

// Retry transient API failures (5xx / 429 / overloaded) with exponential backoff.
async function withRetry(fn, { attempts = 4, baseMs = 1500 } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.statusCode;
      const transient = status >= 500 || status === 429 || /overloaded/i.test(err?.message || '');
      if (!transient || i >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
}

async function tagTimeline(framePaths, times, duration, vocab, client = new Anthropic()) {
  const allowed = flattenVocab(vocab);
  const prompt =
    `These ${framePaths.length} frames are sampled from ONE silent b-roll clip ` +
    `(~${duration.toFixed(0)}s long) for a home-services contractor reel ` +
    `(roofing / remodeling / demolition), each labeled with its timestamp.\n\n` +
    `Produce an ordered shot list of content spans that covers the clip. A span is ` +
    `a continuous action or scene — merge adjacent frames showing the same action ` +
    `into one span, and start a new span when the action clearly changes. Give each ` +
    `span start/end in seconds.\n\n` +
    `Tag each span using these vocabulary tags where they fit (max 4 tags; add at ` +
    `most ONE new kebab-case tag only if nothing matches; include 'generic-action' ` +
    `as a fallback when motion exists but nothing specific fits):\n${allowed.join(', ')}\n\n` +
    `quality: 'good' = sharp/clear hero shot, 'usable' = fine but unremarkable, ` +
    `'weak' = blurry/dark/boring.\n\n` +
    `Also for each span judge: has_text (any overlaid text/caption/watermark/handle — ` +
    `be strict), scenery (the plausible US region from environment cues — temperate / ` +
    `arid / tropical-coastal / snowy / indeterminate), and the has_palms / has_snow ` +
    `flags. These drive region-appropriate matching, so look carefully at vegetation, ` +
    `terrain, and weather. Call record_timeline with the result.`;

  const res = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: 8192, // long clips (200s+) produce many spans; 2000 truncated them
    tools: [TIMELINE_TOOL],
    tool_choice: { type: 'tool', name: 'record_timeline' },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...framesContent(framePaths, times)] }],
  }));

  if (res.stop_reason === 'max_tokens') {
    throw new Error(`tagger: timeline truncated at max_tokens (${framePaths.length} frames) — raise the cap`);
  }
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || !Array.isArray(block.input.spans)) {
    throw new Error('tagger: model did not return a valid spans array');
  }
  return block.input.spans;
}

module.exports = { tagTimeline, flattenVocab, MODEL };
