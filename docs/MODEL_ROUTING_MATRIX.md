# Model routing matrix

## Design principle

Do not send every request to the same model.
Route by **task type**, **latency need**, and **cost sensitivity**.

## Recommended routing

| Task | Economy | Balanced | Premium |
|---|---|---|---|
| Prompt normalization | Gemini 2.5 Flash-Lite | GPT-5.4-mini | GPT-5.4-mini |
| Safety rewrite / policy check | Gemini 2.5 Flash-Lite | GPT-5.4-mini | Claude Haiku 4.5 |
| Metadata extraction / title / tags | Gemini 2.5 Flash-Lite | GPT-5.4-nano | GPT-5.4-mini |
| Lyric blueprint | Claude Haiku 4.5 | Claude Haiku 4.5 | Claude Sonnet 4.6 |
| Lyric refinement | Skip or template | GPT-5.4-mini | Claude Sonnet 4.6 |
| Suno prompt packaging | Gemini 2.5 Flash-Lite | GPT-5.4-mini | Claude Haiku 4.5 |
| Cover prompt | Gemini 2.5 Flash-Lite | GPT-5.4-mini | Claude Haiku 4.5 |

## Additional rules

- Avoid premium models for short deterministic transforms
- Cache repeated system prompts and style packs
- Use batch/flex lanes for offline experiments and evaluations
- Keep a provider registry so model names can change without business-logic edits

## App behavior recommendation

Expose three creation modes:
- **Economy** — lowest cost, fastest, fewer rewrite passes
- **Balanced** — best default
- **Premium** — high-touch lyric refinement and retry budget

## Spend controls to surface in product

- estimated total cost
- stage-level estimate
- daily used / remaining
- monthly used / remaining
- per-job maximum
- warning banner when soft limit reached
- hard block when hard limit exceeded
