# Open pull requests on the upstream project

The upstream project ([NoeFabris/opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth))
has had no commit since 2026-10-27, while community pull requests and issues
keep arriving. This page records, for every open PR at the time of writing,
whether its problem exists in this line and what happened to it — the answer a
maintainer would give in review, written down so it does not have to be
rediscovered.

Last reviewed: 2026-11-08, against 2.5.4.

## #612 — RPC output rejected when quota fields are `undefined`

**Problem in this line: no.** The failure is in the accounts RPC
(`Server failed to encode its response`), which the upstream registers through
`src/plugin/account-management.ts`. This line has no RPC surface at all: nothing
under `src/` registers RPC handlers, and account listing is the UI menu in
`src/plugin/ui/`. The code path that produced the 500 does not exist here.

## #613 — `Antigravity plugin has been disposed` after a plugin reload

**Problem in this line: no.** The fix forwards inference to the live plugin
instance after OpenCode reloads plugins and calls `cleanup()` on the previous
one. This line's v2 adapter (`src/v2/adapter.ts`) has no `disposed` flag, no
instance lifetime signal, and no `cleanup()` that aborts in-flight requests —
there is no instance that can be disposed out from under a chat. The bug is a
consequence of that design; this line does not share it.

## #608 — Add the current model inventory as a static fallback

**Problem in this line: deliberately not fixed this way.** The PR asks for the
full Antigravity catalog to be registered as a built-in fallback so newer ids
appear before discovery completes. `src/plugin/config/model-discovery.ts`
documents why that is not done: the catalog is full of ids the official
Antigravity client does not offer, and they cannot be told apart by status code.
Measured against a real consumer account on 2026-10-15, 12 of 25 catalog ids
answered `200` **and** performed tool calls, including generations older than
what the client offers. Mirroring the catalog would put unroutable models in the
picker. The curated whitelist plus discovery — used only to surface an id
*newer* than the catalog, such as the Argon line — is the deliberate design.

## #609 — Move plugin state to OpenCode's data directory

**Problem in this line: yes, and it is worth doing — but not as it stands.**
State does live in a directory OpenCode watches: `antigravity-accounts.json`,
`antigravity-signature-cache.json` and `antigravity-logs/`, resolved by
`getConfigDir()` in `src/plugin/storage.ts`. Writes there can trigger a reload
while a session is open. The PR moves all of it under the data directory, which
is the right direction, but it silently moves every existing user's accounts and
has no migration. Doing that in a minor release would make people's accounts
"disappear". It needs: a one-time migration from the old path, the old path kept
readable for a release, and an explicit note in the changelog. Tracked, not
merged.

## #614 — Collapse reasoning tiers into model variants

**Already the design of this line.** `src/plugin/config/models.ts` registers
`variants` per model (`low`/`medium`/`high`, and `max` where the family has it),
`docs/MODEL-VARIANTS.md` explains them, and 2.5.4 fixed the part upstream still
lacks: the selected variant is actually forwarded to the backend
(`thinkingLevel` or `thinkingBudget`) instead of every request going out at the
lowest tier.

What #614 adds beyond this line is discovering the tiers from the account's
`displayName` instead of the curated catalog, so a newly advertised effort works
without a plugin release. That part is a candidate; the collapsing itself is
already here.

## Reading this list

Three of the five describe failures this line cannot have, because the code they
patch no longer exists here. One contradicts a measured design decision. One
(good) state migration is real and is the only upstream PR that should still
land here — with a migration, in its own release.
