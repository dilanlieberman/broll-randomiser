'use strict';

// Video I/O for ingest — ffprobe metadata, 9:16 normalization, and frame
// sampling. Uses execFileSync with argument ARRAYS (no shell) so filenames with
// spaces, quotes, apostrophes, brackets or @ are always safe — the vault has all
// of these (e.g. Twin Point's `"here's the deal".mp4`).

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpeg(args) {
  try {
    return execFileSync('ffmpeg', ['-y', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`ffmpeg failed: ${err.stderr?.toString().trim().split('\n').slice(-3).join(' ') || err.message}`);
  }
}

function ffprobe(args) {
  try {
    return execFileSync('ffprobe', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`ffprobe failed: ${err.stderr?.toString().trim() || err.message}`);
  }
}

function getDuration(file) {
  return parseFloat(ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]));
}

function getDimensions(file) {
  const out = ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [width, height] = out.split(',').map(Number);
  return { width, height };
}

// Sample one frame at each given timestamp (seconds) across the whole clip,
// for the content-timeline tagging call. Returns PNG paths in timestamp order.
// Frames are downscaled to ~512px wide: plenty for content understanding, and
// it keeps the multi-frame vision payload well under Anthropic's request size
// limit (full-res frames at the 24-frame cap blew a 413). Normalization reads
// the source at full quality separately — only these tagging frames shrink.
function sampleFramesAtTimes(srcFile, times, outDir, prefix) {
  fs.mkdirSync(outDir, { recursive: true });
  return times.map((t, i) => {
    const p = path.join(outDir, `${prefix}-${i}.png`);
    ffmpeg(['-ss', t.toFixed(3), '-i', srcFile, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '3', p]);
    return p;
  });
}

// Detect baked-in letterbox/pillarbox bars in the source (some clips are a wide
// shot placed on a vertical canvas with black bars). Returns a "W:H:X:Y" crop of
// the real content if it's meaningfully smaller than the source frame, else null.
// Without this, a source that's already ~1080x1920 with bars survives crop-to-fill
// untouched and the bars show up in the reel.
function detectContentCrop(srcFile, start) {
  let sw, sh;
  try { ({ width: sw, height: sh } = getDimensions(srcFile)); } catch (_) { return null; }
  const r = spawnSync('ffmpeg', ['-ss', start.toFixed(3), '-i', srcFile, '-vf', 'cropdetect=24:2:0', '-frames:v', '12', '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const matches = [...(r.stderr || '').matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!matches.length) return null;
  const m = matches[matches.length - 1];
  const [w, h] = [+m[1], +m[2]];
  if (!sw || !sh) return null;
  // Meaningful bars only — ignore 1-2px cropdetect jitter.
  if (w < sw * 0.97 || h < sh * 0.97) return `${m[1]}:${m[2]}:${m[3]}:${m[4]}`;
  return null;
}

// 9:16 1080x1920 center-crop-to-fill — strips any baked-in bars first, then scales
// up to fill and crops the overflow (no blurred bars). Trims [start,end),
// re-encodes H.264 30fps, strips audio. Spec §4.3.
function normalizeSegment(srcFile, start, end, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const dur = (end - start).toFixed(3);
  const debar = detectContentCrop(srcFile, start);
  const vf = `${debar ? `crop=${debar},` : ''}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30`;
  ffmpeg([
    '-ss', start.toFixed(3), '-i', srcFile, '-t', dur,
    '-vf', vf,
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', outPath,
  ]);
  return outPath;
}

module.exports = { getDuration, getDimensions, sampleFramesAtTimes, normalizeSegment };
