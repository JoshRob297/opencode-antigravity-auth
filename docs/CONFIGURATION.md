# Configuration

**English** | [Español](CONFIGURATION.es.md)

Create `~/.config/opencode/antigravity.json` (or `.opencode/antigravity.json` in project root):

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

Most settings have sensible defaults — only configure what you need.

## Hiding Foreign Google Models

`models.dev` publishes a `google` provider with the full Gemini lineup. Because the
Antigravity OAuth credential makes that provider available, every one of those models
shows up in the picker even though only the curated Antigravity models can be served.
With `hide_foreign_models` enabled the plugin disables every `google` model that is not
part of its curated catalog:

```json
// ~/.config/opencode/antigravity.json
{
  "hide_foreign_models": true
}
```

- **Opt-in on purpose.** If you have your own Google API key (`GEMINI_API_KEY`) the full
  `models.dev` list is valid, so the default is `false`.
- **Re-evaluated on every load**, so a catalog refresh can no longer push the full Gemini
  lineup back into the selector.
- **Fail-open.** An editor that cannot list models, or any error, leaves the list as is.

---

## Quick Start

**Minimal config (recommended for most users):**

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

**With web search enabled:**

The plugin provides a `google_search` tool that the model can call to search the web. No configuration is needed - the tool is always available.

---

## Model Behavior

Settings that affect how the model thinks and responds.

| Option | Default | Description |
|--------|---------|-------------|
| `keep_thinking` | `false` | Preserve Claude's thinking blocks across turns. **Warning:** enabling may degrade model stability. |
| `session_recovery` | `true` | Auto-recover from tool_result_missing errors |
| `auto_resume` | `false` | Auto-send resume prompt after recovery |
| `resume_text` | `"continue"` | Text to send when auto-resuming |

> **Note:** The `web_search` config options are deprecated. Google Search is now implemented as a dedicated `google_search` tool that the model can call explicitly.

### About `keep_thinking`

When `true`, Claude's thinking blocks are preserved in conversation history:
- **Pros:** Model remembers its reasoning, more coherent across turns
- **Cons:** May degrade model stability, slightly larger context

When `false` (default), thinking is stripped:
- **Pros:** More stable model behavior, smaller context
- **Cons:** Model may be less coherent, forgets previous reasoning

---

## Account Rotation

Settings for managing multiple Google accounts.

| Option | Default | Description |
|--------|---------|-------------|
| `account_selection_strategy` | `"hybrid"` | How to select accounts |
| `scheduling_mode` | `"balance"` | Scheduling policy (`"balance"`, `"cache_first"`, `"performance_first"`) |
| `switch_on_first_rate_limit` | `true` | Switch account immediately on first 429 |
| `max_all_blocked_wait_seconds` | `120` | Maximum cumulative seconds to retry when all accounts are blocked before fail-fast termination |
| `max_rate_limit_wait_seconds` | `300` | Maximum single reset wait in seconds before immediately throwing a rate-limit error |
| `pid_offset_enabled` | `false` | Distribute sessions across accounts (for parallel agents) |
| `quota_fallback` | `false` | Deprecated (ignored). Kept for backward compatibility; Gemini fallback is automatic |

### Strategy Guide

| Your Setup | Recommended Strategy | Why |
|------------|---------------------|-----|
| **1 account** | `"sticky"` | No rotation needed, preserve prompt cache |
| **2-3 accounts** | `"hybrid"` (default) | Smart rotation with health scoring |
| **4+ accounts** | `"round-robin"` | Maximum throughput |
| **Parallel agents** | `"round-robin"` + `pid_offset_enabled: true` | Distribute across accounts |

### Available Strategies

| Strategy | Behavior | Best For |
|----------|----------|----------|
| `sticky` | Same account until rate-limited | Single account, prompt cache |
| `round-robin` | Rotate on every request | Maximum throughput |
| `hybrid` | Health score + token bucket + LRU | Smart distribution (default) |

---

## Quota Reporting

`antigravity_quota` (and the `/antigravity-quota` command) report the per-account shape the backend returns now:

