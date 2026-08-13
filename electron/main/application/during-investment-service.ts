import type { DuringInvestmentState } from "../../shared/types.js";
import { duringInvestmentRepository } from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import { capturePromoteOrders } from "../platforms/promote/promote-order-gateway.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";

export class DuringInvestmentService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  getState(accountId: string, promotionId?: string): DuringInvestmentState {
    return duringInvestmentRepository.getState(accountId, promotionId);
  }

  hasCompletedSince(accountId: string, since: string): boolean {
    return duringInvestmentRepository.hasCompletedSince(accountId, since);
  }

  hasTrackedOrders(accountId: string): boolean {
    return duringInvestmentRepository.listTrackedPromotionIds(accountId).length > 0;
  }

  async capture(accountId: string): Promise<DuringInvestmentState> {
    const runtime = this.runtimes.forAccount(accountId);
    try {
      const result = await runtime.runPlatformTask(
        "promote",
        "during-investment-snapshot",
        (task) =>
          capturePromoteOrders(
            runtime,
            task,
            duringInvestmentRepository.listTrackedPromotionIds(accountId),
          ),
      );
      const capturedAt = new Date().toISOString();
      const unifiedResult = {
        ...result,
        capturedAt,
        orders: result.orders.map((order) => ({ ...order, capturedAt })),
      };
      if (unifiedResult.orders.length > 0) {
        duringInvestmentRepository.saveCapture(unifiedResult);
        logEvent("info", "during-investment", "snapshot_saved", {
          accountId,
          orderCount: unifiedResult.orders.length,
          requestCount: result.requestCount,
          capturedAt: result.capturedAt,
        });
      } else {
        logEvent("info", "during-investment", "empty_capture_skipped", {
          accountId,
          requestCount: result.requestCount,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("error", "during-investment", "snapshot_failed", {
        accountId,
        message,
      });
      throw error;
    }
    return this.getState(accountId);
  }
}
