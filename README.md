# Antigravity OAuth Plugin for OpenCode (Revived & Extended)

**English** | [Español](README.es.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml)

> [!NOTE]
> **Community Revival & Extended Edition**: This repository is an active, open-source continuation of the archived project by [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) (and earlier work by [@jenslys](https://github.com/jenslys) and [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)). It fixes critical upstream bugs and unlocks the newest Google Antigravity models.

> [!IMPORTANT]
> **Project Status (October 2026) - measured, not assumed.**
> - **Gemini 4 ("Argon") works, and the grant is per account.** Measured 2026-10-31: an account that `loadCodeAssist` reports as `free-tier` received the full Argon grant (`modelVersion: gemini-4-argon-trial` plus its own `Gemini 4 Argon` weekly bucket), while two other accounts only received the `gemini-4-argon-disabled` placeholder and answer `404` for the real ids. Do not infer access from the plan name: enable [`model_discovery`](#model-discovery) and confirm with `antigravity_quota`.
> - **Argon has its own quota bucket.** Two 32k-token Argon calls moved `gemini-argon-wtu-weekly` from 98.75% to 97.75% while `gemini-weekly` and `gemini-5h` did not move at all. Argon is not billed against Gemini Flash/Pro.
> - **Rotation is entitlement-aware.** Each account's model catalog is measured and cached, and selection skips accounts that provably lack the requested model. Argon only goes to the account that has it; `gemini-3.8-flash` keeps using every account.
> - **Claude quota is per family, not per generation.** Free accounts do have Claude quota, but it covers `claude-*-4-6` and GPT-OSS; Claude 5.5 answers `404` there. `antigravity_quota` reports both generations separately.
> - **Claude 4.6 is being retired.** On the entitled account `claude-sonnet-4-6` already answers `200` with "Claude Sonnet 4.6 is no longer available. Please switch to Claude Sonnet 5.5."; Free accounts still serve it. Google's announced date is **2026-11-02**, and `model_discovery` surfaces the 5.5 successors without a plugin release.
> - **Use Argon moderately.** Measure it: ~1% of its weekly bucket per 65k input tokens, versus a Flash bucket that is effectively free at the margin. Keep **Gemini 3.8 Flash** as the high-volume workhorse.

---

### What this fork changes

- **OpenCode v1 and v2 in one entrypoint.** A callable v1 factory plus native v2 `.setup()`, with models, variants, tools and slash commands registered through the v2 registries.
- **Real Antigravity model catalog.** The curated core is Gemini 3.8 Flash, the Claude 4.6 pair and GPT-OSS 120B; anything newer that your account is granted (Gemini 4 Argon, Claude 5.5) is registered by `model_discovery` from the backend catalog, one selector entry per family with `low`/`medium`/`high` variants.
- **Official CLI client signature.** Requests present `antigravity/cli/<version> (aidev_client; ...)`, resolved at startup from the CLI auto-updater. Without it the backend answers `404 NOT_FOUND` for the newer Gemini lines - which is also why a stale signature used to look like "preview access not enabled".
- **Multi-account pool with entitlement-aware rotation.** Per-account quota, health and measured model catalog; failover on `429`, `403`, transport drops and `404` misses; account cooldowns and circuit breakers so a bad account cannot poison the pool.
- **Dual-window quota reporting.** `antigravity_quota` and `/antigravity-quota` show 5h and weekly windows per model family (Gemini, Claude/GPT, Gemini 4 Argon), short reset countdowns, a truthful `USABLE` flag and the measured capabilities of each account.
- **Thinking tiers and Claude signatures.** Tiered backend ids, thinking budgets for Claude, signature caching and recovery for interrupted tool loops.
- **Safety controls.** Configurable `safety_level`, plus `safety_shield` to surface and rotate on Google safety telemetry.
- **Session resilience.** Historical tool-response pruning, transport-drop circuit breaker and retry instrumentation.
- **Request hygiene.** Strips `x-api-key`/`x-goog-api-key`/`x-goog-user-project`, normalizes protobuf-incompatible tool schemas, and sanitizes payloads that the Cloud Code API rejects.

---

Enable OpenCode to authenticate against **Antigravity** (Google's IDE) via OAuth so you can use Antigravity rate limits to run `gemini-3.8-flash`, the Claude line (`4.6` today, `5.5` on accounts that have it) and `gpt-oss-120b`, plus whatever newer model your account is granted - Gemini 4 Argon included - with your Google credentials.

## What You Get

- **Gemini 3.8 Flash**, **Claude Opus/Sonnet 4.6**, **GPT-OSS 120B** via Google OAuth, plus **Gemini 4 Argon** and **Claude 5.5** for the accounts that are granted them (discovered per account, not hardcoded)
- **Multi-account support** — add multiple Google accounts, auto-rotates when rate-limited
- **Request Normalization & Clean Feedback** — optimized parameters prevent false-positives on development tasks; clean one-line message on filter notices
- **Slash Commands** — `/antigravity-quota` to inspect dual-window limits, and `/antigravity-stats` for instant local metrics
- **Native Tools** — `antigravity_quota`, `antigravity_stats`, and `google_search` tools registered directly in the agent runtime
- **Thinking models** — extended thinking for Claude and Gemini 3 with configurable budgets / thinking levels
- **Google Search grounding** — enable web search for Gemini models (auto or always-on)
- **Auto-recovery** — handles session errors and tool failures automatically
- **Plugin compatible** — works alongside other OpenCode plugins (oh-my-opencode, dcp, etc.)
- **Dual-Version Support** — native compatibility with both OpenCode v1 (`opencode-ai`) and OpenCode v2 (`@opencode/cli`)

---

## OpenCode v1 & v2 Architecture Compatibility

This plugin implements a polymorphic dual-compatibility entrypoint in `index.ts`:

- **OpenCode v1 (1.18.x / `opencode-ai`):**
  Loads as a callable factory function:
  ```typescript
  export default async function ({ client, directory }: PluginContext): Promise<PluginResult>
  ```
  Returns `{ auth, event, tool }` hooks with full multi-account rotation and header interception.

- **OpenCode v2 (2.0.x / `@opencode/cli`):**
  Loads as a native v2 plugin definition object:
  ```typescript
  export default {
    id: "opencode-antigravity-auth",
    setup: async (context: V2Context) => cleanup
  }
  ```
  Registers native tools (`context.tool.transform`), commands (`context.command.transform`), models (`context.model.transform`) and the **Google Antigravity OAuth integration** (`context.integration.transform`), while sharing the unified account pool and config. This makes `opencode auth login` offer `OAuth with Google (Antigravity)` and appends every newly authorized account to the multi-account rotation pool.

No configuration changes are required when transitioning between OpenCode v1 and v2.

---

<details open>
<summary><b>Terms of Service Warning — Read Before Installing</b></summary>

> [!CAUTION]
> Using this plugin (and any proxy for Antigravity) violates Google's Terms of Service. A number of users have reported their Google accounts being **banned** or **shadow-banned** (restricted access without explicit notification).
>
> **By using this plugin, you acknowledge:**
> - This is an unofficial tool not endorsed by Google
> - Your account may be suspended or permanently banned
> - You assume all risks associated with using this plugin
>

</details>

---

## Installation

### Option A: Direct from GitHub (Recommended)

Add to `plugins` in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

> OpenCode v2 will automatically clone, build, and update the plugin directly from the official repository.

### Option B: Local Directory (Development / Offline)

Clone and reference locally:

```bash
git clone https://github.com/JoshRob297/opencode-antigravity-auth.git /path/to/plugin
cd /path/to/plugin && npm install && npm run build
```

Then in `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["/path/to/plugin"]
}
```

---

## Quick Start (Zero-Config in OpenCode v2)

1. **Add the plugin** to `~/.config/opencode/opencode.json`:

   ```json
   {
     "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
   }
   ```

2. **Authenticate with Google:**

   ```bash
   opencode auth login
   ```
   Select **Google → OAuth with Google (Antigravity)**.
   *(In SSH / Headless environments, the CLI automatically provides a direct URL to open on your browser and paste the verification code).*

3. **Ready to use!** 
   In OpenCode v2, **all models, variants, and thinking budgets are auto-registered dynamically**. You can immediately run:

   ```bash
   opencode run "Hello" --model=google/antigravity-gemini-3.8-flash --variant=high
   ```

   *(Optional: You can run `/antigravity-setup` inside OpenCode anytime to cleanly auto-format your `opencode.json` with recommended whitelists).*

---

## Models

### Model Reference

| Model | Variants | Description |
|---|---|---|
| `antigravity-gemini-3.8-flash` | `low`, `medium`, `high` | **Gemini 3.8 Flash** with thinking tiers *(Default)* |
| `antigravity-claude-sonnet-4-6` | `low`, `medium`, `high`, `max` | Claude Sonnet 4.6 *(retiring 2026-11-02)* |
| `antigravity-claude-opus-4-6-thinking` | `low`, `medium`, `high`, `max` | Claude Opus 4.6 with extended thinking *(retiring 2026-11-02)* |
| `antigravity-gpt-oss-120b-medium` | `low`, `medium`, `high` | GPT-OSS 120B open-source model |

Newer families are **not** hardcoded. `model_discovery` registers them from the account's own catalog; measured 2026-10-31 on an entitled account: `antigravity-gemini-4-argon` (`low`/`medium`/`high`), `antigravity-claude-sonnet-5-5` and `antigravity-claude-opus-5-5`. Limits come from the backend (Claude 5.5: 1M context / 128k output).

---

<details>
<summary><b>Manual models configuration (Optional / Advanced)</b></summary>

In OpenCode v2 this is **not required** because the plugin registers all models and variants automatically via `model.transform`. However, if you wish to pin custom token limits or override model names manually, you can add this to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"],
  "providers": {
    "google": {
      "models": {
        "antigravity-gemini-3.8-flash": {
          "name": "Gemini 3.8 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6 (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "antigravity-claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking (Antigravity)",
          "limit": { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "antigravity-gpt-oss-120b-medium": {
          "name": "GPT-OSS 120B (Antigravity)",
          "limit": { "context": 131072, "output": 8192 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
      }
    }
  }
}
```

</details>

---

## Model Discovery

The Antigravity backend reports which models each account can use. With `model_discovery` enabled the plugin registers the ones **newer than the curated catalog** on top of it, so a model released to your plan becomes selectable without waiting for a plugin release:

```json
// ~/.config/opencode/antigravity.json
{
  "model_discovery": true
}
```

- **If any account in the pool has Argon or Claude 5.5, they show up.** Gemini 4 Argon and the Claude Sonnet/Opus 5.5 successors are on the forward-only rule, and the catalog is taken as the **union of every account**: one entitled account is enough for the selector entry to appear. Access is granted per account, not by plan name - measured on 2026-10-31, an account reporting `free-tier` to `loadCodeAssist` still received the full Argon grant (`modelVersion: gemini-4-argon-trial` plus its own `Gemini 4 Argon` quota bucket). Discovery never claims support: it mirrors what the backend grants.
- **One selector entry per family, tiers as variants.** The backend exposes one id per thinking tier (`gemini-4-argon-low|medium|high`, `claude-sonnet-5-5-low|medium|high`); the plugin registers a single model (`antigravity-gemini-4-argon`, `antigravity-claude-sonnet-5-5`) with a `low|medium|high` variant picker instead of three near-identical rows. Limits come from the backend when it declares them (Claude 5.5 reports 1M context / 128k output).
- **Rotation is entitlement-aware.** Each account's catalog is measured from `fetchAvailableModels` and cached on disk, and account selection skips any account that provably lacks the requested model - so an Argon request never lands on a Free/AI Plus account that would answer `404 NOT_FOUND`, while that same account keeps serving **Gemini 3.8 Flash**, which every plan has. A `404` that still happens rotates to the next account (bounded to one attempt per account) instead of surfacing a misleading "request preview access" error.
- **Quota notice on frontier models:** Be advised that invoking **Gemini 4 Argon** burns through your 5-hour and weekly Antigravity quotas much faster than Flash models. Use it moderately for architectural decisions or tough problems, and keep **Gemini 3.8 Flash** as the high-throughput everyday engine.
- **Claude 5.5 carries an account-side safety monitor.** Measured 2026-10-31: a long agent prompt (17k tokens of security-oriented system instructions) is answered with `finishReason: SAFETY` and an empty text part. Argon and Flash serve the same prompt normally. The plugin now turns that empty payload into an explicit "blocked by the model's filters" message instead of an opaque provider error.
- **Forward-only.** Anything older than the curated workhorses (`gemini-3.8-flash`, Claude 4.6) stays out, curated ids are never duplicated, and ids measured as dead, retired, internal or `-disabled` are filtered by a denylist. A `200` from the backend is not treated as proof of usability.
- **Best-effort.** If the catalog lookup fails, the curated catalog is used and startup is unaffected.

Full behavior, limits and caveats: [docs/CONFIGURATION.md](docs/CONFIGURATION.md#model-discovery).

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

## Multi-Account Setup

Add multiple Google accounts for a higher combined quota. The plugin automatically rotates between accounts when one is rate-limited.

```bash
opencode auth login  # Run again to add more accounts
```

**Account management options (via `opencode auth login`):**
- **Configure models** — Auto-configure all plugin models in opencode.json
- **Check quotas** — View remaining API quota for each account
- **Manage accounts** — Enable/disable specific accounts for rotation

For details on load balancing, dual quota pools, and account storage, see [docs/MULTI-ACCOUNT.md](docs/MULTI-ACCOUNT.md).

---

## Request Handling, Safety & Feedback

### Safety Levels (`safety_level`)

By default, the plugin mirrors Google's native moderation baseline (`medium` / `BLOCK_MEDIUM_AND_ABOVE`) to protect your accounts from telemetry anomalies.

You can configure `safety_level` in `~/.config/opencode/antigravity.json`:

```json
{
  "safety_level": "medium"
}
```

Available levels:
- `"medium"` (Default) — Standard Google safety filters (`BLOCK_MEDIUM_AND_ABOVE`). Maximum account protection.
- `"high"` — Blocks only high-probability harm (`BLOCK_ONLY_HIGH`). Recommended for extensive development, vulnerability analysis, and debugging.
- `"none"` — Disables external safety classifiers (`BLOCK_NONE`) and bypasses prompt injection filters (`HARM_CATEGORY_JAILBREAK`).

> **DISCLAIMER:** Setting `safety_level` to `"none"` is strictly for authorized security research and advanced workflows. Using `"none"` is done solely at your own discretion and risk. We accept no responsibility or liability for account reviews, suspensions, or bans enacted by Google.

### OPSEC Safety Shield (`safety_shield`)

When operating with `safety_level: "none"`, Google's backend still evaluates your queries and attaches `safetyRatings` probabilities (`NEGLIGIBLE`, `LOW`, `MEDIUM`, `HIGH`) to responses.

The plugin provides an active defense engine configured in `~/.config/opencode/antigravity.json`:

```json
{
  "safety_level": "none",
  "safety_shield": {
    "enabled": true,
    "log_ratings": true,
    "show_toast": true,
    "auto_rotate_threshold": 2
  }
}
```

- **`log_ratings`**: Emits detailed warnings in logs whenever Google assigns `HIGH` harm or `MEDIUM` jailbreak probability to an answer.
- **`show_toast`**: Displays non-blocking OPSEC warnings in OpenCode's interface (`[OPSEC Shield] Google flagged response: ...`).
- **`auto_rotate_threshold`**: Number of consecutive high-risk responses on a single account before triggering an automatic, preventive rotation to the next Google account (`Account Shield`). This prevents risk clustering on individual personal accounts. Set to `0` to disable auto-rotation.

### Concise Notification Handling
If a query triggers a backend moderation notice, the plugin intercepts the verbose response (which contains lengthy legal disclaimers, policy links, and bug report URLs) and replaces it with a clean, actionable notice:

```text
[Solicitud bloqueada por filtros de seguridad de Gemini. Por favor, intenta reformular tu prompt o enfoque.]
```

This prevents chat clutter, session lockups, and unrecoverable error cascades.

---

## Troubleshooting

> **Quick Reset**: Most issues can be resolved by deleting `~/.config/opencode/antigravity-accounts.json` and running `opencode auth login` again.

### Configuration Path (All Platforms)

OpenCode uses `~/.config/opencode/` on **all platforms** including Windows.

| File | Path |
|------|------|
| Main config | `~/.config/opencode/opencode.json` |
| Accounts | `~/.config/opencode/antigravity-accounts.json` |
| Plugin config | `~/.config/opencode/antigravity.json` |
| Debug logs | `~/.config/opencode/antigravity-logs/` |

> **Windows users**: `~` resolves to your user home directory (e.g., `C:\Users\YourName`). Do NOT use `%APPDATA%`.

> **Custom path**: Set `OPENCODE_CONFIG_DIR` environment variable to use a custom location.

> **Windows migration**: If upgrading from plugin v1.3.x or earlier, the plugin will automatically find your existing config in `%APPDATA%\opencode\` and use it. New installations use `~/.config/opencode/`.

---

### Multi-Account Auth Issues

If you encounter authentication issues with multiple accounts:

1. Delete the accounts file:
   ```bash
   rm ~/.config/opencode/antigravity-accounts.json
   ```
2. Re-authenticate:
   ```bash
   opencode auth login
   ```

---

### 403 Permission Denied (`rising-fact-p41fc`)

**Error:**
```
Permission 'cloudaicompanion.companions.generateChat' denied on resource 
'//cloudaicompanion.googleapis.com/projects/rising-fact-p41fc/locations/global'
```

**Cause:** Plugin falls back to a default project ID when no valid project is found. Fixed in v1.7.0+ by automatic discovery of the account's real `managedProjectId`.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable the **Gemini for Google Cloud API** (`cloudaicompanion.googleapis.com`)
4. Add `projectId` to your accounts file:
   ```json
   {
     "accounts": [
       {
         "email": "your@email.com",
         "refreshToken": "...",
         "projectId": "your-project-id"
       }
     ]
   }
   ```

> **Note**: Do this for each account in a multi-account setup.

---

### Gemini Model Not Found

Add this to your `google` provider config:

```jsonc
{
  "providers": {
    "google": {
      "npm": "@ai-sdk/google",
      "models": { ... }
    }
  }
}
```

---

### Gemini 3 Models 400 Error ("Unknown name 'parameters'")

**Error:**
```
Invalid JSON payload received. Unknown name "parameters" at 'request.tools[0]'
```

**Causes:**
- Tool schema incompatibility with Gemini's strict protobuf validation
- MCP servers with malformed schemas
- Plugin version regression

**Solutions:**
1. **Update to latest release from GitHub:**
   ```json
   { "plugins": ["github:JoshRob297/opencode-antigravity-auth"] }
   ```

2. **Disable MCP servers** one-by-one to find the problematic one

3. **Add npm override:**
   ```json
   { "providers": { "google": { "npm": "@ai-sdk/google" } } }
   ```

---

### MCP Servers Causing Errors

Some MCP servers have schemas incompatible with Antigravity's strict JSON format.

**Common symptom:**
```bash
Invalid function name must start with a letter or underscore
```

Sometimes it shows up as:
```bash
GenerateContentRequest.tools[0].function_declarations[12].name: Invalid function name must start with a letter or underscore
```

This usually means an MCP tool name starts with a number (for example, a 1mcp key like `1mcp_*`). Rename the MCP key to start with a letter (e.g., `gw`) or disable that MCP entry for Antigravity models.

**Diagnosis:**
1. Disable all MCP servers in your config
2. Enable one-by-one until error reappears
3. Report the specific MCP in a [GitHub issue](https://github.com/JoshRob297/opencode-antigravity-auth/issues)

---

### "All Accounts Rate-Limited" (But Quota Available)

**Cause:** Cascade bug in `clearExpiredRateLimits()` in hybrid mode (fixed in recent beta).

**Solutions:**
1. Update to latest beta version
2. If persists, delete accounts file and re-authenticate
3. Try switching `account_selection_strategy` to `"sticky"` in `antigravity.json`

---

### Session Recovery

If you encounter errors during a session:
1. Type `continue` to trigger the recovery mechanism
2. If blocked, use `/undo` to revert to pre-error state
3. Retry the operation

---

### Using with Oh-My-OpenCode

**Important:** Disable the built-in Google auth to prevent conflicts:

```jsonc
// ~/.config/opencode/oh-my-opencode.json
{
  "google_auth": false,
  "agents": {
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.8-flash" },
    "document-writer": { "model": "google/antigravity-gemini-3.8-flash" }
  }
}
```

---

### Infinite `.tmp` Files Created

**Cause:** When account is rate-limited and plugin retries infinitely, it creates many temp files.

**Workaround:**
1. Stop OpenCode
2. Clean up: `rm ~/.config/opencode/*.tmp`
3. Add more accounts or wait for rate limit to expire

---

### OAuth Callback Issues

<details>
<summary><b>Safari OAuth Callback Fails (macOS)</b></summary>

**Symptoms:**
- "fail to authorize" after successful Google login
- Safari shows "Safari can't open the page"

**Cause:** Safari's "HTTPS-Only Mode" blocks `http://localhost` callback.

**Solutions:**

1. **Use Chrome or Firefox** (easiest):
   Copy the OAuth URL and paste into a different browser.

2. **Disable HTTPS-Only Mode temporarily:**
   - Safari > Settings (⌘,) > Privacy
   - Uncheck "Enable HTTPS-Only Mode"
   - Run `opencode auth login`
   - Re-enable after authentication

</details>

<details>
<summary><b>Port Conflict (Address Already in Use)</b></summary>

**macOS / Linux:**
```bash
# Find process using the port
lsof -i :51121

# Kill if stale
kill -9 <PID>

# Retry
opencode auth login
```

**Windows (PowerShell):**
```powershell
netstat -ano | findstr :51121
taskkill /PID <PID> /F
opencode auth login
```

</details>

<details>
<summary><b>Docker / WSL2 / Remote Development</b></summary>

OAuth callback requires browser to reach `localhost` on the machine running OpenCode.

**WSL2:**
- Use VS Code's port forwarding, or
- Configure Windows → WSL port forwarding

**SSH / Remote:**
```bash
ssh -L 51121:localhost:51121 user@remote
```

**Docker / Containers:**
- OAuth with localhost redirect doesn't work in containers
- Wait 30s for manual URL flow, or use SSH port forwarding

</details>

---

### Configuration Key: `plugins` (v2) or `plugin` (v1)

In OpenCode v2, use the native plural key:

```json
{
  "plugins": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

OpenCode v1 uses the legacy singular key `"plugin"`. The updater detects both automatically and preserves whichever convention your configuration uses.

---

### Migrating Accounts Between Machines

When copying `antigravity-accounts.json` to a new machine:
1. Ensure the plugin is installed in `~/.config/opencode/opencode.json` (`"plugins"` or `"plugin"`)
2. Copy `~/.config/opencode/antigravity-accounts.json`
3. If you get "API key missing" error, the refresh token may be invalid — re-authenticate

## Known Plugin Interactions
For details on load balancing, dual quota pools, and account storage, see [docs/MULTI-ACCOUNT.md](docs/MULTI-ACCOUNT.md).

---

## Plugin Compatibility

### @tarquinen/opencode-dcp

DCP creates synthetic assistant messages that lack thinking blocks. **List this plugin BEFORE DCP:**

```json
{
  "plugins": [
    "github:JoshRob297/opencode-antigravity-auth",
    "@tarquinen/opencode-dcp@latest"
  ]
}
```

### oh-my-opencode

Disable built-in auth and override agent models in `oh-my-opencode.json`:

```json
{
  "google_auth": false,
  "agents": {
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.8-flash" },
    "document-writer": { "model": "google/antigravity-gemini-3.8-flash" },
    "multimodal-looker": { "model": "google/antigravity-gemini-3.8-flash" }
  }
}
```

> **Tip:** When spawning parallel subagents, enable `pid_offset_enabled: true` in `antigravity.json` to distribute sessions across accounts.

### Plugins you don't need

- **gemini-auth plugins** — Not needed. This plugin handles all Google OAuth.

---

## Configuration

Create `~/.config/opencode/antigravity.json` for optional settings:

```json
{
  "$schema": "https://raw.githubusercontent.com/JoshRob297/opencode-antigravity-auth/main/assets/antigravity.schema.json"
}
```

Most users don't need to configure anything — defaults work well.

### Model Behavior

| Option | Default | What it does |
|--------|---------|--------------
| `keep_thinking` | `false` | Preserve Claude's thinking across turns. **Warning:** enabling may degrade model stability. |
| `session_recovery` | `true` | Auto-recover from tool errors |

### Account Rotation

| Your Setup | Recommended Config |
|------------|-------------------|
| **1 account** | `"account_selection_strategy": "sticky"` |
| **2-5 accounts** | Default (`"hybrid"`) works great |
| **5+ accounts** | `"account_selection_strategy": "round-robin"` |
| **Parallel agents** | Add `"pid_offset_enabled": true` |

Every strategy respects entitlements: an account whose measured catalog lacks the requested model is skipped for that model, regardless of how healthy or free it is.

### Quota Protection & Transport Resilience

| Option | Default | What it does |
|--------|---------|--------------|
| `soft_quota_threshold_percent` | `100` | Skip account when quota usage exceeds this percentage. Defaults to `100` (disabled) to avoid premature account exhaustion lockouts on low quotas. Set to `90` for conservative protection against Google penalties. |
| `quota_refresh_interval_minutes` | `15` | Background quota refresh interval. After successful API requests, refreshes quota cache if older than this interval. Set to `0` to disable. |
| `soft_quota_cache_ttl_minutes` | `"auto"` | How long quota cache is considered fresh. `"auto"` = max(2 × refresh interval, 10 minutes). Set a number (1-120) for fixed TTL. |

> **How it works**: Quota cache is refreshed automatically after API requests (when older than `quota_refresh_interval_minutes`) and manually via "Check quotas" in `opencode auth login`. The threshold check uses `soft_quota_cache_ttl_minutes` to determine cache freshness - if cache is older, the account is considered "unknown" and allowed (fail-open). When ALL accounts exceed the threshold, the plugin waits for the earliest quota reset time (like rate limit behavior). If wait time exceeds `max_rate_limit_wait_seconds`, it errors immediately.
>
> **Transport Circuit Breaker & Tool Pruning (v2.3.0+)**: To prevent 60-second gateway TCP resets (`ECONNRESET`) caused by massive command/tool dumps, outputs exceeding 30,000 characters in historical turns (older than the last 2) are automatically pruned with a clear summary snippet. Furthermore, a circuit breaker halts runaway retries after 3 consecutive transport dropouts on the same session, prompting context compaction.

### Rate Limit Scheduling

Control how the plugin handles rate limits:

| Option | Default | What it does |
|--------|---------|--------------|
| `scheduling_mode` | `"cache_first"` | `"cache_first"` = wait for same account (preserves prompt cache), `"balance"` = switch immediately, `"performance_first"` = round-robin |
| `max_cache_first_wait_seconds` | `60` | Max seconds to wait in cache_first mode before switching accounts |
| `failure_ttl_seconds` | `3600` | Reset failure count after this many seconds (prevents old failures from permanently penalizing accounts) |

**When to use each mode:**
- **cache_first** (default): Best for long conversations. Waits for the same account to recover, preserving your prompt cache.
- **balance**: Best for quick tasks. Switches accounts immediately when rate-limited for maximum availability.
- **performance_first**: Best for many short requests. Distributes load evenly across all accounts.

### App Behavior

| Option | Default | What it does |
|--------|---------|--------------|
| `quiet_mode` | `false` | Hide toast notifications |
| `debug` | `false` | Enable debug file logging (`~/.config/opencode/antigravity-logs/`) |
| `debug_tui` | `false` | Show debug logs in the TUI log panel (independent from `debug`) |
| `auto_update` | `true` | Auto-update plugin |

For all options, see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

**Environment variables:**
```bash
OPENCODE_CONFIG_DIR=/path/to/config opencode  # Custom config directory
OPENCODE_ANTIGRAVITY_DEBUG=1 opencode         # Enable debug file logging
OPENCODE_ANTIGRAVITY_DEBUG=2 opencode         # Verbose debug file logging
OPENCODE_ANTIGRAVITY_DEBUG_TUI=1 opencode     # Enable TUI log panel debug output
```

---

## Troubleshooting

See the full [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for solutions to common issues including:

- Auth problems and token refresh
- "Model not found" / `404` on a model your account is not granted
- Session recovery
- IAM and Google Cloud project permission errors
- Safari OAuth issues
- Plugin compatibility
- Migration guides

---

## Documentation

- [Configuration](docs/CONFIGURATION.md) — All configuration options
- [Multi-Account](docs/MULTI-ACCOUNT.md) — Load balancing, dual quota pools, account storage
- [Model Variants](docs/MODEL-VARIANTS.md) — Thinking budgets and variant system
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and fixes
- [Architecture](docs/ARCHITECTURE.md) — How the plugin works
- [API Spec](docs/ANTIGRAVITY_API_SPEC.md) — Antigravity API reference

Translations:

- [Español (README.es.md)](README.es.md) — Spanish translation of this README. English is the source of truth; the translation may lag behind.
- [Español (docs/CONFIGURATION.es.md)](docs/CONFIGURATION.es.md) — Configuration
- [Español (docs/MULTI-ACCOUNT.es.md)](docs/MULTI-ACCOUNT.es.md) — Multi-Account
- [Español (docs/TROUBLESHOOTING.es.md)](docs/TROUBLESHOOTING.es.md) — Troubleshooting

---

## Credits & Acknowledgments

This project stands on the shoulders of the open-source community:

- **Original Author**: [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) — Created the original `opencode-antigravity-auth` plugin.
- **Upstream Contributors**:
  - [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth) by [@jenslys](https://github.com/jenslys)
  - [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)
  - [@dopesalmon](https://x.com/dopesalmon)
- **Revival Maintainer**: [JoshRob297](https://github.com/JoshRob297) — v1.7.0+ maintenance, Gemini 3.7 Flash support & IAM 403 fixes.

## License

MIT License. See [LICENSE](LICENSE) for details.

<details>
<summary><b>Legal</b></summary>

### Intended Use

- Personal / internal development only
- Respect internal quotas and data handling policies
- Not for production services or bypassing intended limits

### Warning

By using this plugin, you acknowledge:

- **Terms of Service risk** — This approach may violate ToS of AI model providers
- **Account risk** — Providers may suspend or ban accounts
- **No guarantees** — APIs may change without notice
- **Assumption of risk** — You assume all legal, financial, and technical risks

### Disclaimer

- Not affiliated with Google. This is an independent open-source project.
- "Antigravity", "Gemini", "Google Cloud", and "Google" are trademarks of Google LLC.

</details>
