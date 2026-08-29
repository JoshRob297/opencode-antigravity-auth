# Multi-Account Setup

Add multiple Google accounts to increase your combined quota and improve availability. The plugin automatically rotates between accounts when one is rate-limited.

```bash
opencode auth login  # Run again to add more accounts
```

---

## Load Balancing Behavior

- **Sticky account selection** — Sticks to the same account until rate-limited (preserves prompt caching)
- **Per-model-family limits** — Rate limits tracked separately for Claude and Gemini models
- **Account rotation** — Smooth automatic failover to next available account upon rate limiting
- **Smart retry threshold** — Short rate limits (≤5s) are retried on same account
- **Exponential backoff** — Increasing delays for consecutive rate limits

---

## Quota Pools & Windows

For Antigravity models, the plugin monitors official **5-hour** and **Weekly** usage windows per account:

| Window | Frequency | Description |
|--------|-----------|-------------|
| **5h Window** | Every 5 hours | Rolling burst bucket for immediate development sprints |
| **Weekly Window** | Every 7 days | Macro limit for weekly development capacity |

### How Account Rotation Works

1. Request uses current active account
2. If rate-limited or quota is exhausted, plugin checks if ANY other account is available
3. If yes → switches to the next healthy account automatically
4. Model names and variant thinking configs are preserved seamlessly across rotations

---

## Checking Quotas

Check your current API usage across all accounts:

```bash
opencode auth login
# Select "Check quotas" from the menu
```

This shows remaining quota percentages and reset times for each model family:
- **Claude** - Claude Opus/Sonnet quota
- **Gemini 3 Pro** - Gemini 3 Pro quota
- **Gemini 3 Flash** - Gemini 3 Flash quota

### Standalone Quota Script

For checking quotas outside of OpenCode (for debugging, CI, etc.):

```bash
node scripts/check-quota.mjs                    # Check all accounts
node scripts/check-quota.mjs --account 2        # Check specific account
node scripts/check-quota.mjs --path /path/to/accounts.json  # Custom path
```

---

## Managing Accounts

Enable or disable specific accounts to control which ones are used for requests:

```bash
opencode auth login
# Select "Manage accounts (enable/disable)"
```

Or select an account from the list and choose "Enable/Disable account".

**Disabled accounts:**
- Are excluded from automatic rotation
- Still appear in quota checks (marked `[disabled]`)
- Can be re-enabled at any time

Useful when:
- An account is temporarily banned or rate-limited for an extended period
- You want to reserve certain accounts for specific use cases
- Testing with a subset of accounts

---

## Adding Accounts

When running `opencode auth login` with existing accounts:

```
2 account(s) saved:
  1. user1@gmail.com
  2. user2@gmail.com

(a)dd new account(s) or (f)resh start? [a/f]:
```

Choose `a` to add more accounts while keeping existing ones.

---

## Account Storage

Accounts are stored in `~/.config/opencode/antigravity-accounts.json`:

```json
{
  "version": 3,
  "accounts": [
    {
      "email": "user1@gmail.com",
      "refreshToken": "1//0abc...",
      "projectId": "my-gcp-project",
      "enabled": true
    },
    {
      "email": "user2@gmail.com",
      "refreshToken": "1//0xyz...",
      "enabled": false
    }
  ],
  "activeIndex": 0,
  "activeIndexByFamily": {
    "claude": 0,
    "gemini": 0
  }
}
```

> ⚠️ **Security:** This file contains OAuth refresh tokens. Treat it like a password file.

### Fields

| Field | Description |
|-------|-------------|
| `email` | Google account email |
| `refreshToken` | OAuth refresh token (auto-managed) |
| `projectId` | Optional Google Cloud project ID (auto-discovered). |
| `enabled` | Optional. Set to `false` to disable account rotation. Defaults to `true`. |
| `activeIndex` | Currently active account index |
| `activeIndexByFamily` | Per-model-family active account (claude/gemini tracked separately) |

---

## Token Revocation

If Google revokes a token (e.g., password change, security event), you'll see `invalid_grant` errors. The plugin automatically removes invalid accounts.

To manually reset:

```bash
rm ~/.config/opencode/antigravity-accounts.json
opencode auth login
```

---

## Parallel Sessions (oh-my-opencode)

When using oh-my-opencode with parallel subagents, multiple processes may select the same account, causing rate limit errors.

**Solution:** Enable PID-based offset in `antigravity.json`:

```json
{
  "pid_offset_enabled": true
}
```

This distributes sessions across accounts based on process ID.

Alternatively, add more accounts via `opencode auth login`.

---

## Account Selection Strategies

Configure in `antigravity.json`:

```json
{
  "account_selection_strategy": "hybrid"
}
```

| Strategy | Behavior | Best For |
|----------|----------|----------|
| `sticky` | Same account until rate-limited | Prompt cache preservation |
| `round-robin` | Rotate to next account on every request | Maximum throughput |
| `hybrid` | Deterministic selection based on health score + token bucket + LRU | Best overall distribution |

See [Configuration](CONFIGURATION.md#account-rotation) for more details.
