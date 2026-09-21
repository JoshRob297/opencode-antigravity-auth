import {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
} from "./src/plugin.js";
import { setupV2, type V2Context } from "./src/v2/adapter.js";

/**
 * Official Dual-Compatibility Plugin for OpenCode v1 and v2.
 * - In v1 (1.18.29+): Invoked via export default .server(ctx)
 * - In v2 (2.0+): Invoked via export default .setup(ctx)
 */
export default {
  id: "opencode-antigravity-auth",
  async setup(ctx: V2Context) {
    return await setupV2(ctx);
  },
  async server(ctx: any) {
    return await AntigravityCLIOAuthPlugin(ctx);
  },
};

export {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
};

export {
  authorizeAntigravity,
  exchangeAntigravity,
} from "./src/antigravity/oauth.js";

export type {
  AntigravityAuthorization,
  AntigravityTokenExchangeResult,
} from "./src/antigravity/oauth.js";
