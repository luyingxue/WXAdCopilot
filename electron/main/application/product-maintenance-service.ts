import type { ProductMaintenanceState } from "../../shared/types.js";
import { productRepository } from "../infrastructure/persistence/repositories.js";
import { collectWindowProducts } from "../platforms/commerce/window-product-gateway.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";
import type { CartVideoAnalysisService } from "./cart-video-analysis-service.js";

export class ProductMaintenanceService {
  constructor(
    private readonly runtimes: RuntimeRegistry,
    private readonly cartVideoAnalysis: CartVideoAnalysisService,
  ) {}

  getState(accountId: string): ProductMaintenanceState {
    return productRepository.getState(accountId);
  }

  refresh(accountId: string): Promise<ProductMaintenanceState> {
    const runtime = this.runtimes.forAccount(accountId);
    return runtime.runPlatformTask(
      "commerce",
      "manual-product-refresh",
      async (task) => {
        const result = await collectWindowProducts(runtime, task);
        productRepository.save(result);
        return productRepository.getState(accountId);
      },
    );
  }

  async refreshBusinessData(accountId: string): Promise<ProductMaintenanceState> {
    await this.cartVideoAnalysis.refresh(accountId);
    return this.getState(accountId);
  }
}
