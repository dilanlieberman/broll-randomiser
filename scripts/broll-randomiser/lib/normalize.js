'use strict';

// Video I/O for ingest — ffprobe metadata, scene-detect chopping, 9:16
// normalization, and frame sampling. Thin wrappers over ffmpeg/ffprobe via
// execSync (matches scripts/service-delivery/lib/ffmpeg-splice.js conventions).

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function ffmpeg(args) {
  try {
    return execSync(`ffmpeg ${args} -y`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`ffmpeg failed: ${err.stderr?.toString().trim().split('\n').slice(-3).join(' ') || err.message}`);
  }
}

function ffprobe(args) {
  try {
    return execSync(`ffprobe ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`ffprobe failed: ${err.stderr?.toString().trim() || err.message}`);
  }
}

function getDuration(file) {
  return parseFloat(ffprobe(`-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`));
}

function getDimensions(file) {
  const out = ffprobe(`-v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${file}"`);
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
    ffmpeg(`-ss ${t.toFixed(3)} -i "${srcFile}" -frames:v 1 -vf "scale=512:-2" -q:v 3 "${p}"`);
    return p;
  });
}

// 9:16 1080x1920 center-crop-to-fill — same filter for vertical and horizontal
// (scale up to fill, crop the overflow; no blurred bars). Trims [start,end),
// re-encodes H.264 30fps, strips audio. Spec §4.2.
function normalizeSegment(srcFile, start, end, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const dur = (end - start).toFixed(3);
  ffmpeg(
    `-ss ${start.toFixed(3)} -i "${srcFile}" -t ${dur} ` +
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" ` +
    `-an -c:v libx264 -preset medium -pix_fmt yuv420p "${outPath}"`
  );
  return outPath;
}

module.exports = { getDuration, getDimensions, sampleFramesAtTimes, normalizeSegment };
