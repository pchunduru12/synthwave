# Architecture review and beta recommendation

## What the uploaded docs say

The Word docs describe a more mature platform:
- Expo mobile app
- modular API server
- worker/orchestrator
- PostgreSQL + Redis
- S3/CloudFront
- stage-by-stage generation pipeline
- test strategy and release process

## What the uploaded code actually is

The delivered code is materially behind the docs:
- backend is effectively a monolith
- the async pipeline runs inside the API process
- the “frontend” file is not a real mobile codebase; it is a single reference artifact containing string literals
- testing exists, but the implementation surface is narrower than the documentation promises

## Practical beta path

### Phase 1 — must-have before beta
1. Estimate cost before every generation
2. Add daily/monthly budgets and soft warnings
3. Persist usage events per stage
4. Move orchestration behind a queue interface
5. Convert frontend into a real Expo Router file tree
6. Add cancel / retry / failure-safe UX

### Phase 2 — controlled beta
1. Replace in-memory repo with Postgres repositories
2. Swap local queue adapter for BullMQ or SQS
3. Add signed media URLs
4. Add push notifications or websocket status delivery
5. Add admin analytics and abuse controls

### Phase 3 — premium differentiation
1. Voice workflows and custom model lane for Suno power users
2. Remix/version history
3. Prompt packs and creator presets
4. Team workspaces and shared budgets

## Why this structure is better

- It reduces API timeout risk
- It makes spend visible before and after creation
- It makes provider routing explicit
- It keeps the mobile app simple and testable
- It creates a clean seam for real infrastructure without blocking UI progress
