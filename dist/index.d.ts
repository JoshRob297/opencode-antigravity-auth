import { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin } from "./src/plugin.js";
import { type V2Context } from "./src/v2/adapter.js";
/**
 * Official Dual-Compatibility Plugin for OpenCode v1 and v2.
 * - In v1 (1.18.29+): Invoked via export default .server(ctx)
 * - In v2 (2.0+): Invoked via export default .setup(ctx)
 */
declare const _default: {
    id: string;
    setup(ctx: V2Context): Promise<void | import("./src/v2/adapter.js").CleanupFunction>;
    server(ctx: any): Promise<import("./src/plugin/types.js").PluginResult>;
};
export default _default;
export { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, };
export { authorizeAntigravity, exchangeAntigravity, } from "./src/antigravity/oauth.js";
export type { AntigravityAuthorization, AntigravityTokenExchangeResult, } from "./src/antigravity/oauth.js";
//# sourceMappingURL=index.d.ts.map