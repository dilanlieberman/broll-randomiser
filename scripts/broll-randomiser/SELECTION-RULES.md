# B-Roll Selection Rules (the decision-making system)

How the matcher decides which clip plays under each voiceover line. These are
operator-established editorial rules — encoded in `lib/matcher.js`, `lib/domain.js`,
`lib/valence.js`, `lib/geo.js`. Read this before changing selection behavior.
Each rule below names the clip attribute and where it lives.

## 1. Service scope — a campaign only shows ITS service (residential)
The Discord message's service word sets the scope (`clipMatchesService`):
- **Roofing ad → residential roofing clips only.** No tree-removal, no interior
  water-damage, no silo/house demolition, no kitchens/bathrooms/decks. A clip is
  roofing only via `setting:roof` or a real roof-work tag (shingle/teardown/ridge/
  valley/flashing/gutter/inspection/aerial/underlayment). **`storm-damage` is NOT a
  roofing signal on its own** — it rides on tree removal, water damage, generic storm
  cleanup. A storm-damaged *roof* qualifies via its roof tag instead.
- **Residential only — homeowners must relate to it.** `flat-roof-membrane`
  (gravel-ballasted/TPO commercial flat roofs) is a hard DISQUALIFIER in `domain.js`
  (`COMMERCIAL_TAGS`), even though it's shot `setting:roof` — a homeowner can't relate
  to a commercial roof. `metal-roof-install` clips are all `exclude:true` at the
  catalog level (their only source is a damaged "fell through the roof" video — holes,
  not relatable work). Operator: *"a hole in a commercial roof isn't"* relatable.
- **Bathroom ad → bathroom-interior clips only.** No kitchens, decks, pergolas,
  roofing, or anything `setting:exterior`. **Kitchen ad → kitchen-interior only**
  (no bathrooms). Same idea per service. Kitchen additionally REQUIRES a kitchen-remodel tag (real kitchens only) — generic interior clips (walk-in closets, drywall, loose tiling, bathroom reveals) were flooding kitchen ads.
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
- **Drone aerials are ALWAYS strict-region + require a state.** An aerial reveals
  geography (palms/snow/terrain) and property scale far more than a close-up, so a clip
  that `isDroneAerial` (`roof-aerial` tag OR `motion:drone`) is eligible only when a
  `--state` is set AND it passes a STRICT scenery match — even on an otherwise loose
  run. No state set → no aerials at all (ground-level establishing/walkthrough carries
  the aesthetic half instead).

## 5. Valence contrast — match the emotional beat
The theme step tags each line `problem` / `solution` / `neutral`. The matcher then:
- **Problem / competitor lines** ("the dread, the chaos, the cheap guy, $25k big
  company") → run-down / demo / damage footage (`clipValence: problem`).
- **Us / result lines** ("our process", "you get a beautiful bathroom") → finished /
  clean / our-work footage (`aesthetic` + `neutral`). Aesthetic-led; never the downer
  footage. Never starves (falls back to ignoring valence rather than no clip).

## 6. Shot style — interleave satisfying close-ups WITH aesthetic wides
Two halves the matcher alternates (operator wants a *mix*, not close-ups only):
- **Satisfying** (`SATISFYING_TAGS`, `isSatisfying`): clean, repetitive work close-ups
  — shingles/tiles going down with the nailer, ridge caps, valley work — the
  oddly-satisfying look. Always `motion≠drone`.
- **Aesthetic** (`AESTHETIC_TAGS`, `isAesthetic`): the nice wide/cinematic half —
  `establishing-exterior`, `roof-walkthrough`, and `roof-aerial`.

`pick()` biases each pick toward the category OPPOSITE the previous clip (after
diversity + quality), so a reel reads A/B/A/B instead of all close-ups; it falls back
to the satisfying-first preference and never starves.

**Drone reversal (2026-06-26):** drone/aerial is allowed again, but ONLY as an
*aesthetic accent* — never the satisfying-closeup bias (`isSatisfying` still excludes
`motion:drone`), and only residential + strict-state-matched (Rule 4). This walks back
the blanket "avoid drone" from 2026-06-18. Still avoid ugly/off-brand material
(commercial black-tar) and never spam aerials.

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
