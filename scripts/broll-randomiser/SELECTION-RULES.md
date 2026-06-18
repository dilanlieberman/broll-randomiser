# B-Roll Selection Rules (the decision-making system)

How the matcher decides which clip plays under each voiceover line. These are
operator-established editorial rules — encoded in `lib/matcher.js`, `lib/domain.js`,
`lib/valence.js`, `lib/geo.js`. Read this before changing selection behavior.
Each rule below names the clip attribute and where it lives.

## 1. Service scope — a campaign only shows ITS service
The Discord message's service word sets the scope (`clipMatchesService`):
- **Roofing ad → roofing clips only.** No tree-removal, no interior water-damage, no
  silo/house demolition, no kitchens/bathrooms/decks. A clip is roofing only via
  `setting:roof` or a real roof-work tag (shingle/teardown/ridge/valley/flashing/
  gutter/inspection/aerial/underlayment/metal-roof/flat-roof). **`storm-damage` is
  NOT a roofing signal on its own** — it rides on tree removal, water damage, generic
  storm cleanup. A storm-damaged *roof* qualifies via its roof tag instead.
- **Bathroom ad → bathroom-interior clips only.** No kitchens, decks, pergolas,
  roofing, or anything `setting:exterior`. **Kitchen ad → kitchen-interior only**
  (no bathrooms). Same idea per service.
- Any roofing tag disqualifies a clip from remodeling even if it's mistagged
  `setting:interior` (some roof clips carry a stray `finished-interior-reveal`).

## 2. Pure content — no text, ever
Exclude any clip with overlaid/edited-in text (captions, titles, social @handles,
watermarks, post-added logos, graphics) OR prominent stickers/labels on the work
surface, OR competitor branding/title cards (e.g. "Our House Collective").
`has_text=true` excludes it. Incidental real-world branding (an excavator's DEERE
logo, packaging in the background) is NOT excluded — that's normal pro footage.
Catch tagger misses with `scan-text.js`.

## 3. No slideshows
Photo-montages shown as "video" (stills held on screen) are out. `scan-slideshow.js`
uses ffmpeg `freezedetect` (≥2 frozen segments = slideshow) → sets `exclude=true`.
The matcher skips any `exclude:true` clip (reusable "never use this clip" switch).

## 4. Region match (roofing/outdoor only)
Roofing reels are gated to the client's STATE via `lib/geo.js` (NJ→temperate, AK→snowy,
CA→coastal/arid). No Cali palms or Alaska snow in a NJ reel. Interiors are
region-agnostic (`scenery: indeterminate`). Default loose; `--strict` per job.

## 5. Valence contrast — match the emotional beat
The theme step tags each line `problem` / `solution` / `neutral`. The matcher then:
- **Problem / competitor lines** ("the dread, the chaos, the cheap guy, $25k big
  company") → run-down / demo / damage footage (`clipValence: problem`).
- **Us / result lines** ("our process", "you get a beautiful bathroom") → finished /
  clean / our-work footage (`aesthetic` + `neutral`). Aesthetic-led; never the downer
  footage. Never starves (falls back to ignoring valence rather than no clip).

## 6. Shot style — "guys on a roof, satisfying" (NOT drone)
Prefer clean, repetitive work close-ups — shingles going down, ridge caps, valley
work, tiling — the oddly-satisfying look. **Explicitly avoid drone/aerial fly-overs.**
Avoid ugly/off-brand material (commercial black-tar). `isSatisfying` in `pick()`
prefers work tags + `motion≠drone`, after diversity + quality.

## 7. End on a good note
The final clip is always finished/aspirational (finished reveal, ridge-cap finish,
clean roof) — NEVER teardown/storm-damage/debris/demolition/inspection. A good note
wins over theme match for the closer (`isClosingWorthy`).

## 8. Variety
- Every clip a different shot-subject; **never the same dominant subject back-to-back**.
- **One clip per source video per reel** (`perSourceCap: 1`) — two pieces of the same
  source read as "the same clip twice" even at different timestamps.
- Seeded per run, so re-running reshuffles to a visibly different cut.

## 9. Quality
Prefer `quality: good` over `usable`; `weak` is excluded.

---
**When the operator gives one-word style feedback** ("cinematic", "satisfying",
"clean"), it's ambiguous and maps to different shot types — confirm with a concrete
example or make the cheapest change and SHOW it before encoding it system-wide and
deploying. ("more cinematic" once got built as a drone bias; the operator meant
satisfying close-up work.)
