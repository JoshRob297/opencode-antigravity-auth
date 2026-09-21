import { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, } from "./src/plugin.js";
import { setupV2 } from "./src/v2/adapter.js";
/**
 * Official Dual-Compatibility Plugin for OpenCode v1 and v2.
 * - In v1 (1.18.29+): Invoked via export default .server(ctx)
 * - In v2 (2.0+): Invoked via export default .setup(ctx)
 */
export default {
    id: "opencode-antigravity-auth",
    async setup(ctx) {
        return await setupV2(ctx);
    },
    async server(ctx) {
        return await AntigravityCLIOAuthPlugin(ctx);
    },
};
export { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, };
export { authorizeAntigravity, exchangeAntigravity, } from "./src/antigravity/oauth.js";
//# sourceMappingURL=index.js.map