import { accountRepository } from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import type { StoreSessionService } from "./store-session-service.js";

const INTERVAL_MS = 30 * 60 * 1_000;
const START_DELAY_MS = 60 * 1_000;

export class StoreSessionScheduler {
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private running = false;

  constructor(private readonly service: StoreSessionService) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.timer = setTimeout(() => void this.runAndSchedule(), START_DELAY_MS);
    logEvent("info", "store-session-scheduler", "started", {
      intervalMinutes: INTERVAL_MS / 60_000,
      firstRunDelaySeconds: START_DELAY_MS / 1_000,
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async runAndSchedule(): Promise<void> {
    try {
      await this.run();
    } finally {
      if (!this.stopped) {
        this.timer = setTimeout(() => void this.runAndSchedule(), INTERVAL_MS);
      }
    }
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      for (const account of accountRepository.list()) {
        try {
          await this.service.keepAlive(account.id);
        } catch (error) {
          logEvent("warn", "store-session-scheduler", "account_failed", {
            accountId: account.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
