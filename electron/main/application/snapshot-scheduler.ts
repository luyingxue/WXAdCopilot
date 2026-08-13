import { preinvestRepository } from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import type { PreinvestService } from "./preinvest-service.js";
import type { SnapshotMachineStatus } from "../../shared/types.js";

const INTERVAL_MS = 30 * 60 * 1000;

export class SnapshotScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;
  private runningAccountId: string | null = null;
  private nextRunAt: string | null = null;

  constructor(private readonly preinvest: PreinvestService) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.nextRunAt = new Date(Date.now() + 5_000).toISOString();
    // Capture once shortly after startup, then align later cycles to :00/:30.
    // The hidden executor is isolated, so this does not navigate visible pages.
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.scheduleNext());
    }, 5_000);
    logEvent("info", "snapshot-scheduler", "startup_capture_scheduled", {
      delaySeconds: 5,
      intervalMinutes: 30,
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  getStatus(accountId: string): SnapshotMachineStatus {
    const latest = this.preinvest.getState(accountId);
    const enabled =
      preinvestRepository.listSnapshotEnabledAccountIds().includes(accountId);
    return {
      state: !enabled
        ? "disabled"
        : this.runningAccountId === accountId
          ? "refreshing"
          : latest.lastError
            ? "error"
            : "scheduled",
      lastRefreshedAt: latest.lastSyncedAt,
      nextRefreshAt: enabled ? this.nextRunAt : null,
      intervalMinutes: 30,
      message: !enabled
        ? "尚未建立快照"
        : this.runningAccountId === accountId
          ? "正在刷新"
          : latest.lastError
            ? "上次刷新失败"
            : "每半小时刷新",
    };
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const now = Date.now();
    const nextBoundary = Math.floor(now / INTERVAL_MS + 1) * INTERVAL_MS;
    const delay = Math.max(1_000, nextBoundary - now);
    this.nextRunAt = new Date(nextBoundary).toISOString();
    logEvent("info", "snapshot-scheduler", "scheduled", {
      nextRunAt: new Date(nextBoundary).toISOString(),
      intervalMinutes: 30,
    });
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.scheduleNext());
    }, delay);
  }

  private async run(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    const startedAt = Date.now();
    try {
      for (const accountId of preinvestRepository.listSnapshotEnabledAccountIds()) {
        this.runningAccountId = accountId;
        const bucketStart = new Date(
          Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS,
        ).toISOString();
        if (
          process.env.WXAD_FORCE_SNAPSHOT !== "1" &&
          preinvestRepository.hasCompletedSnapshotSince(accountId, bucketStart)
        ) {
          logEvent("info", "snapshot-scheduler", "bucket_already_captured", {
            accountId,
            bucketStart,
          });
          continue;
        }
        try {
          await this.preinvest.refresh(accountId, "fortnight");
        } catch (error) {
          logEvent("warn", "snapshot-scheduler", "account_failed", {
            accountId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      logEvent("info", "snapshot-scheduler", "cycle_completed", {
        durationMs: Date.now() - startedAt,
      });
    } finally {
      this.runningAccountId = null;
      this.running = false;
    }
  }
}
