import { WebContentsView } from "electron";
import type { Platform } from "../../shared/types.js";
import type { BrowserWorkspace } from "./browser-workspace.js";
import {
  AccountTaskQueue,
  type AccountTaskContext,
  type IdentityDomain,
} from "./account-task-queue.js";
import {
  IdentityContainer,
  type IdentityInspection,
} from "./identity-container.js";

function identityDomain(platform: Platform): IdentityDomain {
  return platform === "promote" ? "promote" : "store";
}

export class AccountRuntime {
  private readonly tasks: AccountTaskQueue;
  private readonly identities: Record<IdentityDomain, IdentityContainer>;
  private closing = false;

  constructor(
    readonly accountId: string,
    private readonly workspace: BrowserWorkspace,
  ) {
    this.tasks = new AccountTaskQueue(accountId);
    this.identities = {
      store: new IdentityContainer(accountId, "store"),
      promote: new IdentityContainer(accountId, "promote"),
    };
  }

  async showPlatform(platform: Platform): Promise<void> {
    this.assertOpen();
    const view = await this.identity(platform).getVisibleView(platform);
    await this.workspace.show(this.accountId, platform, view);
  }

  resetPlatform(platform: Platform): Promise<void> {
    this.assertOpen();
    const domain = identityDomain(platform);
    return this.tasks.run(domain, `reset-${domain}-identity`, async () => {
      const removed = await this.identities[domain].reset();
      this.workspace.removeViews(removed);
    });
  }

  runPlatformTask<T>(
    platform: Platform,
    taskType: string,
    operation: (context: AccountTaskContext) => Promise<T>,
  ): Promise<T> {
    this.assertOpen();
    return this.tasks.run(identityDomain(platform), taskType, operation);
  }

  createExecutor(platform: Platform): Promise<WebContentsView> {
    this.assertOpen();
    return this.identity(platform).createExecutor(platform);
  }

  inspectPlatform(platform: Platform): Promise<IdentityInspection> {
    this.assertOpen();
    return this.identity(platform).inspect(platform);
  }

  async flush(): Promise<void> {
    this.assertOpen();
    await Promise.all([
      this.identities.store.flush(),
      this.identities.promote.flush(),
    ]);
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    await Promise.all([this.tasks.drain("store"), this.tasks.drain("promote")]);
    const removed = (
      await Promise.all([
        this.identities.store.close(),
        this.identities.promote.close(),
      ])
    ).flat();
    this.workspace.removeViews(removed);
  }

  private identity(platform: Platform): IdentityContainer {
    return this.identities[identityDomain(platform)];
  }

  private assertOpen(): void {
    if (this.closing) {
      throw new Error(`账号运行时正在关闭：${this.accountId}`);
    }
  }
}