- **One table per model family**: `Gemini Models (Flash / Pro)`, `Claude & GPT Models (Opus / Sonnet / GPT-OSS)` and `Gemini 4 Argon`, which has its own weekly bucket (`gemini-argon-wtu-weekly`) and is not folded into the Gemini table.
- **Both windows** (5h and weekly) with the bar, and only the windows that family actually has - Argon prints the weekly column alone.
- **Short reset countdown** per window (`3h 54m`, `6d 22h`), taken from the timestamp the backend declares. No full date/time clutter.
- **`USABLE` instead of a static health score**: an account is `no · <countdown>` while any window of that family sits at `0%`, because a 5h bar with quota left cannot be used once the weekly bucket is empty. Only accounts that can actually serve the family show `yes`.
- **Account capabilities (measured)**: models each account can reach, whether it has Gemini 4 Argon (with its remaining percentage and reset countdown), **Claude 4.6 vs Claude 5.5** separately, and whether `gemini-3.8-flash` is available. Claude quota is shared by the family, so a Free account can have Claude quota and still lack 5.5: measured 2026-10-31, `claude-sonnet-4-6` answers `200` on both Free accounts while `claude-sonnet-5-5-medium` answers `404`. Accounts that were never measured say `not measured` instead of guessing.

```
## Gemini 4 Argon (own weekly bucket)
QUOTA (weekly)    RESET (weekly) USABLE          ACCOUNT
[██████████] 99%  6d 22h         yes             joshuaadair.hr

## Gemini Models (Flash / Pro)
QUOTA (5h)        RESET (5h)     QUOTA (weekly)    RESET (weekly) USABLE          ACCOUNT
[██████████] 99%  3h 53m         [██████████] 99%  6d 22h         yes             joshuaadair.hr
[██████████] 100% 3h 38m         [░░░░░░░░░░] 0%   11h 59m        no · 11h 59m    hrjoces22

## Account capabilities (measured)
ACCOUNT               MODELS  GEMINI 4 ARGON      CLAUDE 4.6  CLAUDE 5.5  GEMINI 3.8 FLASH
hrjoces22             19      no                  yes         no          yes
joshuaadair.hr        26      yes 99% · 6d 22h    no          yes         yes
```

---

## Model Discovery

The Antigravity backend reports the models each account can use (`fetchAvailableModels` - the same call the quota tool uses). With `model_discovery` enabled, the plugin registers the ones **newer than the curated catalog** on top of the 4 curated models, taking the **union of every enabled account** in the pool.

| Option | Default | Description |
|--------|---------|-------------|
| `model_discovery` | `false` | Register backend models newer than the curated catalog, union of all enabled accounts |

```json
// ~/.config/opencode/antigravity.json
{
  "model_discovery": true
}
```

### What appears

| Backend id | Curated catalog | Result |
|---|---|---|
| `gemini-3.8-flash-tiered` | has `antigravity-gemini-3.8-flash` | skipped (already curated) |
| `gemini-4-argon`, `gemini-4-argon-low/medium/high` | none | **registered** as one `antigravity-gemini-4-argon` with `low`/`medium`/`high` variants |
| `gemini-3.9-flash`, `gemini-5-flash` | none | registered (strictly newer than the 3.8 floor) |
| `claude-sonnet-5-5-*`, `claude-opus-5-5-*` | none | registered as `antigravity-claude-sonnet-5-5` / `antigravity-claude-opus-5-5` with tier variants |
| `claude-opus-4-6-thinking`, `claude-sonnet-4-6` | has them | skipped (already curated) |
| `claude-opus-4-5`, `gemini-3-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-*` | none | skipped (older than the floor) |
| `gemini-3.6-flash-*`, `gemini-3.1-pro-*`, `gemini-3.5-flash-low`, `gemini-3-flash-agent` | none | skipped (measured: `404` or retired) |
| `chat_*`, `tab_*`, `*-image`, `*-disabled` | none | skipped (internal ids, image output, entitlement placeholder) |

