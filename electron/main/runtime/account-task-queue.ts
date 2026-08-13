import { randomUUID } from "node:crypto";
import { logEvent } from "../infrastructure/observability/logger.js";

export type IdentityDomain = "store" | "promote";

export interface AccountTaskContext {
  taskId: string;
  accountId: string;
  domain: IdentityDomain;
  taskType: string;
}

export class AccountTaskQueue {
  private readonly tails = new Map<IdentityDomain, Promise<void>>();

  constructor(private readonly accountId: string) {}

  async drain(domain: IdentityDomain): Promise<void> {
    await (this.tails.get(domain) ?? Promise.resolve()).catch(() => undefined);
  }

  async run<T>(
    domain: IdentityDomain,
    taskType: string,
    operation: (context: AccountTaskContext) => Promise<T>,
  ): Promise<T> {
    const taskId = randomUUID();
    const previous = this.tails.get(domain) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(domain, current);

    logEvent("info", "task-queue", "queued", {
      taskId,
      accountId: this.accountId,
      domain,
      taskType,
    });
    await previous.catch(() => undefined);

    const context: AccountTaskContext = {
      taskId,
      accountId: this.accountId,
      domain,
      taskType,
    };
    const startedAt = Date.now();
    logEvent("info", "task-queue", "started", { ...context });
    try {
      const result = await operation(context);
      logEvent("info", "task-queue", "completed", {
        ...context,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      logEvent("error", "task-queue", "failed", {
        ...context,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      release();
      if (this.tails.get(domain) === current) this.tails.delete(domain);
    }
  }
}
