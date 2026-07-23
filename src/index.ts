/**
 * index.ts — entry point for the Klin MCP Cloudflare Worker
 *
 * Wires together:
 *  - workers-oauth-provider  → handles the full OAuth 2.1 + PKCE dance with Claude
 *  - AuthHandler             → your Firebase login page + consent screen
 *  - KlinMCP                 → the actual MCP tools Claude calls
 */

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { AuthHandler } from "./auth-handler";
import { KlinMCP } from "./mcp";

export { KlinMCP };

export interface Env {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace<KlinMCP>;
  R2: R2Bucket;               // wrangler r2 bucket create klin-images
  R2_PUBLIC_URL: string;      // e.g. https://images.yourdomain.com or the r2.dev URL
  RENDER_BACKEND_URL: string;
  FIREBASE_PROJECT_ID: string;
  KLIN_SERVICE_KEY: string;
  COOKIE_SECRET: string;
}

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: KlinMCP.serve("/mcp"),
  defaultHandler: AuthHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  // Pre-register Claude's MCP client so auth survives KV wipes and redeployments.
  // Without this, Claude's clientId is only stored in KV — if KV is cleared or
  // the namespace changes, every existing token fails with "invalid_token" on
  // the client lookup step, even though the token itself is structurally valid.
  allowedClients: [
    {
      clientId: "FOTFBI0O3bmMumPn",
      clientSecret: undefined,      // public client (PKCE only, no secret)
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      scope: "generate balance jobs",
    },
  ],
});