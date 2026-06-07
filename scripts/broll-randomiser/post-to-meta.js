'use strict';

// Post a generated b-roll reel as a PAUSED video ad into an existing Meta ad set.
// Reuses the upload/creative/ad patterns from service-delivery/11-leadgen-campaign.js.
//
//   node post-to-meta.js <reel.mp4>
//
// Ad config (account/page/adset/link/copy) is embedded below for this One Call ad;
// adapt CONFIG for future reels. Always creates the ad PAUSED — review + activate
// in Ads Manager.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = process.env.META_API_VERSION || 'v25.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const CONFIG = {
  adAccountId: 'act_2947264552290336', // One Call x Pinnacle
  pageId: '109398820670337',
  adsetId: '120244572748810132', // "2 Videos 2 Images | May 31st – Copy"
  funnelUrl: 'https://www.onecallconst.com/roofing-offer',
  adName: 'Video 3 | Derean',
  copy: {
    primary: [
      "There's a quiet little rule New Jersey homeowners are using this summer to get a new roof for way less.",
      'Most people never figure it out.',
      "It's the kind of thing your neighbor seems to know — but nobody ever tells you.",
      'So here it is: stop buying your roof from a company. Buy it from the owner.',
      'Let me explain why that one thing saves you thousands.',
      "See, there's two ways to get burned on a roof.",
      'Go too cheap — some guy slaps on bargain shingles, rushes the whole job, and it\'s curling off by next winter. Now you\'re out the money AND out a roof.',
      'Go too expensive — one of those big outfits with twenty trucks and forty salesmen quotes you double. The offices, the fleet, the army of salesmen…',
      'Guess who pays for all that? Yup. You. It\'s baked right into your number.',
      "That's where I come in.",
      "My name's Derean, I own One Call Construction. And I do things differently.",
      'You deal with me — the owner — not a salesman working a commission.',
      "Better quote than the big guys. Same high-quality materials they'd use anyway.",
      'Lean, mean operation. Smart crews. Low overhead. And the savings get passed straight to you.',
      'A roof done clean. Done right. At a price that actually makes sense.',
      'Not too cheap. Not a rip-off. Fair.',
      'Click the Get Quote button below 👇',
    ].join('\n\n'),
    headline: 'Save Thousands With Owner-Direct Pricing',
    description: '⭐⭐⭐⭐⭐ One Call Construction',
    cta: 'GET_QUOTE',
  },
};

async function metaPost(endpoint, body, label) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: ACCESS_TOKEN }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    const err = data.error || {};
    throw new Error(`${label} failed: ${[err.error_user_title, err.error_user_msg].filter(Boolean).join(' — ') || err.message || `HTTP ${res.status}`}`);
  }
  return data;
}

async function metaGet(endpoint, fields) {
  const u = new URL(`${BASE_URL}${endpoint}`);
  u.searchParams.set('access_token', ACCESS_TOKEN);
  if (fields) u.searchParams.set('fields', fields);
  const data = await (await fetch(u)).json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

function uploadImage(adAccountId, imagePath) {
  const formBody = new URLSearchParams();
  formBody.append('access_token', ACCESS_TOKEN);
  formBody.append('bytes', fs.readFileSync(imagePath).toString('base64'));
  formBody.append('name', path.basename(imagePath));
  return fetch(`${BASE_URL}/${adAccountId}/adimages`, { method: 'POST', body: formBody })
    .then((r) => r.json())
    .then((d) => {
      if (d.error) throw new Error(`thumbnail upload: ${d.error.message}`);
      return d.images[Object.keys(d.images)[0]].hash;
    });
}

function uploadVideo(adAccountId, videoPath) {
  const out = execSync(
    `curl -s -X POST -F "access_token=${ACCESS_TOKEN}" -F "name=${path.basename(videoPath)}" -F "source=@${videoPath}" "${BASE_URL}/${adAccountId}/advideos"`,
    { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024, timeout: 180000 }
  );
  const data = JSON.parse(out);
  if (data.error) throw new Error(`video upload: ${data.error.message}`);
  return data.id;
}

// Meta must finish processing the video before a creative can reference it.
async function waitForVideo(videoId, { attempts = 30, intervalMs = 6000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const v = await metaGet(`/${videoId}`, 'status');
    const phase = v.status && (v.status.video_status || v.status.processing_progress != null ? v.status.video_status : v.status);
    if (v.status && v.status.video_status === 'ready') return;
    if (v.status && v.status.video_status === 'error') throw new Error('video processing failed');
    console.log(`  video processing… (${JSON.stringify(v.status)})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('video processing timed out');
}

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('Usage: node post-to-meta.js <reel.mp4>');
    process.exit(1);
  }
  const { adAccountId, pageId, adsetId, funnelUrl, adName, copy } = CONFIG;
  console.log(`Posting "${adName}" → ad set ${adsetId} (PAUSED)\n`);

  console.log('1/5 uploading video…');
  const videoId = await uploadVideo(adAccountId, videoPath);
  console.log(`    video_id: ${videoId}`);

  console.log('2/5 waiting for video to process…');
  await waitForVideo(videoId);

  console.log('3/5 thumbnail…');
  const thumbPath = path.join(path.dirname(videoPath), 'ad-thumb.jpg');
  execSync(`ffmpeg -y -ss 2 -i "${videoPath}" -frames:v 1 -q:v 3 "${thumbPath}"`, { stdio: 'pipe' });
  const thumbnailHash = await uploadImage(adAccountId, thumbPath);

  console.log('4/5 creating ad creative…');
  const creative = await metaPost(`/${adAccountId}/adcreatives`, {
    name: `${adName} — creative`,
    object_story_spec: JSON.stringify({
      page_id: pageId,
      video_data: {
        video_id: videoId,
        image_hash: thumbnailHash,
        message: copy.primary,
        title: copy.headline,
        link_description: copy.description,
        call_to_action: { type: copy.cta, value: { link: funnelUrl } },
      },
    }),
    degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: {} }),
  }, 'Creative');
  console.log(`    creative_id: ${creative.id}`);

  console.log('5/5 creating ad (PAUSED)…');
  const ad = await metaPost(`/${adAccountId}/ads`, {
    name: adName,
    adset_id: adsetId,
    creative: JSON.stringify({ creative_id: creative.id }),
    contextual_multi_ads: JSON.stringify({ enroll_status: 'OPT_OUT' }),
    status: 'PAUSED',
  }, 'Ad');

  console.log(`\n✅ Created PAUSED ad "${adName}" (ad_id: ${ad.id}) in ad set ${adsetId}.`);
  console.log('   Review + activate in Ads Manager.');
}

if (require.main === module) main().catch((e) => { console.error(`\nFATAL: ${e.message}`); process.exit(1); });
