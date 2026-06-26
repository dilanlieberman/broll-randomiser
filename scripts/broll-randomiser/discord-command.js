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

// --- Full-quality master delivery -------------------------------------------
// The Discord post is a crushed ~8MB preview; the real deliverable is the
// full-quality captioned master. File it into new-ad-iterations/<date>/<ad>/ and,
// as the LAST step of the flow, push it to the Mac (canonical) over the reverse
// SSH tunnel — fires per Discord prompt. If the Mac is asleep/offline the master
// stays on the VPS and mac-tunnel.sh catch-up-pulls it on the next reconnect.
const IS_VPS = fs.existsSync('/root') && process.platform === 'linux';
const ITER_ROOT = path.join(__dirname, '../../new-ad-iterations');
const MAC_TUNNEL_PORT = 2222;
const MAC_PUSH_TARGET = 'dilanlieberman@localhost:/Users/dilanlieberman/smma-agency/new-ad-iterations/';
const VPS_BACKHAUL_KEY = '/root/.ssh/id_ed25519'; // VPS->Mac key, authorized on the Mac (from="127.0.0.1")

function nyDate() {
  // YYYY-MM-DD in America/New_York (Pinnacle clients are US-based).
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Copy the full master + manifest into new-ad-iterations/<date>/<service>-<state>-<seed>/.
// Returns {date, adName} or null if the reel file is missing (e.g. injected test stub).
function fileMaster(reelPath, outPath, parsed) {
  if (!reelPath || !fs.existsSync(reelPath)) return null;
  const seedMatch = path.basename(outPath || '').match(/-(\d+)-broll\.mp4$/);
  const seed = seedMatch ? seedMatch[1] : String(Date.now());
  const adName = `${parsed.service}-${parsed.state || 'nostate'}-${seed}`.replace(/[^A-Za-z0-9._-]/g, '_');
  const date = nyDate();
  const adDir = path.join(ITER_ROOT, date, adName);
  fs.mkdirSync(adDir, { recursive: true });
  fs.copyFileSync(reelPath, path.join(adDir, `${adName}.mp4`));
  const manifest = (outPath || '').replace(/\.mp4$/, '.manifest.txt');
  if (manifest && fs.existsSync(manifest)) fs.copyFileSync(manifest, path.join(adDir, `${adName}.manifest.txt`));
  return { date, adName };
}

// Push the day's folder to the Mac through the reverse tunnel (VPS localhost:2222).
// True = delivered; false = Mac unreachable (mac-tunnel.sh catches up on reconnect).
function pushToMac(date) {
  const sshCmd = `ssh -p ${MAC_TUNNEL_PORT} -i ${VPS_BACKHAUL_KEY} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10`;
  try {
    execFileSync('rsync', ['-az', '-e', sshCmd, path.join(ITER_ROOT, date), MAC_PUSH_TARGET],
      { stdio: 'pipe', timeout: 120000 });
    return true;
  } catch (_) {
    return false;
  }
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

  // File the full-quality master and (last step) push it to the Mac. Never let a
  // delivery hiccup kill the reel post — the master is on the VPS regardless.
  let filed = null;
  let delivered = null;
  try {
    filed = fileMaster(reelPath, outPath, parsed);
    if (filed && IS_VPS) delivered = pushToMac(filed.date);
  } catch (err) {
    console.error('[broll] master filing/delivery failed:', err.message);
  }

  let where = '';
  if (filed) {
    const loc = `new-ad-iterations/${filed.date}/${filed.adName}/`;
    if (!IS_VPS) where = `\n🗂️ Full master filed locally → ${loc}`;
    else if (delivered) where = `\n🗂️ Full master → your Mac: ${loc}`;
    else where = `\n🗂️ Full master on VPS (Mac offline — syncs on reconnect): ${loc}`;
  }

  await reply({ content: `📤 Done — captioned reel (preview):${where}`, files: [postPath] });
  return { ok: true, reelPath, postPath, parsed, filed, delivered };
}

module.exports = { handleBrollRequest, AUDIO_RE };
