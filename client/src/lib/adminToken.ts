// Platform admin token storage.
//
// This token used to live in localStorage: it never expired, survived logout and
// tab close, and stayed readable by any script on the origin forever — one XSS
// chain away from full control-plane access. It now lives in sessionStorage with
// a hard expiry, and the legacy localStorage copy is scrubbed on first read and
// never written again. The complete fix is a short-lived server-issued session
// in an httpOnly cookie; until the server contract grows one, this keeps the
// secret out of persistent JS-readable storage and bounds its lifetime.

const SESSION_KEY = "platformAdminToken";
const LEGACY_LOCAL_KEY = "platformAdminToken";

// One working session — after this the admin must re-enter the token.
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

type StoredToken = { token: string; expiresAt: number };

// If storage is unavailable (blocked or quota errors), the token still works for
// the current page via this module-level fallback.
let memoryToken = "";

function parseStored(raw: string): StoredToken | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredToken> | null;
    if (typeof parsed?.token === "string" && parsed.token.length > 0 && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now()) {
      return { token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch {
    // Corrupted entry — treat as absent below.
  }
  return null;
}

export function readAdminToken(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const stored = parseStored(raw);
      if (stored) {
        memoryToken = stored.token;
        return stored.token;
      }
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // sessionStorage unavailable — fall through to the legacy copy.
  }
  try {
    const legacy = localStorage.getItem(LEGACY_LOCAL_KEY);
    if (legacy) {
      // Migrate the old persistent copy into the short-lived session store and
      // scrub it, so nothing script-readable outlives the tab.
      localStorage.removeItem(LEGACY_LOCAL_KEY);
      saveAdminToken(legacy);
      return legacy;
    }
  } catch {
    // localStorage unavailable too.
  }
  return memoryToken;
}

export function saveAdminToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.removeItem(LEGACY_LOCAL_KEY);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + TOKEN_TTL_MS } satisfies StoredToken));
  } catch {
    // Storage unavailable — the in-memory fallback above still covers this page.
  }
}
