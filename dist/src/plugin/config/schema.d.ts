/**
 * Configuration schema for opencode-antigravity-auth plugin.
 *
 * Config file locations (in priority order, highest wins):
 * - Project: .opencode/antigravity.json
 * - User: ~/.config/opencode/antigravity.json (Linux/Mac)
 *         %APPDATA%\opencode\antigravity.json (Windows)
 *
 * Environment variables always override config file values.
 */
import { z } from "zod";
/**
 * Account selection strategy for distributing requests across accounts.
 *
 * - `sticky`: Use same account until rate-limited. Preserves prompt cache.
 * - `round-robin`: Rotate to next account on every request. Maximum throughput.
 * - `hybrid` (default): Deterministic selection based on health score + token bucket + LRU freshness.
 */
export declare const AccountSelectionStrategySchema: z.ZodEnum<{
    sticky: "sticky";
    "round-robin": "round-robin";
    hybrid: "hybrid";
}>;
export type AccountSelectionStrategy = z.infer<typeof AccountSelectionStrategySchema>;
/**
 * Toast notification scope for controlling which sessions show toasts.
 *
 * - `root_only` (default): Only show toasts for root sessions (no parentID).
 *   Subagents and background tasks won't show toast notifications.
 * - `all`: Show toasts for all sessions including subagents and background tasks.
 */
export declare const ToastScopeSchema: z.ZodEnum<{
    root_only: "root_only";
    all: "all";
}>;
export type ToastScope = z.infer<typeof ToastScopeSchema>;
/**
 * Scheduling mode for rate limit behavior.
 *
 * - `cache_first`: Wait for same account to recover (preserves prompt cache). Default.
 * - `balance`: Switch account immediately on rate limit. Maximum availability.
 * - `performance_first`: Round-robin distribution for maximum throughput.
 */
export declare const SchedulingModeSchema: z.ZodEnum<{
    cache_first: "cache_first";
    balance: "balance";
    performance_first: "performance_first";
}>;
export type SchedulingMode = z.infer<typeof SchedulingModeSchema>;
/**
 * Signature cache configuration for persisting thinking block signatures to disk.
 */
export declare const SignatureCacheConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    memory_ttl_seconds: z.ZodDefault<z.ZodNumber>;
    disk_ttl_seconds: z.ZodDefault<z.ZodNumber>;
    write_interval_seconds: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
/**
 * Main configuration schema for the Antigravity OAuth plugin.
 */
export declare const AntigravityConfigSchema: z.ZodObject<{
    $schema: z.ZodOptional<z.ZodString>;
    quiet_mode: z.ZodDefault<z.ZodBoolean>;
    toast_scope: z.ZodDefault<z.ZodEnum<{
        root_only: "root_only";
        all: "all";
    }>>;
    debug: z.ZodDefault<z.ZodBoolean>;
    debug_tui: z.ZodDefault<z.ZodBoolean>;
    log_dir: z.ZodOptional<z.ZodString>;
    keep_thinking: z.ZodDefault<z.ZodBoolean>;
    session_recovery: z.ZodDefault<z.ZodBoolean>;
    auto_resume: z.ZodDefault<z.ZodBoolean>;
    resume_text: z.ZodDefault<z.ZodString>;
    signature_cache: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        memory_ttl_seconds: z.ZodDefault<z.ZodNumber>;
        disk_ttl_seconds: z.ZodDefault<z.ZodNumber>;
        write_interval_seconds: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    empty_response_max_attempts: z.ZodDefault<z.ZodNumber>;
    empty_response_retry_delay_ms: z.ZodDefault<z.ZodNumber>;
    tool_id_recovery: z.ZodDefault<z.ZodBoolean>;
    claude_tool_hardening: z.ZodDefault<z.ZodBoolean>;
    claude_prompt_auto_caching: z.ZodDefault<z.ZodBoolean>;
    proactive_token_refresh: z.ZodDefault<z.ZodBoolean>;
    proactive_refresh_buffer_seconds: z.ZodDefault<z.ZodNumber>;
    proactive_refresh_check_interval_seconds: z.ZodDefault<z.ZodNumber>;
    max_rate_limit_wait_seconds: z.ZodDefault<z.ZodNumber>;
    quota_fallback: z.ZodDefault<z.ZodBoolean>;
    cli_first: z.ZodDefault<z.ZodBoolean>;
    account_selection_strategy: z.ZodDefault<z.ZodEnum<{
        sticky: "sticky";
        "round-robin": "round-robin";
        hybrid: "hybrid";
    }>>;
    pid_offset_enabled: z.ZodDefault<z.ZodBoolean>;
    switch_on_first_rate_limit: z.ZodDefault<z.ZodBoolean>;
    scheduling_mode: z.ZodDefault<z.ZodEnum<{
        cache_first: "cache_first";
        balance: "balance";
        performance_first: "performance_first";
    }>>;
    max_cache_first_wait_seconds: z.ZodDefault<z.ZodNumber>;
    failure_ttl_seconds: z.ZodDefault<z.ZodNumber>;
    default_retry_after_seconds: z.ZodDefault<z.ZodNumber>;
    max_backoff_seconds: z.ZodDefault<z.ZodNumber>;
    request_jitter_max_ms: z.ZodDefault<z.ZodNumber>;
    soft_quota_threshold_percent: z.ZodDefault<z.ZodNumber>;
    quota_refresh_interval_minutes: z.ZodDefault<z.ZodNumber>;
    soft_quota_cache_ttl_minutes: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"auto">, z.ZodNumber]>>;
    health_score: z.ZodOptional<z.ZodObject<{
        initial: z.ZodDefault<z.ZodNumber>;
        success_reward: z.ZodDefault<z.ZodNumber>;
        rate_limit_penalty: z.ZodDefault<z.ZodNumber>;
        failure_penalty: z.ZodDefault<z.ZodNumber>;
        recovery_rate_per_hour: z.ZodDefault<z.ZodNumber>;
        min_usable: z.ZodDefault<z.ZodNumber>;
        max_score: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    token_bucket: z.ZodOptional<z.ZodObject<{
        max_tokens: z.ZodDefault<z.ZodNumber>;
        regeneration_rate_per_minute: z.ZodDefault<z.ZodNumber>;
        initial_tokens: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    auto_update: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type AntigravityConfig = z.infer<typeof AntigravityConfigSchema>;
export type SignatureCacheConfig = z.infer<typeof SignatureCacheConfigSchema>;
/**
 * Default configuration values.
 */
export declare const DEFAULT_CONFIG: AntigravityConfig;
//# sourceMappingURL=schema.d.ts.map