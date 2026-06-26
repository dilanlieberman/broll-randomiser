'use strict';

// Assemble matched clips into a silent background track the exact length of the
// voiceover, then mux the voice on. The PLAN math is pure (each window takes its
// own duration; a clip shorter than its window loops). The ffmpeg concat/mux is
// I/O via execFileSync arg arrays. Spec §5.4.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Pure: one plan entry per window. take = window duration; loop when the clip is
// shorter than the window so it fills rather than leaving a gap.
function buildAssemblyPlan(windows, clips) {
  return windows.map((w, i) => {
    const clip = clips[i];
    const take = Number((w.end - w.start).toFixed(3));
    return { id: clip.id, path: clip.path, take, loop: clip.duration + 1e-6 < take };
  });
}

function planTotalDuration(plan) {
  return plan.reduce((sum, p) => sum + p.take, 0);
}

function ffmpeg(args) {
  try {
    return execFileSync('ffmpeg', ['-y', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`ffmpeg failed: ${err.stderr?.toString().trim().split('\n').slice(-3).join(' ') || err.message}`);
  }
}

// I/O: trim each piece to its take (looping a short clip), concat into a silent
// 9:16 track, then mux the voiceover. rootDir resolves the catalog's relative paths.
function renderReel(plan, voicePath, outPath, { rootDir = process.cwd() } = {}) {
  const workDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'broll-'));
  try {
    const parts = plan.map((p, i) => {
      const part = path.join(workDir, `part-${String(i).padStart(4, '0')}.mp4`);
      const src = path.isAbsolute(p.path) ? p.path : path.join(rootDir, p.path);
      const loopArgs = p.loop ? ['-stream_loop', '-1'] : [];
      // -crf 18 (visually near-lossless) + -preset slow: this trim is the only
      // generation of loss we control before Submagic re-encodes. Default CRF 23
      // was needlessly soft. Submagic's own re-encode is unavoidable and not the
      // bottleneck (its output runs larger, not more compressed).
      ffmpeg([...loopArgs, '-i', src, '-t', p.take.toFixed(3), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', part]);
      return part;
    });

    const listFile = path.join(workDir, 'concat.txt');
    fs.writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n'));
    const silent = path.join(workDir, 'silent.mp4');
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

    // Mux the voiceover; -shortest trims to the (equal-length) voice track.
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    ffmpeg(['-i', silent, '-i', voicePath, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', outPath]);
    return outPath;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = { buildAssemblyPlan, planTotalDuration, renderReel };
