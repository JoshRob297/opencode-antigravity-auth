/**
 * OpenCode configuration file updater.
 *
 * Updates ~/.config/opencode/opencode.json(c) with plugin models.
 */
export interface UpdateConfigResult {
    success: boolean;
    configPath: string;
    error?: string;
}
export interface OpencodeConfig {
    $schema?: string;
    plugin?: string[];
    provider?: {
        google?: {
            models?: Record<string, unknown>;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export interface UpdateConfigOptions {
    /** Override the config file path (for testing) */
    configPath?: string;
}
export declare const ANTIGRAVITY_QUOTA_COMMAND_FILENAME = "antigravity-quota.md";
export declare const ANTIGRAVITY_UPDATE_COMMAND_FILENAME = "antigravity-update.md";
export declare const ANTIGRAVITY_QUOTA_COMMAND_CONTENT = "---\ndescription: Consultar estado de cuotas de Antigravity (5h y Semanal)\n---\n\nUse the `antigravity_quota` tool to check the current quota status.\n\nThis will show:\n- API quota remaining for each model (Gemini 3 Pro, Flash, Claude via Antigravity)\n- Per-account breakdown with visual progress bars\n- Time until quota reset\n- Local rate limit cache status\n\nJust call the tool directly:\n```\nantigravity_quota()\n```\n\nIMPORTANT: Display the tool output EXACTLY as it is returned. Do not summarize, reformat, or modify the output in any way.\n";
export declare const ANTIGRAVITY_UPDATE_COMMAND_CONTENT = "---\ndescription: Actualizar plugin opencode-antigravity-auth a la \u00FAltima versi\u00F3n\n---\n\nEjecuta la actualizaci\u00F3n del plugin de Antigravity en este entorno:\n\n1. Si el plugin est\u00E1 cargado como ruta local (ej. en /root/proyectos/opencode-antigravity-auth):\n   - Ve a ese directorio, haz `git pull origin main`, y luego compila con `npm run build`.\n   - Muestra la versi\u00F3n actualizada resultante de package.json.\n2. Si est\u00E1 cargado desde GitHub (`github:JoshRob297/opencode-antigravity-auth`):\n   - Informa al usuario que reinicie OpenCode para descargar la \u00FAltima versi\u00F3n de GitHub o limpia la cach\u00E9 con rm -rf ~/.cache/opencode/.\n";
/**
 * Ensures the /antigravity-quota and /antigravity-update slash commands are installed in OpenCode's command directory.
 *
 * @param configDir - Optional custom config dir (for testing)
 * @returns Path of the command file created or updated
 */
export declare function ensureAntigravityQuotaCommand(configDir?: string): string;
/**
 * Get the opencode config directory path.
 */
export declare function getOpencodeConfigDir(): string;
/**
 * Get the opencode config file path.
 *
 * Prefers opencode.jsonc when present so we update the active config file
 * instead of creating a new opencode.json.
 */
export declare function getOpencodeConfigPath(): string;
/**
 * Updates the opencode configuration file with plugin models.
 *
 * This function:
 * 1. Reads existing opencode.json/opencode.jsonc (or creates default structure)
 * 2. Replaces `provider.google.models` with plugin models
 * 3. Writes back to disk with proper formatting
 *
 * Preserves:
 * - $schema and other top-level config keys
 * - Non-google provider sections
 * - Other settings within google provider (except models)
 *
 * @param options - Optional configuration (e.g., custom configPath for testing)
 * @returns UpdateConfigResult with success status and path
 */
export declare function updateOpencodeConfig(options?: UpdateConfigOptions): Promise<UpdateConfigResult>;
//# sourceMappingURL=updater.d.ts.map