So the practical statement is: **enable it and whatever your plan grants shows up.** An account with Argon gets Argon; an account with only Gemini 3.8 Flash gets nothing extra, which is the current state of Free / AI Plus accounts.

Discovered models are grouped by family: one selector entry per model with a `low`/`medium`/`high` variant instead of one row per tier, and the variant resolves to the backend id suffix (`gemini-4-argon-medium`, `claude-sonnet-5-5-high`). Limits come from the backend when it declares them (measured: Claude 5.5 reports 1,000,000 context / 128,000 output). They resolve through the same request path as the curated catalog.

### Caveats

- **Off by default.** Enabling it changes the visible model list.
- **The catalog is not a list of usable models.** Measured on a real consumer account: 12 of 25 ids answered `200` **and** performed tool calls while being older generations the official Antigravity client does not offer, and one (`gemini-3.5-flash`) answers `200` while decommissioned. That is why discovery is forward-only plus a denylist, and why a `200` is never treated as proof.
- **Curated entries win** and are never duplicated: a discovered id that the curated catalog already registers is skipped.
- **Entitlement is per account, not per plan name.** Measured 2026-10-31: an account that `loadCodeAssist` reports as `free-tier` received the full Argon grant (`modelVersion: gemini-4-argon-trial` plus its own `Gemini 4 Argon` weekly bucket), while two other accounts only got the `gemini-4-argon-disabled` placeholder. Discovery cannot create an entitlement, it only reflects one.
- **Rotation is entitlement-aware.** Each account's catalog is stored in `antigravity-accounts.json` (`modelCatalog`), and account selection skips accounts that provably lack the requested model. Argon only goes to an account that has it; `gemini-3.8-flash` keeps using every account. A `404` still rotates (one attempt per account) instead of surfacing "request preview access".
- **Applies to the OpenCode v2 model registry.** v1 registers models from `opencode.json` and stays curated.
- The catalog is read for the **active** account at startup; switching accounts requires a restart to re-discover.
- **Claude 4.6 and GPT-OSS 120B are removed on 2026-11-02.** On the account with the newer grant, `claude-sonnet-4-6` already answers `200` with a retirement notice instead of content, while Free accounts still serve it. Discovery is forward-only for Gemini **and** Claude, so the 5.5 successors are registered automatically for the accounts that have them. A maintainer still has to prune the dead `claude-*-4-6` entries once the date passes; GPT-OSS has no successor to discover.

---

## App Behavior

Settings that control plugin behavior.

| Option | Default | Description |
|--------|---------|-------------|
| `quiet_mode` | `false` | Hide toast notifications (except recovery) |
| `debug` | `false` | Enable debug logging |
| `log_dir` | OS default | Custom directory for debug logs |
| `auto_update` | `true` | Enable automatic plugin updates |

### Debug Logging

```json
{
  "debug": true,
  "debug_tui": true
}
```

Logs are written to `~/.config/opencode/antigravity-logs/` (or `log_dir` if set).

With `debug` enabled, every outbound request also overwrites
`antigravity-logs/last-request.json` with the exact body the backend receives: the
model id, the URL, the header **names** (never the values, so the bearer token is not
written) and the full request. That is the ground truth for auditing what reaches the
model, including the `AGENTS.md` content and the tool schemas that OpenCode injects:

```bash
antigravity-preflight --capture ~/.config/opencode/antigravity-logs/last-request.json
```

The file is rewritten per request and only exists while `debug` is on; treat it as
sensitive, since it contains your prompts.

### Engine statistics

`/antigravity-stats` and the `antigravity_stats` tool read
`antigravity-stats.json` from the OpenCode config directory and show, per account,
requests served (`OK`), rate limits (`429`) and other errors, plus the thinking
signature cache counters.

Every response is counted where it happens: a success on the account that served the
request, a rate limit on the account that returned `429`/`403`, and an error only
when the failure is not an entitlement miss (a `404` for a model that account lacks
is a capability mismatch, not bad health). Counters are written immediately, so a
one-shot `opencode run` shows up too, and a long-lived server reloads the file when
another process wrote it.

The file is not a log: only counts and timestamps, no prompts.

---

