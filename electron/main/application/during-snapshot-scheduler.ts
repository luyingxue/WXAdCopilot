import { accountRepository } from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import type { DuringInvestmentService } from "./during-investment-service.js";
import type { SnapshotMachineStatus } from "../../shared/types.js";

const INTERVAL_MS = 30 * 1_000;
const DISCOVERY_INTERVAL_MS = 5 * 60 * 1_000;

function bucketStart(now = Date.now()): string {
  return new Date(Math.floor(now / INTERVAL_MS) * INTERVAL_MS).toISOString();
}

export class DuringSnapshotScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private runningAccountId: string | null = null;
  private readonly lastDiscoveryAt = new Map<string, number>();

  constructor(private readonly service: DuringInvestmentService) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    setTimeout(() => void this.tick(true), 8_000);
    logEvent("info", "during-snapshot-scheduler", "started", {
      intervalMinutes: INTERVAL_MS / 60_000,
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus(accountId: string): SnapshotMachineStatus {
    const latest = this.service.getState(accountId);
    const tracked = this.service.hasTrackedOrders(accountId);
    const discoveryAt = this.lastDiscoveryAt.get(accountId);
    const nextAt = tracked
      ? Math.floor(Date.now() / INTERVAL_MS + 1) * INTERVAL_MS
      : (discoveryAt ?? Date.now()) + DISCOVERY_INTERVAL_MS;
    return {
      state:
        this.runningAccountId === accountId
          ? "refreshing"
          : latest.lastError
            ? "error"
            : tracked
              ? "scheduled"
              : "waiting",
      lastRefreshedAt: latest.lastCapturedAt,
      nextRefreshAt: new Date(nextAt).toISOString(),
      intervalMinutes: tracked ? 0.5 : 5,
      message:
        this.runningAccountId === accountId
          ? "正在刷新"
          : latest.lastError
            ? "上次刷新失败"
            : tracked
              ? "活动订单每30秒刷新"
              : "等待活动订单",
    };
  }

  async discoverNow(accountId: string): Promise<void> {
    if (this.running) {
      throw new Error("投中快照机正在执行，请稍后再试");
    }
    this.running = true;
    this.runningAccountId = accountId;
    try {
      await this.service.capture(accountId);
      this.lastDiscoveryAt.set(accountId, Date.now());
    } finally {
      this.runningAccountId = null;
      this.running = false;
    }
  }

  private async tick(force = false): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const accounts = accountRepository
        .list()
        .filter((account) => account.platforms.promote.status === "online");
      for (const account of accounts) {
        const hasTrackedOrders = this.service.hasTrackedOrders(account.id);
        const lastDiscovery = this.lastDiscoveryAt.get(account.id) ?? 0;
        if (
          !force &&
          !hasTrackedOrders &&
          Date.now() - lastDiscovery < DISCOVERY_INTERVAL_MS
        ) {
          continue;
        }
        if (!force && this.service.hasCompletedSince(account.id, bucketStart())) {
          continue;
        }
        try {
          this.runningAccountId = account.id;
          await this.service.capture(account.id);
          if (!hasTrackedOrders) {
            this.lastDiscoveryAt.set(account.id, Date.now());
          }
        } catch {
          // The service records a durable error; another account may still run.
        } finally {
          this.runningAccountId = null;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
