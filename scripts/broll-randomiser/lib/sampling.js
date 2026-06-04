'use strict';

// Pure ingest math for the content-timeline approach (design spec §4.1, §4.3).
// No I/O.

const INTERVAL_SEC = 4; // ~1 sampled frame every 4s
const MIN_FRAMES = 3;
const MAX_FRAMES = 24;
const PIECE_SEC = 7; // target library-piece length

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Evenly spaced sample timestamps across a clip, centered in each slice so we
// avoid the often-black first/last frame. Count ≈ duration/4s, clamped [3, 24].
function planSampleTimes(duration, { intervalSec = INTERVAL_SEC, minFrames = MIN_FRAMES, maxFrames = MAX_FRAMES } = {}) {
  const count = clamp(Math.round(duration / intervalSec), minFrames, maxFrames);
  const times = [];
  for (let i = 0; i < count; i++) {
    times.push(Number((duration * ((i + 0.5) / count)).toFixed(3)));
  }
  return times;
}

// Slice a content span into even, gapless pieces of ~7s: round(len/7) pieces
// (at least 1), each spanLen/n long. No tiny trailing scraps.
function subCutSpan({ start, end }, pieceSec = PIECE_SEC) {
  const len = end - start;
  const n = Math.max(1, Math.round(len / pieceSec));
  const size = len / n;
  const pieces = [];
  for (let i = 0; i < n; i++) {
    pieces.push({
      start: Number((start + i * size).toFixed(3)),
      end: i === n - 1 ? end : Number((start + (i + 1) * size).toFixed(3)),
    });
  }
  return pieces;
}

module.exports = { planSampleTimes, subCutSpan, INTERVAL_SEC, MIN_FRAMES, MAX_FRAMES, PIECE_SEC };
