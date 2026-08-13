import type {
  PreinvestRange,
  VideoSyncState,
} from "../../shared/types.js";
import { preinvestRepository } from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import { collectCompassSnapshots } from "../platforms/compass/compass-gateway.js";
import { collectWindowProducts } from "../platforms/commerce/window-product-gateway.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";

export class PreinvestService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  getState(accountId: string): VideoSyncState {
    return preinvestRepository.getState(accountId);
  }

  resetTestData(accountId: string): void {
    preinvestRepository.resetTestData(accountId);
  }

  refresh(
    accountId: string,
    range: PreinvestRange,
  ): Promise<VideoSyncState> {
    const runtime = this.runtimes.forAccount(accountId);
    return runtime.runPlatformTask(
      "compass",
      `preinvest-refresh-${range}`,
      async (task) => {
        try {
          const result = await collectCompassSnapshots(
            runtime,
            range,
            task,
          );
          const missingProductIds = preinvestRepository.getMissingProductIds(
            accountId,
            result.videos,
          );
          if (missingProductIds.length > 0) {
            try {
              const products = await collectWindowProducts(runtime, task);
              preinvestRepository.saveProducts(products);
              logEvent("info", "preinvest-service", "missing_products_synced", {
                taskId: task.taskId,
                accountId,
                missingCount: missingProductIds.length,
                productCount: products.products.length,
              });
            } catch (error) {
              logEvent("error", "preinvest-service", "product_sync_skipped", {
                taskId: task.taskId,
                accountId,
                missingCount: missingProductIds.length,
                message:
                  error instanceof Error ? error.message : String(error),
              });
            }
          }
          preinvestRepository.saveResult(result);
          logEvent("info", "preinvest-service", "snapshot_saved", {
            taskId: task.taskId,
            accountId,
            range,
            syncedCount: result.syncedCount,
          });
          return preinvestRepository.getState(accountId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "投前数据刷新失败";
          preinvestRepository.saveError(
            accountId,
            message,
          );
          logEvent("error", "preinvest-service", "refresh_failed", {
            taskId: task.taskId,
            accountId,
            range,
            message,
          });
          throw error;
        }
      },
    );
  }
}
