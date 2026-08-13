import type { Account, Platform } from "../../shared/types.js";
import { logEvent } from "../infrastructure/observability/logger.js";
import { accountRepository } from "../infrastructure/persistence/repositories.js";
import type { IdentityInspection } from "../runtime/identity-container.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";

function classify(inspection: IdentityInspection): {
  online: boolean;
  reason: string | null;
} {
  if (!inspection.hasVisiblePage) {
    return {
      online: false,
      reason: "尚未打开官方页面，未执行会引起跳转的主动探测",
    };
  }
  const loginPage = /\/login(?:[/?#]|$)/i.test(inspection.url);
  if (loginPage || inspection.state === "authenticating") {
    return { online: false, reason: "官方页面要求重新登录" };
  }
  if (inspection.platform === "promote") {
    const hasSession = inspection.cookieNames.some(
      (name) => name.toLowerCase() === "promotewebsessionid",
    );
    if (!hasSession) return { online: false, reason: "未发现加热平台会话" };
    return {
      online: inspection.url.includes("/promote/pages/platform"),
      reason: inspection.url.includes("/promote/pages/platform")
        ? null
        : "当前页面不是加热平台工作台",
    };
  }
  const expectedPath =
    inspection.platform === "commerce" ? "/talent/" : "/compass/";
  const online = new URL(inspection.url).pathname.startsWith(expectedPath);
  return {
    online,
    reason: online ? null : `当前页面不是对应工作台（${inspection.url}）`,
  };
}

export class HealthService {
  constructor(private readonly runtimes: RuntimeRegistry) {}

  async checkAccount(accountId: string): Promise<Account[]> {
    const runtime = this.runtimes.forAccount(accountId);
    for (const platform of ["commerce", "compass", "promote"] as Platform[]) {
      accountRepository.setPlatformStatus(accountId, platform, "checking");
      try {
        const inspection = await runtime.inspectPlatform(platform);
        const result = classify(inspection);
        accountRepository.setPlatformStatus(
          accountId,
          platform,
          result.online ? "online" : "unknown",
          result.reason,
        );
        logEvent("info", "login-health", "inspected_without_navigation", {
          accountId,
          platform,
          domain: inspection.domain,
          state: inspection.state,
          url: inspection.url,
          online: result.online,
          cookieNames: inspection.cookieNames,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "登录状态读取失败";
        accountRepository.setPlatformStatus(
          accountId,
          platform,
          "unknown",
          message,
        );
        logEvent("error", "login-health", "inspection_failed", {
          accountId,
          platform,
          message,
        });
      }
    }
    return accountRepository.list();
  }

  async checkAll(): Promise<Account[]> {
    for (const account of accountRepository.list()) {
      await this.checkAccount(account.id);
    }
    return accountRepository.list();
  }
}
