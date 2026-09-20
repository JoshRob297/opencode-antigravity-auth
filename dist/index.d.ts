import { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin } from "./src/plugin.js";
/**
 * Hybrid Dual-Compatibility Plugin for OpenCode v1 and OpenCode v2.
 *
 * - In OpenCode v1 (opencode-ai): Executed directly as a plugin factory function:
 *     await defaultPlugin({ client, directory }) -> { auth, event, tool }
 *
 * - In OpenCode v2 (@opencode/cli): Inspected as a plugin definition object:
 *     id: "opencode-antigravity-auth"
 *     setup: async (v2Context) => cleanup
 */
declare const plugin: any;
export default plugin;
export { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, };
export { authorizeAntigravity, exchangeAntigravity, } from "./src/antigravity/oauth.js";
export type { AntigravityAuthorization, AntigravityTokenExchangeResult, } from "./src/antigravity/oauth.js";
//# sourceMappingURL=index.d.ts.map