import { app, safeStorage, type Cookie, type Session } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

interface StoredCookie {
  domain?: string;
  hostOnly: boolean;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: Cookie["sameSite"];
  secure: boolean;
  value: string;
}

function journalPath(identityKey: string): string {
  return path.join(
    app.getPath("userData"),
    "identity-journal",
    `${identityKey}.bin`,
  );
}

function cookieKey(cookie: Pick<StoredCookie, "name" | "domain" | "path">): string {
  return `${cookie.name}\u0000${cookie.domain ?? ""}\u0000${cookie.path}`;
}

function toStoredCookie(cookie: Cookie): StoredCookie {
  return {
    domain: cookie.domain,
    hostOnly: cookie.hostOnly === true,
    httpOnly: cookie.httpOnly === true,
    name: cookie.name,
    path: cookie.path || "/",
    sameSite: cookie.sameSite,
    secure: cookie.secure === true,
    value: cookie.value,
  };
}

/**
 * Encrypted cold-start journal for official session cookies.
 *
 * It is not a second live cookie store: checkpoints only read Electron's
 * authoritative Session, and restore only fills cookies absent from a newly
 * created Session. Existing cookies are never cleared, overwritten, merged, or
 * normalized.
 */
export class SessionCookieJournal {
  constructor(private readonly identityKey: string) {}

  async checkpoint(accountSession: Session): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) return;
    const cookies = await accountSession.cookies.get({ session: true });
    const payload = JSON.stringify(cookies.map(toStoredCookie));
    const encrypted = safeStorage.encryptString(payload);
    const target = journalPath(this.identityKey);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, target);
  }

  async restoreMissing(accountSession: Session): Promise<number> {
    if (!safeStorage.isEncryptionAvailable()) return 0;
    let encrypted: Buffer;
    try {
      encrypted = await readFile(journalPath(this.identityKey));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return 0;
      }
      throw error;
    }
    const stored = JSON.parse(
      safeStorage.decryptString(encrypted),
    ) as StoredCookie[];
    const current = await accountSession.cookies.get({});
    const existing = new Set(
      current.map((cookie) =>
        cookieKey({
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path || "/",
        }),
      ),
    );
    let restored = 0;
    for (const cookie of stored) {
      if (existing.has(cookieKey(cookie))) continue;
      const hostname = (cookie.domain ?? "").replace(/^\./, "");
      if (!hostname) continue;
      await accountSession.cookies.set({
        url: `${cookie.secure ? "https" : "http"}://${hostname}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
      });
      restored += 1;
    }
    return restored;
  }

  async clear(): Promise<void> {
    await rm(journalPath(this.identityKey), { force: true });
  }
}
