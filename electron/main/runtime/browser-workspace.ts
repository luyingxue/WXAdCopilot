import { BrowserWindow, WebContentsView } from "electron";
import type { BrowserState, Platform, ViewBounds } from "../../shared/types.js";

export const PLATFORM_URLS: Record<Platform, string> = {
  commerce: "https://store.weixin.qq.com/talent/",
  compass: "https://store.weixin.qq.com/compass/home?source=11&today=0",
  promote: "https://channels.weixin.qq.com/promote/pages/platform/",
};

const ALLOWED_HOSTS = new Set([
  "channels.weixin.qq.com",
  "store.weixin.qq.com",
  "weixin.qq.com",
  "wx.qq.com",
  "qq.com",
]);

interface WorkspaceView {
  view: WebContentsView;
  accountId: string;
  platform: Platform;
}

/**
 * Native view layout only. Authentication and Session ownership deliberately
 * live in IdentityContainer.
 */
export class BrowserWorkspace {
  private readonly views = new Map<string, WorkspaceView>();
  private readonly attached = new Set<string>();
  private activeKey: string | null = null;
  private bounds: ViewBounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(private readonly window: BrowserWindow) {}

  private key(accountId: string, platform: Platform): string {
    return `${accountId}:${platform}`;
  }

  async show(
    accountId: string,
    platform: Platform,
    view: WebContentsView,
  ): Promise<void> {
    this.hideActive();
    const key = this.key(accountId, platform);
    if (!this.views.has(key)) {
      this.register({ view, accountId, platform });
    }
    this.activeKey = key;
    if (!this.attached.has(key)) {
      this.window.contentView.addChildView(view);
      this.attached.add(key);
    }
    view.setVisible(true);
    view.setBounds(this.bounds);
    if (!view.webContents.getURL()) {
      try {
        await view.webContents.loadURL(PLATFORM_URLS[platform]);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) {
          throw error;
        }
      }
    }
    this.emitState(this.views.get(key)!);
  }

  hideActive(): void {
    if (!this.activeKey) return;
    this.views.get(this.activeKey)?.view.setVisible(false);
    this.activeKey = null;
  }

  removeViews(views: readonly WebContentsView[]): void {
    const targets = new Set(views);
    for (const [key, entry] of this.views) {
      if (!targets.has(entry.view)) continue;
      if (this.activeKey === key) this.hideActive();
      if (this.attached.has(key)) {
        this.window.contentView.removeChildView(entry.view);
        this.attached.delete(key);
      }
      this.views.delete(key);
    }
  }

  setBounds(bounds: ViewBounds): void {
    this.bounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    };
    const current = this.activeKey ? this.views.get(this.activeKey) : null;
    current?.view.setBounds(this.bounds);
  }

  navigate(action: "back" | "forward" | "reload" | "home"): void {
    const current = this.activeKey ? this.views.get(this.activeKey) : null;
    if (!current) return;
    const contents = current.view.webContents;
    if (action === "back" && contents.navigationHistory.canGoBack()) {
      contents.navigationHistory.goBack();
    } else if (action === "forward" && contents.navigationHistory.canGoForward()) {
      contents.navigationHistory.goForward();
    } else if (action === "reload") {
      contents.reload();
    } else if (action === "home") {
      void contents.loadURL(PLATFORM_URLS[current.platform]);
    }
  }

  dispose(): void {
    this.hideActive();
    for (const entry of this.views.values()) {
      if (this.attached.has(this.key(entry.accountId, entry.platform))) {
        this.window.contentView.removeChildView(entry.view);
      }
    }
    this.views.clear();
    this.attached.clear();
  }

  private register(entry: WorkspaceView): void {
    const { view } = entry;
    const emit = (): void => this.emitState(entry);
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (this.isAllowedUrl(url)) void view.webContents.loadURL(url);
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (event, url) => {
      if (!this.isAllowedUrl(url)) event.preventDefault();
    });
    view.webContents.on("did-start-loading", emit);
    view.webContents.on("did-stop-loading", emit);
    view.webContents.on("did-navigate", emit);
    view.webContents.on("did-navigate-in-page", emit);
    view.webContents.on("page-title-updated", emit);
    this.views.set(this.key(entry.accountId, entry.platform), entry);
  }

  private isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        [...ALLOWED_HOSTS].some(
          (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
        )
      );
    } catch {
      return false;
    }
  }

  private emitState(entry: WorkspaceView): void {
    if (this.activeKey !== this.key(entry.accountId, entry.platform)) return;
    const contents = entry.view.webContents;
    const state: BrowserState = {
      accountId: entry.accountId,
      platform: entry.platform,
      url: contents.getURL(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      loading: contents.isLoading(),
    };
    this.window.webContents.send("browser:state", state);
  }
}
