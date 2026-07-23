/**
 * auth-handler.ts — Firebase login + MCP OAuth consent flow
 *
 * Flow:
 *   1. Claude hits /authorize → workers-oauth-provider calls this handler
 *   2. We show a Firebase login page (uses Firebase JS SDK client-side)
 *   3. User signs in → Firebase gives them an ID token in the browser
 *   4. Browser POSTs that ID token to /authorize/callback
 *   5. We verify it with Firebase's public keys (no Admin SDK needed in Workers)
 *   6. We call oauthProvider.completeAuthorization() → Claude gets its MCP token
 *   7. Every subsequent MCP tool call has userId = Firebase UID automatically
 */

import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "./index";

// ── Firebase token verification ───────────────────────────────────────────────
// Workers can't run firebase-admin, but Firebase public keys are available
// via HTTPS. We verify the JWT signature using the Web Crypto API.

async function verifyFirebaseToken(
  idToken: string,
  projectId: string
): Promise<{ uid: string; email?: string }> {
  // Decode the JWT header to get the key ID
  const [headerB64, payloadB64, signatureB64] = idToken.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Invalid token format");
  }

  const header = JSON.parse(atob(headerB64.replace(/-/g, "+").replace(/_/g, "/")));
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

  // Basic claims validation
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error("Token expired");
  if (payload.iat > now + 300) throw new Error("Token issued in the future");
  if (payload.aud !== projectId) throw new Error("Wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Wrong issuer");
  if (!payload.sub) throw new Error("Missing subject");

  // Fetch Firebase public keys as JWKs (avoids the "Invalid SPKI input" error
  // that occurs when trying to importKey() a full X.509 certificate DER blob).
  const keysResp = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
    { cf: { cacheTtl: 3600 } } as RequestInit
  );
  if (!keysResp.ok) throw new Error("Could not fetch Firebase public keys");
  const { keys } = await keysResp.json() as { keys: JsonWebKey[] & { kid: string }[] };

  const jwk = (keys as any[]).find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error("Unknown key ID");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Verify signature
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = Uint8Array.from(
    atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
    c => c.charCodeAt(0)
  );
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, signedData);
  if (!valid) throw new Error("Invalid token signature");

  return { uid: payload.sub, email: payload.email };
}

// ── CSRF helpers ──────────────────────────────────────────────────────────────

