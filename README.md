# SynthWave

An AI music generation app you can run yourself: describe a song, and SynthWave generates the title, lyrics, cover art, and music — then renders it as a playable track or video. Bring your own domain and API keys; everything runs on your own infrastructure.

## Project Team

SynthWave was conceived and developed as a collaborative AI application project.

### Padmaja Chunduru — Product & Functional Lead

- Conceived the SynthWave product and its core use cases
- Defined functional requirements and product direction
- Provided recommendations for features, workflows, and user experience
- Directed the application's AI music-generation capabilities and functional evolution
- Performed functional review and provided iterative feedback throughout development

### [Shashank (@shashankn165)](https://github.com/shashankn165) — Technical Lead & Lead Developer

- Led the technical design and implementation of the SynthWave application
- Developed the application frontend and user experience
- Implemented Python-based integrations connecting the application with multiple LLM and generative AI services
- Built and integrated the technical components required for the AI generation workflow
- Set up and configured the production environment on DigitalOcean
- Configured the application domain and deployment infrastructure
- Led technical troubleshooting, integration, deployment, and application engineering

SynthWave combines Padmaja's product vision and functional direction with Shashank's technical engineering, integration, and deployment work.

See [CONTRIBUTORS.md](CONTRIBUTORS.md) for additional contribution details.

## What it does

- **Prompt to song** — a short description (mood, theme, language, style) becomes a complete creation: title, lyrics, cover image, and generated audio
- **Multi-language** — including Indian languages, with a guided chip-based input UX
- **Audio & video rendering** — FFmpeg composites cover art and audio into shareable MP4s, with watermarking
- **Playback in place** — creations play inline on web and mobile

## How it's built

| Layer | Stack |
|---|---|
| Frontend | Expo / React Native — one codebase for web and mobile |
| Backend | Node.js + Express + TypeScript |
| AI providers | OpenAI (text + image), Suno adapter and MiniMax (music) — routed through a provider abstraction |
| Persistence | SQLite (`sql.js`), local artifact storage |
| Media | FFmpeg for MP3 fallback and MP4 composition |
| Deploy | Docker Compose (api, web, music adapter, Caddy) with automatic TLS |

## Designed for cost discipline

Generative APIs get expensive fast, so cost governance is built in rather than bolted on:

- Per-user **daily soft/hard limits** and **monthly hard limits** (USD)
- A **cost estimator** that prices each creation before provider calls are made
- **Usage tracking** per user and provider
- **Mock provider mode** (`ENABLE_MOCK_PROVIDERS=true`) — the entire app runs end-to-end with zero paid API calls, which is also the default for local development

## Run it locally

```bash
cd backend
cp .env.example .env   # mock mode is on by default — no API keys needed
npm install
npm run dev
```

Then start the frontend:

```bash
cd mobile
npm install
npm run web
```

To generate real music and images, add your `OPENAI_API_KEY` (and optionally a Suno-compatible endpoint or MiniMax key) to `.env` and set `ENABLE_MOCK_PROVIDERS=false`.

## Deploying

The `deploy/` folder contains a production Docker Compose setup: API and web containers behind Caddy with automatic Let's Encrypt TLS, security headers, and JSON access logs. Point the `DOMAIN` variable in your `.env.production` at your own domain and Caddy handles certificates automatically. See `deploy/docker-compose.yml` and `deploy/Caddyfile`.

## Status

Actively developed; runs in a private deployment. Built as a hands-on exploration of what it takes to ship a multi-provider generative AI product responsibly — including auth, admin controls, usage limits, and cost transparency.

## License

MIT
