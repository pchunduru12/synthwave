# SynthWave

This bundle upgrades the previous prototype in four important ways:

- **Persistent users and creations** using a local SQLite database via `sql.js`
- **Improved prompt intelligence** so devotional/custom prompts influence title, lyrics, image prompt, and music prompt more strongly
- **Inline media playback** on the creation detail page for web (audio + video)
- **Safer web UX** with inline auth/create errors and guided chip-based inputs

## Recommended low-cost path
For the first serious prototype run:
- OpenAI for text + image
- FFmpeg for MP3 fallback + MP4 rendering
- Suno adapter only when you are ready

## Key outputs per creation
Saved under `backend/storage/<creationId>/`:
- `prompt-package.json`
- `lyrics.txt`
- `cover.png`
- `song.mp3`
- `video.mp4`
- `synthwave.db` persists users, creations, budgets, and usage history

## Why this bundle is better
- restarting the backend no longer wipes users or creations
- the detail page can preview media inline on web
- custom prompts like "Radha Krishna bhakti song" are interpreted more intelligently
- the prototype is closer to a true beta-ready workflow

Read `INSTALLATION_GUIDE.md` for setup and deployment.
