'use strict';

// Assign the dominant b-roll theme tag to each voiceover window in one batched
// Claude call (the line text → the tag whose footage should play under it). Spec §5.2.

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-4-6';

async function assignThemes(windows, vocab, client = new Anthropic()) {
  const allowed = Object.values(vocab).flat();
  const tool = {
    name: 'themes',
    description: 'Return a theme tag AND an emotional valence for each numbered voiceover line, in order.',
    input_schema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
              valence: { type: 'string', enum: ['problem', 'solution', 'neutral'] },
            },
            required: ['theme', 'valence'],
          },
        },
      },
      required: ['lines'],
    },
  };
  const lines = windows.map((w, i) => `${i}: ${w.text || '(no speech)'}`).join('\n');
  const prompt =
    `Each numbered line is a segment of a roofing/remodeling voiceover. For each line return:\n` +
    `1) theme — the single best b-roll theme tag whose footage should play under it ` +
    `('generic-action' if abstract).\n` +
    `2) valence — the emotional beat, for contrast editing:\n` +
    `   • 'problem' = naming the pain, the dread, what goes wrong, or the COMPETITOR ` +
    `(cheap/overpriced/unreliable, dust/chaos, damage). Show run-down/demo footage.\n` +
    `   • 'solution' = about US, our process/crew, the benefit, or the finished RESULT. ` +
    `Show clean/finished/beautiful footage.\n` +
    `   • 'neutral' = neither.\n\n` +
    `Tags: ${allowed.join(', ')}\n\nLines:\n${lines}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'themes' },
    messages: [{ role: 'user', content: prompt }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || !Array.isArray(block.input.lines)) throw new Error('theme: no lines array returned');
  return block.input.lines; // [{theme, valence}]
}

module.exports = { assignThemes, MODEL };
