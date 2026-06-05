'use strict';

// Transcribe a voiceover to word-level timestamps via OpenAI Whisper. Spec §5.1.

const fs = require('fs');
const OpenAI = require('openai');

async function transcribe(audioPath, client = new OpenAI()) {
  const res = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  const words = (res.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }));
  const duration = res.duration || (words.length ? words[words.length - 1].end : 0);
  return { words, duration, text: res.text };
}

module.exports = { transcribe };