## Recommended Configs

Copy-paste ready configs with recommended settings pre-applied.

### 1 Account

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "sticky"
}
```

**Why these settings:**
- `sticky` — No rotation needed, preserves Anthropic prompt cache

### 2-3 Accounts

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "hybrid"
}
```

**Why these settings:**
- `hybrid` — Smart rotation using health scores, avoids bad accounts

### 3+ Accounts (Power Users / Parallel Agents)

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json",
  "account_selection_strategy": "round-robin",
  "switch_on_first_rate_limit": true,
  "pid_offset_enabled": true
}
```

**Why these settings:**
- `round-robin` — Maximum throughput, rotates every request
- `switch_on_first_rate_limit` — Immediately switch on 429 (default: true)
- `pid_offset_enabled` — Different sessions use different starting accounts

---

## What's Enabled by Default

These settings are already `true` by default — you don't need to set them:

| Setting | Default | What it does |
|---------|---------|--------------|
| `session_recovery` | `true` | Auto-recover from errors |
| `auto_update` | `true` | Keep plugin updated |
| `switch_on_first_rate_limit` | `true` | Fast account switching |

These settings are `false` by default:

| Setting | Default | What it does |
|---------|---------|--------------|
| `keep_thinking` | `false` | Preserve Claude thinking (may degrade stability) |
| `auto_resume` | `false` | Auto-continue after recovery |

---

## Advanced Settings

> These settings are for edge cases. Most users don't need to change them.

<details>
<summary><b>Error Recovery (internal)</b></summary>

| Option | Default | Description |
|--------|---------|-------------|
| `empty_response_max_attempts` | `4` | Retries for empty API responses |
| `empty_response_retry_delay_ms` | `2000` | Delay between retries |
| `tool_id_recovery` | `true` | Fix mismatched tool IDs from context compaction |
| `claude_tool_hardening` | `true` | Prevent tool parameter hallucination |
| `max_rate_limit_wait_seconds` | `300` | Max wait time when rate limited (0=unlimited) |

</details>

<details>
<summary><b>Token Management (internal)</b></summary>

| Option | Default | Description |
|--------|---------|-------------|
| `proactive_token_refresh` | `true` | Refresh tokens before expiry |
| `proactive_refresh_buffer_seconds` | `1800` | Refresh 30 min before expiry |
| `proactive_refresh_check_interval_seconds` | `300` | Check interval |

</details>

<details>
<summary><b>Signature Cache (internal)</b></summary>

Used when `keep_thinking: true`. Most users don't need to configure this.

| Option | Default | Description |
|--------|---------|-------------|
| `signature_cache.enabled` | `true` | Enable disk caching |
| `signature_cache.memory_ttl_seconds` | `3600` | In-memory cache TTL (1 hour) |
| `signature_cache.disk_ttl_seconds` | `172800` | Disk cache TTL (48 hours) |
| `signature_cache.write_interval_seconds` | `60` | Background write interval |

</details>

<details>
<summary><b>Health Score Tuning (internal)</b></summary>

Used by `hybrid` strategy. Most users don't need to configure this.

| Option | Default | Description |
|--------|---------|-------------|
| `health_score.initial` | `70` | Starting health score |
| `health_score.success_reward` | `1` | Points added on success |
| `health_score.rate_limit_penalty` | `-10` | Points removed on rate limit |
| `health_score.failure_penalty` | `-20` | Points removed on failure |
| `health_score.recovery_rate_per_hour` | `2` | Points recovered per hour |
| `health_score.min_usable` | `50` | Minimum score to use account |
| `health_score.max_score` | `100` | Maximum health score |

</details>

<details>
<summary><b>Token Bucket Tuning (internal)</b></summary>

Used by `hybrid` strategy. Most users don't need to configure this.

| Option | Default | Description |
|--------|---------|-------------|
| `token_bucket.max_tokens` | `50` | Maximum tokens in bucket |
| `token_bucket.regeneration_rate_per_minute` | `6` | Tokens regenerated per minute |
| `token_bucket.initial_tokens` | `50` | Starting tokens |

</details>
