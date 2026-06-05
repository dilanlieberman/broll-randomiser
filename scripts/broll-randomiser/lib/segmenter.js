'use strict';

// Segment a word stream (Whisper word timestamps) into b-roll windows of 3–6s
// that tile [0, D] with no gaps/overlap. Windows break on sentence ends once
// they're at least minSec, and hard-split at maxSec for long unpunctuated runs.
// Pure. Spec §5.2.

const MIN_SEC = 3;
const MAX_SEC = 6;

function segmentWindows(words, duration, { minSec = MIN_SEC, maxSec = MAX_SEC } = {}) {
  if (!words.length) return [{ start: 0, end: duration, text: '' }];

  const windows = [];
  let curStart = 0;
  let cur = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const spanFromStart = w.end - curStart;
    const sentenceEnd = /[.!?]$/.test(w.word);
    const next = words[i + 1];
    const nextWouldExceed = next && next.end - curStart > maxSec;

    if (spanFromStart >= minSec && (sentenceEnd || nextWouldExceed)) {
      windows.push({ start: curStart, end: w.end, text: cur.map((x) => x.word).join(' ') });
      curStart = w.end;
      cur = [];
    }
  }

  // Flush any trailing words; extend the final window to the full duration.
  if (cur.length) {
    windows.push({ start: curStart, end: duration, text: cur.map((x) => x.word).join(' ') });
  } else if (windows.length) {
    windows[windows.length - 1].end = duration;
  }
  return windows;
}

module.exports = { segmentWindows, MIN_SEC, MAX_SEC };
