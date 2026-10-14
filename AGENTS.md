# AGENTS.md

<!-- agent-baseline:start -->
## Baseline rules (same in every repo)
- Changes go through a draft PR. Never push to main.
- Read before you write: find every use of a symbol; update all call sites in the same PR.
- Minimal diff, one concern per PR. No unrequested refactors, reformatting, or dependency bumps.
- Never commit secrets. Self-review the full diff before opening the PR.
- Verify with CI before claiming done. Green checks are required.
<!-- agent-baseline:end -->

## Project
- What: OpenCode plugin that authenticates Google Antigravity and exposes its models as a provider.
- Stack: TypeScript (Node 20+), ESM. `dist/` is build output produced by `tsc`.
- Base:      main

## Verify (must pass)
- install:   npm ci
- typecheck: npm run typecheck
- test:      npm test
- build:     npm run build

## Invariants
- The provider/plugin interface consumed by OpenCode is public. Do not rename, remove or
  re-type exported symbols without updating every call site in the same PR.
- The model catalog lives in `src/plugin/config/models.ts`. Changing it affects user config;
  keep existing model ids backward compatible.
- Auth, entitlement and rate-limit logic is sensitive. Never weaken error handling or silently
  swallow failures to make something pass.

## Committed artifacts
- `dist/` is committed and CI verifies it is in sync with `src/`. After any `src/` change run
  `npm run build` and commit the regenerated `dist/` in the same PR.

## Gotchas
- Tests mock `./token` (refresh-queue). Do not rely on real network access in tests.
- `antigravity-accounts.json` and any credentials/tokens must never be committed.
- CI (`.github/workflows/ci.yml`) runs typecheck, tests, build and a `dist/` sync check, and posts
  an `Automated verification` comment on each PR.
