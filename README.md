# Antigravity + Gemini CLI OAuth Plugin for OpenCode (Revived & Extended)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshRob297/opencode-antigravity-auth/actions/workflows/ci.yml)

> [!NOTE]
> **Community Revival & Extended Edition**: This repository is an active, open-source continuation of the archived project by [NoeFabris](https://github.com/NoeFabris/opencode-antigravity-auth) (and earlier work by [@jenslys](https://github.com/jenslys) and [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)). It fixes critical upstream bugs and unlocks the newest Google Antigravity models.

---

### 🌟 What's New & Changed in this Fork (v1.8.0)

| Enhancement | What Was Broken Upstream | How This Fork Fixes It |
|---|---|---|
| 📊 **Native Dual-Window Quota Tool** | Quota required a separate external plugin or returned flat model lists. | Embedded the official `antigravity_quota` tool directly into the auth plugin with full **5h Window + Weekly Window** tracking and progress bars via `/v1internal:retrieveUserQuotaSummary`. |
| 🚀 **Gemini 3.7 Flash Support** | Backend returned `404 NOT_FOUND` (rewritten as *"enable preview access"* or `429`) when invoking `gemini-3.7-flash`. | Discovered that Google restricts 3.7 Flash strictly to official CLI signatures. The plugin now dynamically presents the official Antigravity CLI client signature (`antigravity/cli/...`), unlocking full native access to **Gemini 3.7 Flash (Low/Medium/High)**. |
| 🛠️ **IAM 403 Permission Denied Fix** | Requests failed with `403 IAM_PERMISSION_DENIED` on `projects/rising-fact-p41fc` for instances requiring `cloudaicompanion.instances.completeTask`. | Fixed two core bugs in `project.ts`: corrected `metadata.platform` from invalid `MACOS/WINDOWS` enums to `PLATFORM_UNSPECIFIED` and updated the discovery User-Agent, allowing automatic resolution and persistence of the account's real `managedProjectId`. |
| ⚡ **Gemini 3.6 Flash & 3.5 Flash** | Native multi-tier backend model resolution (`gemini-3.6-flash-{low,medium,high}` and `gemini-3.5-flash-{low,high}`). | Multi-tier thinking resolution support built into `model-resolver.ts`. |
| 🧹 **Clean CI & Community Standards** | Upstream had broken npm publishing actions and no rulesets. | Replaced with clean, automated Node.js CI with **1,010 tests passing**, security policies, and Dependabot groups. |

---

Enable OpenCode to authenticate against **Antigravity** (Google's IDE) via OAuth so you can use Antigravity rate limits and access models like `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.1-pro`, and `claude-opus-4-6-thinking` with your Google credentials.

## What You Get

- **Gemini 3.7 Flash, 3.6 Flash, 3.1 Pro/Flash**, and **Claude Opus 4.6, Sonnet 4.6** via Google OAuth
- **Multi-account support** — add multiple Google accounts, auto-rotates when rate-limited
- **Dual quota system** — access both Antigravity and Gemini CLI quotas from one plugin
- **Thinking models** — extended thinking for Claude and Gemini 3 with configurable budgets / thinking levels
- **Google Search grounding** — enable web search for Gemini models (auto or always-on)
- **Auto-recovery** — handles session errors and tool failures automatically
- **Plugin compatible** — works alongside other OpenCode plugins (oh-my-opencode, dcp, etc.)

---

<details open>
<summary><b>⚠️ Terms of Service Warning — Read Before Installing</b></summary>

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

### Option A: Install directly from GitHub (Recommended)

Add this to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

### Option B: Local Directory (Development / Offline)

Clone and reference locally:

```bash
git clone https://github.com/JoshRob297/opencode-antigravity-auth.git /path/to/plugin
cd /path/to/plugin && npm install && npm run build
```

Then in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["/path/to/plugin"]
}
```

---

## Quick Start

1. **Login** with your Google account:

   ```bash
   opencode auth login
   ```

2. **Select Google → OAuth with Google (Antigravity)** and authenticate.

3. **Configure models** in `opencode.json` (see copy-paste configuration below).

4. **Run a prompt:**

   ```bash
   opencode run "Hello" --model=google/antigravity-gemini-3.7-flash --variant=high
   ```

---

## Models

### Model Reference

| Model | Variants | Description |
|-------|----------|-------------|
| `antigravity-gemini-3.7-flash` 🚀 | `low`, `medium`, `high` | **Gemini 3.7 Flash** with dynamic thinking *(New in v1.7.0)* |
| `antigravity-gemini-3.6-flash` ⚡ | `low`, `medium`, `high` | **Gemini 3.6 Flash** with thinking tiers |
| `antigravity-gemini-3.1-pro` 🧠 | `low`, `high` | **Gemini 3.1 Pro** with 1M token context |
| `antigravity-gemini-3.5-flash` | `minimal`, `low`, `medium`, `high` | Gemini 3.5 Flash |
| `antigravity-claude-sonnet-4-6` | — | Claude Sonnet 4.6 |
| `antigravity-claude-opus-4-6-thinking` | `low`, `medium`, `max` | Claude Opus 4.6 with extended thinking |

---

<details open>
<summary><b>Full models configuration (copy-paste ready)</b></summary>

Add this to your `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["github:JoshRob297/opencode-antigravity-auth"],
  "provider": {
    "google": {
      "models": {
        "antigravity-gemini-3.7-flash": {
          "name": "Gemini 3.7 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-gemini-3.6-flash": {
          "name": "Gemini 3.6 Flash (Antigravity)",
          "limit": { "context": 1048576, "output": 65536 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "antigravity-gemini-3.1-pro": {
          "name": "Gemini 3.1 Pro (Antigravity)",
          "limit": { "context": 1048576, "output": 65535 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
          "variants": {
            "low": { "thinkingLevel": "low" },
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
        }
      }
    }
  }
}
```

</details>

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

**Cause:** Plugin falls back to a default project ID when no valid project is found. This works for Antigravity but fails for Gemini CLI models.

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

```json
{
  "provider": {
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
   { "plugin": ["github:JoshRob297/opencode-antigravity-auth"] }
   ```

2. **Disable MCP servers** one-by-one to find the problematic one

3. **Add npm override:**
   ```json
   { "provider": { "google": { "npm": "@ai-sdk/google" } } }
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

```json
// ~/.config/opencode/oh-my-opencode.json
{
  "google_auth": false,
  "agents": {
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.1-pro" },
    "document-writer": { "model": "google/antigravity-gemini-3.7-flash" }
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

### Configuration Key Typo: `plugin` not `plugins`

The correct key is `plugin` (singular):

```json
{
  "plugin": ["github:JoshRob297/opencode-antigravity-auth"]
}
```

**Not** `"plugins"` (will cause "Unrecognized key" error).

---

### Migrating Accounts Between Machines

When copying `antigravity-accounts.json` to a new machine:
1. Ensure the plugin is installed: `"plugin": ["github:JoshRob297/opencode-antigravity-auth"]`
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
  "plugin": [
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
    "frontend-ui-ux-engineer": { "model": "google/antigravity-gemini-3.1-pro" },
    "document-writer": { "model": "google/antigravity-gemini-3.7-flash" },
    "multimodal-looker": { "model": "google/antigravity-gemini-3.7-flash" }
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
| `cli_first` | `false` | Route Gemini models to Gemini CLI first (Claude and image models stay on Antigravity). |

### Account Rotation

| Your Setup | Recommended Config |
|------------|-------------------|
| **1 account** | `"account_selection_strategy": "sticky"` |
| **2-5 accounts** | Default (`"hybrid"`) works great |
| **5+ accounts** | `"account_selection_strategy": "round-robin"` |
| **Parallel agents** | Add `"pid_offset_enabled": true` |

### Quota Protection

| Option | Default | What it does |
|--------|---------|--------------|
| `soft_quota_threshold_percent` | `90` | Skip account when quota usage exceeds this percentage. Prevents Google from penalizing accounts that fully exhaust quota. Set to `100` to disable. |
| `quota_refresh_interval_minutes` | `15` | Background quota refresh interval. After successful API requests, refreshes quota cache if older than this interval. Set to `0` to disable. |
| `soft_quota_cache_ttl_minutes` | `"auto"` | How long quota cache is considered fresh. `"auto"` = max(2 × refresh interval, 10 minutes). Set a number (1-120) for fixed TTL. |

> **How it works**: Quota cache is refreshed automatically after API requests (when older than `quota_refresh_interval_minutes`) and manually via "Check quotas" in `opencode auth login`. The threshold check uses `soft_quota_cache_ttl_minutes` to determine cache freshness - if cache is older, the account is considered "unknown" and allowed (fail-open). When ALL accounts exceed the threshold, the plugin waits for the earliest quota reset time (like rate limit behavior). If wait time exceeds `max_rate_limit_wait_seconds`, it errors immediately.

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
- "Model not found" errors
- Session recovery
- Gemini CLI permission errors
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
