'use strict';

// Assign the dominant b-roll theme tag to each voiceover window in one batched
// Claude call (the line text → the tag whose footage should play under it). Spec §5.2.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

async function assignThemes(windows, vocab, client = new Anthropic()) {
  const allowed = Object.values(vocab).flat();
  const tool = {
    name: 'themes',
    description: 'Return one b-roll theme tag per numbered voiceover line, in order.',
    input_schema: {
      type: 'object',
      properties: { themes: { type: 'array', items: { type: 'string' } } },
      required: ['themes'],
    },
  };
  const lines = windows.map((w, i) => `${i}: ${w.text || '(no speech)'}`).join('\n');
  const prompt =
    `Each numbered line is a segment of a roofing/remodeling voiceover. For each, ` +
    `pick the SINGLE best b-roll theme tag whose footage should visually play under ` +
    `that line. Use 'generic-action' when the line is abstract with no visual hook. ` +
    `Return exactly one tag per line, in order.\n\n` +
    `Tags: ${allowed.join(', ')}\n\nLines:\n${lines}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'themes' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || !Array.isArray(block.input.themes)) throw new Error('theme: no themes array returned');
  return block.input.themes;
}

module.exports = { assignThemes, MODEL };