function generateCSRFToken(): { token: string; cookie: string } {
  const token = crypto.randomUUID();
  return {
    token,
    cookie: `__Host-klin_csrf=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
  };
}

function validateCSRFToken(formToken: string | null, request: Request): boolean {
  const cookie = request.headers.get("Cookie") ?? "";
  const cookieToken = cookie
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith("__Host-klin_csrf="))
    ?.split("=")[1];
  return !!formToken && !!cookieToken && formToken === cookieToken;
}

const clearCSRFCookie =
  `__Host-klin_csrf=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;

// ── Login page HTML ───────────────────────────────────────────────────────────
// Uses Firebase JS SDK loaded from CDN. After sign-in, gets the ID token and
// posts it back to /authorize/callback along with the oauthState param.

function loginPageHTML(oauthState: string, csrfToken: string, error?: string): string {
  const errorBanner = error
    ? `<div class="error">${escapeHtml(error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Klin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0f;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e8e8f0;
    }

    .card {
      background: #13131a;
      border: 1px solid #2a2a3a;
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
    }

    .logo-mark {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #7c6dfa, #b06dfb);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .logo-text {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #fff;
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 8px;
      letter-spacing: -0.3px;
    }

    .subtitle {
      font-size: 14px;
      color: #8888a0;
      margin-bottom: 32px;
      line-height: 1.5;
    }

    .error {
      background: rgba(255, 80, 80, 0.1);
      border: 1px solid rgba(255, 80, 80, 0.3);
      color: #ff7070;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 20px;
    }

    .btn {
      width: 100%;
      padding: 14px 20px;
      border-radius: 10px;
      border: none;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: opacity 0.15s, transform 0.1s;
    }

    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .btn-google {
      background: #fff;
      color: #1a1a1a;
      margin-bottom: 12px;
    }

    .btn-email {
      background: linear-gradient(135deg, #7c6dfa, #b06dfb);
      color: #fff;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
      color: #44445a;
      font-size: 12px;
    }

    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #2a2a3a;
    }

    .input {
      width: 100%;
      padding: 12px 14px;
      background: #0a0a0f;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      color: #e8e8f0;
      font-size: 14px;
      margin-bottom: 10px;
      outline: none;
      transition: border-color 0.15s;
    }

    .input:focus { border-color: #7c6dfa; }

    .terms {
      margin-top: 24px;
      font-size: 12px;
      color: #55556a;
      text-align: center;
      line-height: 1.5;
    }

    .terms a { color: #7c6dfa; text-decoration: none; }

    #email-section { display: none; }
    #loading { display: none; text-align: center; color: #8888a0; font-size: 14px; padding: 20px 0; }

    .spinner {
      display: inline-block;
      width: 20px; height: 20px;
      border: 2px solid #2a2a3a;
      border-top-color: #7c6dfa;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-mark">✦</div>
      <span class="logo-text">Klin</span>
    </div>

    <h1>Connect to Claude</h1>
    <p class="subtitle">Sign in to link your Klin account. Claude will be able to generate images on your behalf.</p>

    ${errorBanner}

    <div id="auth-section">
      <button class="btn btn-google" id="google-btn" onclick="signInWithGoogle()">
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"/></svg>
        Continue with Google
      </button>

      <div class="divider">or</div>

      <button class="btn btn-email" onclick="toggleEmail()" id="email-toggle-btn">
        Continue with Email
      </button>

      <div id="email-section">
        <br>
        <input type="email" class="input" id="email-input" placeholder="you@example.com" />
        <input type="password" class="input" id="password-input" placeholder="Password" />
        <button class="btn btn-email" onclick="signInWithEmail()">Sign In</button>
      </div>
    </div>

    <div id="loading">
      <span class="spinner"></span> Connecting your account…
    </div>

    <p class="terms">
      By connecting, you agree to Klin's
      <a href="https://klin-skill.netlify.app/terms" target="_blank">Terms</a> and
      <a href="https://klin-skill.netlify.app/privacy" target="_blank">Privacy Policy</a>.
    </p>
  </div>

  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
    import {
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      signInWithEmailAndPassword
    } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";

    const app = initializeApp({
      apiKey: "AIzaSyBfIPti1MJ1x1s_yAEahNgLmhM6xmY3sik",
      authDomain: "klin0web.firebaseapp.com",
      projectId: "klin0web",
    });

    // Handle redirect result on page load (for browsers that block popups)
    const auth = getAuth(app);
    getRedirectResult(auth).then(result => {
      if (result?.user) completeLogin(result.user);
    }).catch(() => {});

    const oauthState = ${JSON.stringify(oauthState)};
    const csrfToken = ${JSON.stringify(csrfToken)};

    async function completeLogin(user) {
      document.getElementById("auth-section").style.display = "none";
      document.getElementById("loading").style.display = "block";

      try {
        const idToken = await user.getIdToken();
        const resp = await fetch("/authorize/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, oauthState, csrfToken }),
        });

        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          window.location.href =
            "/authorize?error=" + encodeURIComponent(data.error || "Login failed") +
            "&oauth_state=" + encodeURIComponent(oauthState);
        }
      } catch (e) {
        window.location.href =
          "/authorize?error=" + encodeURIComponent(e.message) +
          "&oauth_state=" + encodeURIComponent(oauthState);
      }
    }

    window.signInWithGoogle = async function() {
      const provider = new GoogleAuthProvider();
      try {
        document.getElementById("google-btn").disabled = true;
        const result = await signInWithPopup(auth, provider);
        await completeLogin(result.user);
      } catch (e) {
        // Popup blocked or auth/invalid-credential in restricted contexts
        // (e.g. Claude's OAuth browser) — fall back to redirect flow
        if (e.code === "auth/popup-blocked" ||
            e.code === "auth/popup-cancelled-by-user" ||
            e.code === "auth/invalid-credential" ||
            e.code === "auth/cancelled-popup-request") {
          await signInWithRedirect(auth, provider);
          return; // redirect flow continues via getRedirectResult() on reload
        }
        document.getElementById("google-btn").disabled = false;
        window.location.href =
          "/authorize?error=" + encodeURIComponent(e.message) +
          "&oauth_state=" + encodeURIComponent(oauthState);
      }
    };

    window.signInWithEmail = async function() {
      const email = document.getElementById("email-input").value;
      const password = document.getElementById("password-input").value;
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await completeLogin(result.user);
      } catch (e) {
        window.location.href =
          "/authorize?error=" + encodeURIComponent(e.message) +
          "&oauth_state=" + encodeURIComponent(oauthState);
      }
    };

    window.toggleEmail = function() {
      const s = document.getElementById("email-section");
      const btn = document.getElementById("email-toggle-btn");
      if (s.style.display === "none" || !s.style.display) {
        s.style.display = "block";
        btn.style.display = "none";
      } else {
        s.style.display = "none";
        btn.style.display = "flex";
      }
    };
  </script>
</body>
</html>`;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main handler ──────────────────────────────────────────────────────────────

export class AuthHandler extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    // workers-oauth-provider injects the helper on env.OAUTH_PROVIDER before
    // calling this handler — not on ctx. See oauth-provider.js line 156-157.
    const oauthProvider = (this.env as any).OAUTH_PROVIDER;
    return handleRequest(request, this.env, oauthProvider);
  }
}

async function handleRequest(
  request: Request,
  env: Env,
  oauthProvider: any
): Promise<Response> {
  const url = new URL(request.url);

  // ── GET /authorize — show Firebase login page ─────────────────────────
  if (url.pathname === "/authorize" && request.method === "GET") {
    const error = url.searchParams.get("error") ?? undefined;

    // If this is our own error-retry redirect (e.g. "/authorize?error=...&oauth_state=..."),
    // reuse the oauth_state we already encoded so the user doesn't restart the flow.
    // Otherwise this is the real OAuth request from Claude — it carries standard
    // params (response_type, client_id, redirect_uri, scope, state, code_challenge, ...),
    // NOT an "oauth_state" param, so we must parse it ourselves and encode it.
    let oauthState = url.searchParams.get("oauth_state") ?? "";

    if (!oauthState) {
      try {
        const oauthReqInfo = await oauthProvider.parseAuthRequest(request);
        oauthState = btoa(JSON.stringify(oauthReqInfo));
      } catch (e: any) {
        return new Response(`Invalid authorization request: ${e.message}`, { status: 400 });
      }
    }

    const { token: csrfToken, cookie: csrfCookie } = generateCSRFToken();

    return new Response(loginPageHTML(oauthState, csrfToken, error), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": csrfCookie,
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": [
          "default-src 'none'",
          "script-src 'self' 'unsafe-inline' 'unsafe-hashes' https://www.gstatic.com",
          "style-src 'unsafe-inline'",
          "img-src 'self' https: data:",
          "connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com https://accounts.google.com",
          "frame-src https://klin0web.firebaseapp.com https://accounts.google.com",
          "form-action 'self'",
        ].join("; "),
      },
    });
  }

  // ── POST /authorize/callback — verify Firebase token, complete OAuth ──
  if (url.pathname === "/authorize/callback" && request.method === "POST") {
    let body: { idToken?: string; oauthState?: string; csrfToken?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { idToken, oauthState, csrfToken } = body;

    // CSRF check
    if (!validateCSRFToken(csrfToken ?? null, request)) {
      return new Response(JSON.stringify({ error: "Invalid CSRF token. Please try again." }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Set-Cookie": clearCSRFCookie },
      });
    }

    if (!idToken || !oauthState) {
      return new Response(JSON.stringify({ error: "Missing idToken or oauthState" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify Firebase token
    let user: { uid: string; email?: string };
    try {
      user = await verifyFirebaseToken(idToken, env.FIREBASE_PROJECT_ID);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `Auth failed: ${e.message}` }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Set-Cookie": clearCSRFCookie },
      });
    }

    // Complete the OAuth flow — workers-oauth-provider mints the MCP token
    // and returns { redirectTo: string } with the URL to send Claude back to.
    try {
      // oauthState is the base64-encoded AuthRequest we produced in the GET
      // /authorize handler via parseAuthRequest() — decode it back.
      const authRequest = JSON.parse(atob(oauthState));

      const { redirectTo } = await oauthProvider.completeAuthorization({
        request: authRequest,          // parsed AuthRequest, NOT the raw HTTP Request
        userId: user.uid,
        metadata: { email: user.email ?? "" },
        props: { userId: user.uid, email: user.email ?? "" }, // encrypted, sent on every MCP call
        scope: authRequest.scope?.length ? authRequest.scope : ["generate", "balance", "jobs"],
      });

      return new Response(JSON.stringify({ redirectUrl: redirectTo }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Set-Cookie": clearCSRFCookie },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: `Could not complete authorization: ${e.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Set-Cookie": clearCSRFCookie },
      });
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────
  return new Response("Klin MCP Server", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}