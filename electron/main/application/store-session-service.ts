import type { RuntimeRegistry } from "../runtime/runtime-registry.js";
import { keepStoreSessionAlive } from "../platforms/compass/store-session-gateway.js";

export class StoreSessionService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  keepAlive(accountId: string): Promise<void> {
    const runtime = this.runtimes.forAccount(accountId);
    return runtime.runPlatformTask(
      "compass",
      "store-session-keepalive",
      async (task) => {
        await keepStoreSessionAlive(runtime, task);
      },
    );
  }
}
