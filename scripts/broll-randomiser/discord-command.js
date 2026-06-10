'use strict';

// Phase 4 — Discord b-roll command handler. Drop-in for the VPS bot's
// messageCreate (a dedicated b-roll channel). A message like "roofing ad NJ"
// with an audio attachment → parse → download VO → generate (domain+state gated,
// good-note close, diverse) → caption (Hormozi 3) → reply with the reel.
//
// Wiring (in scripts/discord-bot.js messageCreate): when channelId === BROLL
// channel, call handleBrollRequest(message). Kept self-contained + injectable so
// it can be unit-tested without a live Discord/render.  Spec §6.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { parseCommand } = require('./lib/command');
const { generate } = require('./generate');

// Discord's upload cap on a non-boosted server is 10MB (live test rejected 21.6MB
// with code 40005). Re-encode to a duration-derived bitrate targeting ~8MB so it
// posts inline. The full-quality reel stays on the VPS. (Boost the server to Tier 2
// for a 50MB cap if higher-quality Discord delivery is wanted later.)
const DISCORD_CAP_MB = 9;
const TARGET_MB = 8;

function compressForDiscord(inputPath) {
  const sizeMB = fs.statSync(inputPath).size / 1024 / 1024;
  if (sizeMB <= DISCORD_CAP_MB) return inputPath;
  const dur = parseFloat(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath], { encoding: 'utf8' }).trim()
  );
  const audioK = 128;
  const videoK = Math.max(700, Math.floor((TARGET_MB * 8 * 1024) / dur) - audioK);
  const out = inputPath.replace(/\.mp4$/, '-discord.mp4');
  execFileSync('ffmpeg', [
    '-y', '-i', inputPath,
    '-c:v', 'libx264', '-b:v', `${videoK}k`, '-maxrate', `${Math.floor(videoK * 1.3)}k`, '-bufsize', `${videoK * 2}k`,
    '-preset', 'fast', '-c:a', 'aac', '-b:a', `${audioK}k`, '-movflags', '+faststart', out,
  ], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  return out;
}

const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg)$/i;
const DOWNLOAD_DIR = path.join(__dirname, '../../data/broll-randomiser/.incoming');

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

// deps lets tests inject a fake generate/download; defaults wire the real ones.
async function handleBrollRequest(message, deps = {}) {
  const { generateFn = generate, download = downloadTo, reply = (m) => message.reply(m) } = deps;

  const parsed = parseCommand(message.content || '');
  if (!parsed || !parsed.domain) {
    await reply('Couldn\'t read that. Use e.g. `roofing ad NJ` or `bathroom ad NY` with a voiceover attached.');
    return { ok: false, reason: 'unparseable' };
  }
  if (parsed.domain === 'roofing' && !parsed.state) {
    await reply('Roofing reels need a state for region matching, e.g. `roofing ad NJ`.');
    return { ok: false, reason: 'missing-state' };
  }

  const atts = message.attachments ? [...message.attachments.values()] : [];
  const audio = atts.find((a) => AUDIO_RE.test(a.name || a.url || ''));
  if (!audio) {
    await reply('Attach a voiceover audio file (.mp3/.wav) with the command.');
    return { ok: false, reason: 'no-audio' };
  }

  await reply(`🎬 ${parsed.service}${parsed.state ? ` (${parsed.state})` : ''} — transcribing & matching b-roll...`);
  const audioPath = await download(audio.url, path.join(DOWNLOAD_DIR, `${Date.now()}-${audio.name || 'vo.mp3'}`));

  const { outPath, captionedPath } = await generateFn(audioPath, {
    service: parsed.service,
    domain: parsed.domain,
    state: parsed.state,
    caption: true,
  });
  const reelPath = captionedPath || outPath;
  const postPath = compressForDiscord(reelPath); // shrink under Discord's upload cap

  await reply({ content: '📤 Done — captioned reel:', files: [postPath] });
  return { ok: true, reelPath, postPath, parsed };
}

module.exports = { handleBrollRequest, AUDIO_RE };
