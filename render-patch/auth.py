"""
auth.py — drop-in replacement for your existing auth.py

The only change is Branch 0: service-key auth for internal Worker→Render calls.
Everything else (Firebase JWT, API keys) is completely unchanged.

To use:
  1. Set KLIN_SERVICE_KEY env var on Render to the same value as your
     Cloudflare Worker secret (wrangler secret put KLIN_SERVICE_KEY).
  2. Replace your backend/auth.py with this file.
  3. That's it. No other backend changes needed.
"""

import hashlib
import os
import secrets

from fastapi import Header, HTTPException
from firebase_app import auth_mod
import firestore_db

API_KEY_PREFIX = "sk-"
API_KEY_RANDOM_BYTES = 32


class CurrentUser:
    def __init__(self, uid: str, email: str | None):
        self.uid = uid
        self.email = email


def generate_api_key() -> str:
    return API_KEY_PREFIX + secrets.token_urlsafe(API_KEY_RANDOM_BYTES)


def hash_api_key(plaintext_key: str) -> str:
    return hashlib.sha256(plaintext_key.encode()).hexdigest()


async def get_current_user(
    authorization: str = Header(default=""),
    x_user_uid: str = Header(default="", alias="X-User-UID"),
) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()

    # ── Branch 0 (NEW): Cloudflare Worker service key ────────────────────
    # The MCP Worker authenticates with a shared secret and passes the real
    # user's Firebase UID in the X-User-UID header. We trust it only when
    # the service key matches exactly.
    service_key = os.environ.get("KLIN_SERVICE_KEY", "")
    if service_key and token == service_key:
        if not x_user_uid:
            raise HTTPException(
                status_code=401,
                detail="Service auth requires X-User-UID header",
            )
        # Ensure the user exists in Firestore (creates them if first-time MCP user)
        profile = firestore_db.get_or_create_user(x_user_uid, None)
        return CurrentUser(uid=x_user_uid, email=profile.get("email"))

    # ── Branch 1: API key (sk-...) ───────────────────────────────────────
    if token.startswith(API_KEY_PREFIX):
        return _verify_api_key(token)

    # ── Branch 2: Firebase JWT ───────────────────────────────────────────
    try:
        decoded = auth_mod.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))


def _verify_api_key(plaintext_key: str) -> CurrentUser:
    key_hash = hash_api_key(plaintext_key)
    try:
        entry = firestore_db.get_api_key_index(key_hash)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if entry is None:
        raise HTTPException(status_code=401, detail="Invalid API key")

    uid = entry.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid API key")

    profile = firestore_db.get_user(uid)
    if not profile:
        raise HTTPException(status_code=401, detail="API key owner not found")

    return CurrentUser(uid=uid, email=profile.get("email"))
