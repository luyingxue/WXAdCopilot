import type { BrowserWindow } from "electron";
import type { Platform, ViewBounds } from "../../shared/types.js";
import { BrowserWorkspace } from "./browser-workspace.js";
import { AccountRuntime } from "./account-runtime.js";

export class RuntimeRegistry {
  private readonly workspace: BrowserWorkspace;
  private readonly runtimes = new Map<string, AccountRuntime>();

  constructor(window: BrowserWindow) {
    this.workspace = new BrowserWorkspace(window);
  }

  forAccount(accountId: string): AccountRuntime {
    let runtime = this.runtimes.get(accountId);
    if (!runtime) {
      runtime = new AccountRuntime(accountId, this.workspace);
      this.runtimes.set(accountId, runtime);
    }
    return runtime;
  }

  show(accountId: string, platform: Platform): Promise<void> {
    return this.forAccount(accountId).showPlatform(platform);
  }

  hideActive(): void {
    this.workspace.hideActive();
  }

  setBounds(bounds: ViewBounds): void {
    this.workspace.setBounds(bounds);
  }

  navigate(action: "back" | "forward" | "reload" | "home"): void {
    this.workspace.navigate(action);
  }

  async destroyAccount(accountId: string): Promise<void> {
    const runtime = this.runtimes.get(accountId);
    if (runtime) {
      await runtime.shutdown();
      this.runtimes.delete(accountId);
    }
  }

  async flush(): Promise<void> {
    await Promise.all([...this.runtimes.values()].map((runtime) => runtime.flush()));
  }

  dispose(): void {
    this.workspace.dispose();
    this.runtimes.clear();
  }
}
