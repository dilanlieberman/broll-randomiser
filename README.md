# B-Roll Randomiser

My contractor video ads are a set format: an ElevenLabs voiceover, b-roll and subtitles. Ads fatigue, so I keep needing fresh ones. Now I drop in the voiceover and this outputs a finished ad, and can set it up as a paused Meta ad.

Built with Claude Code. Real commit history (4 – 26 Jun 2026), extracted from my private agency monorepo; secrets removed.

## How it works
- `ingest.js` / `audit-rooms.js`: builds a catalogue of b-roll clips, each visually audited (e.g. bathroom reels only use clips audited as pure bathrooms).
- `generate.js`: transcribes the voiceover (Whisper), segments it, matches each segment to clips (`lib/matcher`, `lib/sampling`), assembles with ffmpeg and adds Submagic captions.
- `post-to-meta.js`: creates the ad in Meta, always PAUSED.
- `discord-command.js`: runs it from a Discord message; `mac-tunnel.sh` connects the VPS bot to the Mac that renders.

## Stack
Node.js · Whisper · Claude API · ffmpeg · Submagic · Meta Marketing API · Discord.js · reverse SSH tunnel
