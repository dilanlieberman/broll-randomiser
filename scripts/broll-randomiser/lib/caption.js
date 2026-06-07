'use strict';

// Phase 3 — caption a generated reel via Submagic (Hormozi 3), mirroring the
// proven service-delivery pattern (scripts/service-delivery/07-submagic-caption.js):
// stage the video where Submagic can fetch it (VPS temp HTTP server), create the
// project, poll, download. Uses a broll-specific tmp file + port so it can run
// alongside the service-delivery captioner. Spec §5.5.

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SUBMAGIC_API_KEY;
const BASE_URL = 'https://api.submagic.co/v1';
const TEMPLATE_NAME = 'Hormozi 3'; // same template the service-delivery bot ships
const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 60;

const VPS_IP = '72.60.120.227'; // public IP Submagic fetches the video from
const SSH_TARGET = 'hostinger-vps'; // ~/.ssh/config alias (User root + IdentityFile)
const VPS_PORT = 9998; // 07 uses 9999; keep broll on its own port
const IS_VPS = fs.existsSync('/root') && process.platform === 'linux';

async function apiRequest(method, endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Submagic ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function pollUntilDone(projectId) {
  for (let i = 0; i < MAX_POLLS; i++) {
    const project = await apiRequest('GET', `/projects/${projectId}`);
    console.log(`  poll ${i + 1}: status=${project.status}`);
    if (project.status === 'completed') return project;
    if (project.status === 'failed') throw new Error(`Submagic failed: ${project.failureReason}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error('Submagic timed out');
}

function vpsExec(cmd) {
  const wrapped = IS_VPS ? cmd : `ssh ${SSH_TARGET} '${cmd}'`;
  return execSync(wrapped, { encoding: 'utf8', timeout: 30000, shell: '/bin/bash' }).trim();
}

// Caption inputPath -> outputPath. dictionary seeds spelling (e.g. business name).
async function captionReel(inputPath, outputPath, { title = 'B-Roll Reel', dictionary = [] } = {}) {
  if (!API_KEY) throw new Error('SUBMAGIC_API_KEY not set in .env');
  if (!fs.existsSync(inputPath)) throw new Error(`Reel not found: ${inputPath}`);

  // Sanitize: the name becomes both an rsync target and a fetchable URL, so it
  // must be free of spaces/special chars (VO filenames often have spaces).
  const remoteName = `broll-${path.basename(inputPath).replace(/[^A-Za-z0-9._-]/g, '_')}`;
  const remoteFile = `/tmp/${remoteName}`;

  console.log(IS_VPS ? '  staging reel locally on VPS...' : '  uploading reel to VPS...');
  if (IS_VPS) fs.copyFileSync(inputPath, remoteFile);
  else execSync(`rsync -az "${inputPath}" ${SSH_TARGET}:${remoteFile}`, { stdio: 'pipe', timeout: 120000 });

  console.log('  starting temp HTTP server...');
  // Fully detach (setsid + close all std streams) so ssh returns instead of
  // hanging on the still-open channel. Cleanup kills by port (fuser), avoiding
  // nested-quote issues and never touching the service-delivery server on 9999.
  vpsExec(`cd /tmp && (setsid python3 -m http.server ${VPS_PORT} </dev/null >/dev/null 2>&1 &); sleep 1; echo started`);

  try {
    const videoUrl = `http://${VPS_IP}:${VPS_PORT}/${remoteName}`;
    console.log('  creating Submagic project (Hormozi 3)...');
    const project = await apiRequest('POST', '/projects', {
      title,
      language: 'en',
      videoUrl,
      templateName: TEMPLATE_NAME,
      ...(dictionary.length ? { dictionary } : {}),
    });
    console.log(`  project: ${project.id}`);

    const completed = await pollUntilDone(project.id);

    console.log('  downloading captioned reel...');
    const res = await fetch(completed.downloadUrl);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
    console.log(`  saved: ${outputPath}`);
    return outputPath;
  } finally {
    try { vpsExec(`fuser -k ${VPS_PORT}/tcp 2>/dev/null; rm -f ${remoteFile}; echo cleaned`); } catch (_) {}
  }
}

module.exports = { captionReel, TEMPLATE_NAME };
