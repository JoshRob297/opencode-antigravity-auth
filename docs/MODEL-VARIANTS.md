# Model Variants

OpenCode's variant system lets you configure the thinking budget dynamically without defining separate models for each thinking level.

---

## How Variants Work

When you define a model with `variants`, OpenCode shows variant options in the model picker. Selecting a variant passes the `providerOptions` to the plugin, which extracts the thinking configuration.

```bash
opencode run "Hello" --model=google/antigravity-claude-opus-4-6-thinking --variant=max
```

---

## Variant Configuration

Define variants in your model configuration:

```json
{
  "antigravity-claude-opus-4-6-thinking": {
    "name": "Claude Opus 4.6 Thinking",
    "limit": { "context": 200000, "output": 64000 },
    "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
    "variants": {
      "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
      "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
    }
  }
}
```

---

## Supported Variant Formats

The plugin accepts different variant formats depending on the model family:

| Model Family | Variant Format | Example |
|--------------|----------------|---------|
| **Claude** | `thinkingConfig.thinkingBudget` | `{ "thinkingConfig": { "thinkingBudget": 8192 } }` |
| **Gemini 3** | `thinkingLevel` | `{ "thinkingLevel": "high" }` |
| **Gemini 2.5** | `thinkingConfig.thinkingBudget` | `{ "thinkingConfig": { "thinkingBudget": 8192 } }` |

---

## Gemini 3 Thinking Levels

Gemini 3 models use string-based thinking levels. Available levels differ by model:

| Level | Flash | Pro | Description |
|-------|-------|-----|-------------|
| `minimal` | | | Minimal thinking, lowest latency |
| `low` | | | Light thinking |
| `medium` | | | Balanced thinking |
| `high` | | | Maximum thinking (default) |

> **Note:** The API rejects invalid levels (e.g., `"minimal"` on Pro). Configure variants accordingly.

### Gemini 3.8 Flash Example

```json
{
  "antigravity-gemini-3.8-flash": {
    "name": "Gemini 3.8 Flash (Antigravity)",
    "limit": { "context": 1048576, "output": 65536 },
    "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
    "variants": {
      "low": { "thinkingLevel": "low" },
      "medium": { "thinkingLevel": "medium" },
      "high": { "thinkingLevel": "high" }
    }
  }
}
```

> **Note (2026-10-13):** Gemini 3.7 Flash, Gemini 3.6 Flash and Gemini 3.1 Pro moved to **Google AI Ultra / Enterprise-only** and are no longer registered by this plugin for consumer plans. Gemini 3.8 Flash is the only Gemini model available on consumer plans.
>
> **Gemini 4 ("Argon") is available on paid plans and needs no plugin release.** On **2026-10-13** Google rolled it out for **Google AI Pro (paid, non-trial), Ultra and Enterprise** in the Antigravity App, the Antigravity CLI and the IDE extensions - not in the standalone IDE, and not on Free / AI Plus. Its ids are `gemini-4-argon` and `gemini-4-argon-{low,medium,high}`. It is deliberately not in the curated catalog: enable [`model_discovery`](CONFIGURATION.md#model-discovery) and it is registered automatically for the accounts the backend lists it for; see the project status note in the [README](../README.md).

---

## Claude Thinking Budget

Claude models use token-based thinking budgets (in tokens):

| Variant | Budget | Description |
|---------|--------|-------------|
| `low` | 8192 | Light thinking |
| `max` | 32768 | Maximum thinking |

### Claude Example

```json
{
  "antigravity-claude-opus-4-6-thinking": {
    "name": "Claude Opus 4.6 Thinking (Antigravity)",
    "limit": { "context": 200000, "output": 64000 },
    "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] },
    "variants": {
      "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
      "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
    }
  }
}
```

You can define custom budgets:

```json
{
  "variants": {
    "minimal": { "thinkingConfig": { "thinkingBudget": 4096 } },
    "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
    "medium": { "thinkingConfig": { "thinkingBudget": 16384 } },
    "high": { "thinkingConfig": { "thinkingBudget": 24576 } },
    "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
  }
}
```

---

## Legacy Budget Format (Deprecated)

For Gemini 3 models, the old `thinkingBudget` format is still supported but deprecated:

| Budget Range | Maps to Level |
|--------------|---------------|
| ≤ 8192 | low |
| ≤ 16384 | medium |
| > 16384 | high |

**Recommended:** Use `thinkingLevel` directly for Gemini 3 models.

---

## Tier-Suffixed Names

Tier-suffixed model names are still accepted:

- `antigravity-claude-opus-4-6-thinking-low`
- `antigravity-claude-opus-4-6-thinking-medium`
- `antigravity-claude-opus-4-6-thinking-high`
- `antigravity-gemini-3.8-flash-low`
- `antigravity-gemini-3.8-flash-medium`
- `antigravity-gemini-3.8-flash-high`

However, **we recommend using simplified model names with variants** for:

- **Cleaner model picker** — 7 models instead of 12+
- **Simpler config** — No need to configure both `antigravity-` and `-preview` versions
- **Automatic quota routing** — Plugin handles model name transformation
- **Flexible budgets** — Define any budget, not just preset tiers
- **Future-proof** — Works with OpenCode's native variant system

---

## Benefits of Variants

| Before (tier-suffixed) | After (variants) |
|------------------------|------------------|
| 12+ separate models | 4 models with variants |
| Fixed thinking budgets | Customizable budgets |
| Cluttered model picker | Clean model picker |
| Hard to add new tiers | Easy to add new variants |
