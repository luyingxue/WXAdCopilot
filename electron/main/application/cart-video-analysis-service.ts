import type { CartVideoAnalysisState } from "../../shared/types.js";
import {
  cartVideoAnalysisRepository,
  preinvestRepository,
  productRepository,
} from "../infrastructure/persistence/repositories.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import { collectAllCartVideoAnalysis } from "../platforms/compass/compass-gateway.js";
import { collectWindowProducts } from "../platforms/commerce/window-product-gateway.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";

export class CartVideoAnalysisService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  getState(accountId: string): CartVideoAnalysisState {
    return cartVideoAnalysisRepository.getState(accountId);
  }

  refresh(accountId: string): Promise<CartVideoAnalysisState> {
    const runtime = this.runtimes.forAccount(accountId);
    return runtime.runPlatformTask(
      "compass",
      "cart-video-analysis-refresh",
      async (task) => {
        try {
          const previous = cartVideoAnalysisRepository.getState(accountId);
          const result = await collectAllCartVideoAnalysis(
            runtime,
            task,
            cartVideoAnalysisRepository.getKnownCommerceStatuses(accountId),
            previous.videos,
            previous.lastSyncedAt,
          );
          const missingProductIds = preinvestRepository.getMissingProductIds(
            accountId,
            result.videos,
          );
          const productState = productRepository.getState(accountId);
          const productDataIsStale =
            productState.lastSyncedAt === null ||
            Date.now() - new Date(productState.lastSyncedAt).getTime() >
              24 * 60 * 60 * 1_000;
          if (missingProductIds.length > 0 && productDataIsStale) {
            try {
              preinvestRepository.saveProducts(
                await collectWindowProducts(runtime, task),
              );
            } catch (error) {
              logEvent(
                "warn",
                "cart-video-analysis",
                "product_sync_skipped",
                {
                  accountId,
                  missingCount: missingProductIds.length,
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              );
            }
          }
          cartVideoAnalysisRepository.saveResult(result);
          return cartVideoAnalysisRepository.getState(accountId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "带货视频刷新失败";
          cartVideoAnalysisRepository.saveError(accountId, message);
          throw error;
        }
      },
    );
  }
}
