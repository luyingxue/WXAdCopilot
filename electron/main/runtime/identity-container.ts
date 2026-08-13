import { WebContentsView, session, type Session } from "electron";
import type { Platform } from "../../shared/types.js";
import { SessionCookieJournal } from "../infrastructure/security/session-cookie-journal.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import type { IdentityDomain } from "./account-task-queue.js";

export type IdentityState =
  | "cold"
  | "ready"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "resetting"
  | "closed";

export interface IdentityInspection {
  domain: IdentityDomain;
  state: IdentityState;
  platform: Platform;
  url: string;
  cookieNames: string[];
  hasVisiblePage: boolean;
}

const DOMAIN_PLATFORMS: Record<IdentityDomain, readonly Platform[]> = {
  store: ["commerce", "compass"],
  promote: ["promote"],
};

function createWebContentsView(accountSession: Session): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      session: accountSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
}

/**
 * Owns exactly one official-site browser identity.
 *
 * The Electron persistent Session is the only authentication source of truth.
 * This class never exports, rewrites, deduplicates, or restores cookies.
 */
export class IdentityContainer {
  private readonly accountSession: Session;
  private readonly journal: SessionCookieJournal;
  private readonly ready: Promise<void>;
  private readonly visibleViews = new Map<Platform, WebContentsView>();
  private readonly executors = new Set<WebContentsView>();
  private checkpointTimer: NodeJS.Timeout | null = null;
  private state: IdentityState = "cold";

  constructor(
    private readonly accountId: string,
    readonly domain: IdentityDomain,
  ) {
    const partition = `persist:wxad_v3_${accountId}_${domain}`;
    this.accountSession = session.fromPartition(partition);
    this.journal = new SessionCookieJournal(`${accountId}-${domain}`);
    const browserUserAgent = this.accountSession
      .getUserAgent()
      .replace(/\sElectron\/[\d.]+/g, "")
      .replace(/\swxadcopilot\/[\d.]+/gi, "");
    this.accountSession.setUserAgent(browserUserAgent);
    this.accountSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        callback(permission === "clipboard-sanitized-write");
      },
    );
    this.ready = this.journal
      .restoreMissing(this.accountSession)
      .then((restored) => {
        this.state = "ready";
        logEvent("info", "identity-container", "cold_start_restored", {
          accountId,
          domain,
          restoredCookieCount: restored,
        });
      });
  }

  owns(platform: Platform): boolean {
    return DOMAIN_PLATFORMS[this.domain].includes(platform);
  }

  async getVisibleView(platform: Platform): Promise<WebContentsView> {
    this.assertOwns(platform);
    this.assertOpen();
    await this.ready;
    let view = this.visibleViews.get(platform);
    if (!view || view.webContents.isDestroyed()) {
      view = createWebContentsView(this.accountSession);
      this.observeAuthentication(view);
      this.visibleViews.set(platform, view);
    }
    return view;
  }

  async createExecutor(platform: Platform): Promise<WebContentsView> {
    this.assertOwns(platform);
    this.assertOpen();
    await this.ready;
    const executor = createWebContentsView(this.accountSession);
    this.executors.add(executor);
    executor.webContents.once("destroyed", () => {
      this.executors.delete(executor);
    });
    return executor;
  }

  async inspect(platform: Platform): Promise<IdentityInspection> {
    this.assertOwns(platform);
    await this.ready;
    const view = this.visibleViews.get(platform);
    const url =
      view && !view.webContents.isDestroyed() ? view.webContents.getURL() : "";
    const cookieUrl =
      this.domain === "store"
        ? "https://store.weixin.qq.com/"
        : "https://channels.weixin.qq.com/";
    const cookies = await this.accountSession.cookies.get({ url: cookieUrl });
    return {
      domain: this.domain,
      state: this.state,
      platform,
      url,
      cookieNames: [...new Set(cookies.map((cookie) => cookie.name))],
      hasVisiblePage: Boolean(url),
    };
  }

  async flush(): Promise<void> {
    this.assertOpen();
    await this.ready;
    await this.journal.checkpoint(this.accountSession);
    await this.accountSession.flushStorageData();
  }

  async reset(): Promise<WebContentsView[]> {
    this.assertOpen();
    await this.ready;
    this.state = "resetting";
    if (this.checkpointTimer) clearTimeout(this.checkpointTimer);
    this.checkpointTimer = null;
    const removed = this.closeAllViews();
    await this.accountSession.clearStorageData();
    await this.accountSession.clearCache();
    await this.accountSession.flushStorageData();
    await this.journal.clear();
    this.state = "ready";
    return removed;
  }

  async close(): Promise<WebContentsView[]> {
    if (this.state === "closed") return [];
    await this.ready;
    if (this.checkpointTimer) clearTimeout(this.checkpointTimer);
    this.checkpointTimer = null;
    await this.journal.checkpoint(this.accountSession);
    await this.accountSession.flushStorageData();
    const removed = this.closeAllViews();
    this.state = "closed";
    return removed;
  }

  private closeAllViews(): WebContentsView[] {
    const views = [...this.visibleViews.values(), ...this.executors];
    this.visibleViews.clear();
    this.executors.clear();
    for (const view of views) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    return views;
  }

  private observeAuthentication(view: WebContentsView): void {
    const update = (): void => {
      const url = view.webContents.getURL();
      if (!url) return;
      const isLogin =
        /\/login(?:[/?#]|$)/i.test(url) ||
        (this.domain === "promote" && !url.includes("/promote/pages/platform"));
      this.state = isLogin ? "authenticating" : "authenticated";
    };
    view.webContents.on("did-navigate", update);
    view.webContents.on("did-navigate-in-page", update);
    view.webContents.on("did-stop-loading", () => {
      update();
      this.scheduleCheckpoint();
    });
  }

  private scheduleCheckpoint(): void {
    if (this.checkpointTimer) clearTimeout(this.checkpointTimer);
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = null;
      void this.journal.checkpoint(this.accountSession).catch((error) => {
        logEvent("error", "identity-container", "checkpoint_failed", {
          accountId: this.accountId,
          domain: this.domain,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }, 2_000);
  }

  private assertOwns(platform: Platform): void {
    if (!this.owns(platform)) {
      throw new Error(`${this.domain} 身份容器不负责 ${platform}`);
    }
  }

  private assertOpen(): void {
    if (this.state === "closed") {
      throw new Error(`${this.domain} 身份容器已关闭`);
    }
  }
}
