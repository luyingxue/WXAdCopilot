import { WebContentsView } from "electron";
import type { AccountRuntime } from "../../runtime/account-runtime.js";
import type { AccountTaskContext } from "../../runtime/account-task-queue.js";
import { logEvent } from "../../infrastructure/observability/logger.js";

const COMPASS_HOME_URL = "https://store.weixin.qq.com/compass/home";
const LOGIN_ACCOUNT_LIST_ENDPOINT =
  "/shop-faas/mmecnodecompasscommon/common/getLoginAccountList";
const BIZ_SESSION_ENDPOINT =
  "/shop-faas/mmecnodecompasscommon/common/getBizSession";
const ACCOUNT_INFO_ENDPOINT =
  "/shop-faas/mmecnodecompasscommon/common/account-info";

export interface CompassBusinessContext {
  bizId: string;
  feedAccountId: string;
  accountType: string;
  bizType: string;
  accountCount: number;
  accountInfoVerified: boolean;
}

function isNavigationContextError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Execution context was destroyed") ||
      error.message.includes("Cannot find context with specified id") ||
      error.message.includes("Target page, context or browser has been closed"))
  );
}

async function waitForLoadStopped(view: WebContentsView): Promise<void> {
  if (!view.webContents.isLoading()) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 20_000);
    view.webContents.once("did-stop-loading", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export async function waitForCompassReady(
  view: WebContentsView,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitForLoadStopped(view);
    const firstUrl = view.webContents.getURL();
    if (/\/(?:compass|talent)\/login/.test(firstUrl)) {
      throw new Error("微信小店登录已失效");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    if (view.webContents.getURL() === firstUrl) return;
  }
  throw new Error("电商罗盘页面持续跳转，无法建立稳定会话");
}

export async function getCompassRouterModuleUrl(
  view: WebContentsView,
): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const url = (await view.webContents.executeJavaScript(
        `(() => performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((item) => /\\/assets\\/router\\.[^/]+\\.js(?:\\?|$)/.test(item)) || "")()`,
        true,
      )) as string;
      if (url) return url;
    } catch (error) {
      if (!isNavigationContextError(error)) throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("等待罗盘官方请求客户端超时");
}

export async function establishCompassBusinessContext(
  view: WebContentsView,
  routerModuleUrl: string,
): Promise<CompassBusinessContext> {
  const input = JSON.stringify({
    routerModuleUrl,
    loginEndpoint: LOGIN_ACCOUNT_LIST_ENDPOINT,
    sessionEndpoint: BIZ_SESSION_ENDPOINT,
    accountInfoEndpoint: ACCOUNT_INFO_ENDPOINT,
  });
  return (await view.webContents.executeJavaScript(
    `(async () => {
      const config = ${input};
      const module = await import(config.routerModuleUrl);
      const candidates = [];
      const seen = new Set();
      const visit = (value, depth = 0) => {
        if (
          value === null ||
          (typeof value !== "object" && typeof value !== "function") ||
          seen.has(value) ||
          depth > 2
        ) return;
        seen.add(value);
        if (
          typeof value.get === "function" &&
          typeof value.post === "function"
        ) candidates.push(value);
        for (const child of Object.values(value)) visit(child, depth + 1);
      };
      visit(module);
      const client = candidates[0];
      if (!client) {
        throw new Error(
          "罗盘官方请求客户端模块已变化：未找到 get/post 方法（exports=" +
            Object.keys(module).join(",") +
            "）"
        );
      }
      const withTimeout = (promise, label) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(label + "超时")),
          12_000,
        )),
      ]);

      const accountsResponse = await withTimeout(client.get({
        url: config.loginEndpoint,
        useWxTicket: true,
      }), "罗盘登录账号请求");
      if (accountsResponse?.code !== 0) {
        throw new Error("微信小店登录已失效");
      }
      const storeAccounts = Array.isArray(accountsResponse.ecStoreInfoList)
        ? accountsResponse.ecStoreInfoList : [];
      const finderAccounts = Array.isArray(accountsResponse.finderList)
        ? accountsResponse.finderList : [];
      const talentAccounts = Array.isArray(accountsResponse.talentList)
        ? accountsResponse.talentList : [];
      const accounts = [...storeAccounts, ...finderAccounts, ...talentAccounts];
      if (!accounts.length) throw new Error("当前微信身份没有可用的罗盘账号");

      let feedAccountId = "";
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key?.startsWith("FeedHomeListFilter")) continue;
        try {
          const value = JSON.parse(sessionStorage.getItem(key) || "{}");
          if (typeof value.selectedAccount === "string") {
            feedAccountId = value.selectedAccount;
            break;
          }
        } catch {}
      }
      const feedBizId = feedAccountId.split("@")[0] || "";
      let selected = talentAccounts.find((item) => item?.appid === feedBizId);
      if (!selected && talentAccounts.length === 1) selected = talentAccounts[0];
      if (!selected && accounts.length === 1) selected = accounts[0];
      if (!selected) {
        throw new Error("罗盘存在多个可用账号，请先在官网选择一次当前带货账号");
      }

      const sessionResponse = await withTimeout(client.post({
        url: config.sessionEndpoint,
        data: {
          bizId: selected.appid,
          bizType: selected.bizType,
          accountType: selected.accountType,
          ...(selected.ecAcctLogicType == null
            ? {}
            : { ecAcctLogicType: selected.ecAcctLogicType }),
          writeLegacyCookie: true,
        },
        useWxTicket: true,
      }), "罗盘业务会话请求");
      if (sessionResponse?.code !== 0 || !sessionResponse.token) {
        throw new Error("罗盘业务会话建立失败");
      }
      const accountInfo = await withTimeout(
        client.get({ url: config.accountInfoEndpoint }),
        "罗盘账号验证请求",
      );
      return {
        bizId: String(selected.appid || ""),
        feedAccountId:
          feedAccountId ||
          String(selected.appid || "") + "@" + String(selected.accountType ?? ""),
        accountType: String(selected.accountType ?? ""),
        bizType: String(selected.bizType ?? ""),
        accountCount: accounts.length,
        accountInfoVerified:
          accountInfo?.code === 0 &&
          Boolean(accountInfo?.accountInfo?.bizId),
      };
    })()`,
    true,
  )) as CompassBusinessContext;
}

export async function keepStoreSessionAlive(
  runtime: AccountRuntime,
  task: AccountTaskContext,
): Promise<CompassBusinessContext> {
  const view = await runtime.createExecutor("compass");
  try {
    await view.webContents.loadURL(COMPASS_HOME_URL);
    await waitForCompassReady(view);
    const moduleUrl = await getCompassRouterModuleUrl(view);
    const context = await establishCompassBusinessContext(view, moduleUrl);
    await runtime.flush();
    logEvent("info", "store-session", "keepalive_succeeded", {
      taskId: task.taskId,
      accountId: runtime.accountId,
      accountType: context.accountType,
      bizType: context.bizType,
      accountCount: context.accountCount,
      accountInfoVerified: context.accountInfoVerified,
    });
    return context;
  } finally {
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
