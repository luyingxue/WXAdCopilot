import { WebContentsView, type WebFrameMain } from "electron";
import type {
  ProductSummary,
  ProductSyncResult,
} from "../../../shared/types.js";
import type { AccountRuntime } from "../../runtime/account-runtime.js";
import type { AccountTaskContext } from "../../runtime/account-task-queue.js";
import { logEvent } from "../../infrastructure/observability/logger.js";

const WINDOW_URL = "https://store.weixin.qq.com/talent/channel/window";
const ENDPOINT = "/shop-faas/mmeckolwindownode/window/getTalentWindowProducts";
const ACTIVE_PAGE_SIZE = 20;
const ENDED_PAGE_SIZE = 30;

interface WindowProduct {
  productId?: string | number;
  outProductId?: string | number;
  title?: string;
  productName?: string;
  shortTitle?: string;
  platformName?: string;
  status?: string | number;
  statusWording?: string;
  commissionInfo?: {
    commissionRate?: string | number;
  };
}

interface WindowResponse {
  code?: number;
  msg?: string;
  data?: {
    products?: WindowProduct[];
    productList?: WindowProduct[];
    totalNum?: number;
    continueFlag?: boolean;
  };
  products?: WindowProduct[];
  productList?: WindowProduct[];
  totalNum?: number;
  continueFlag?: boolean;
}

async function collectWithOfficialClient(
  view: WebContentsView,
): Promise<Array<{ status: 1 | 2; response: WindowResponse }>> {
  const endpoint = JSON.stringify(`${ENDPOINT}?token=&lang=zh_CN`);
  return await view.webContents.executeJavaScript(`
    (async () => {
      const cookies = Object.fromEntries(
        document.cookie.split("; ").filter(Boolean).map((item) => {
          const index = item.indexOf("=");
          return index < 0
            ? [item, ""]
            : [item.slice(0, index), item.slice(index + 1)];
        })
      );
      const request = async (data) => {
        const response = await fetch(${endpoint}, {
          method: "POST",
          credentials: "include",
          headers: {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "biz_magic": cookies.biz_magic || "",
            "talent_magic": cookies.talent_magic || "",
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error("商品接口 HTTP " + response.status);
        }
        return response.json();
      };
      const results = [];
      for (const status of [1, 2]) {
        const pageSize = status === 1 ? 20 : 30;
        let offset = 0;
        for (;;) {
          const payload = status === 1
            ? { pageSize, offset, productSource: null, reqSource: 1 }
            : {
                productStatus: 2,
                offset,
                pageSize,
                totalNum: 0,
                curPage: Math.floor(offset / pageSize) + 1,
              };
          const response = await request(payload);
          results.push({ status, response });
          const body = response?.data || response || {};
          const rows = body.products || body.productList || [];
          offset += rows.length;
          const total = Number(body.totalNum || 0);
          if (
            rows.length === 0 ||
            body.continueFlag === false ||
            (total > 0 && offset >= total) ||
            (body.continueFlag === undefined &&
              total === 0 &&
              rows.length < pageSize)
          ) break;
        }
      }
      return results;
    })()
  `, true) as Array<{ status: 1 | 2; response: WindowResponse }>;
}

async function collectOfficialPageResponses(
  view: WebContentsView,
): Promise<ProductSummary[]> {
  const debuggerApi = view.webContents.debugger;
  if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
  await debuggerApi.sendCommand("Network.enable");
  const requests = new Map<
    string,
    { status: 1 | 2; responseSeen: boolean }
  >();
  const products = new Map<string, ProductSummary>();
  let activeTotal = 0;
  let endedTotal = 0;
  let responseCount = 0;

  const onMessage = (
    _event: Electron.Event,
    method: string,
    params: Record<string, unknown>,
  ) => {
    if (method === "Network.requestWillBeSent") {
      const request = params.request as
        | { url?: string; postData?: string }
        | undefined;
      if (!request?.url?.includes(ENDPOINT)) return;
      let status: 1 | 2 = 1;
      try {
        const payload = JSON.parse(request.postData ?? "{}") as {
          productStatus?: number;
        };
        status = payload.productStatus === 2 ? 2 : 1;
      } catch {
        // The active-products request has no productStatus.
      }
      requests.set(String(params.requestId), {
        status,
        responseSeen: false,
      });
    }
    if (method === "Network.responseReceived") {
      const request = requests.get(String(params.requestId));
      if (request) request.responseSeen = true;
    }
    if (method !== "Network.loadingFinished") return;
    const requestId = String(params.requestId);
    const request = requests.get(requestId);
    if (!request?.responseSeen) return;
    void debuggerApi
      .sendCommand("Network.getResponseBody", { requestId })
      .then((result: { body?: string; base64Encoded?: boolean }) => {
        if (!result.body) return;
        const text = result.base64Encoded
          ? Buffer.from(result.body, "base64").toString("utf8")
          : result.body;
        const response = JSON.parse(text) as WindowResponse;
        const body = responseBody(response);
        const rows = body.products ?? body.productList ?? [];
        const total = Number(body.totalNum ?? rows.length);
        if (request.status === 1) activeTotal = Math.max(activeTotal, total);
        else endedTotal = Math.max(endedTotal, total);
        for (const row of rows) {
          const product = normalizeProduct(
            row,
            request.status === 1 ? "active" : "ended",
          );
          if (product) products.set(product.productId, product);
        }
        responseCount += 1;
      })
      .catch(() => undefined);
  };
  debuggerApi.on("message", onMessage);
  try {
    await view.webContents.loadURL(WINDOW_URL);
    await waitForLoad(view);
    if (/\/login/.test(view.webContents.getURL())) {
      throw new Error("微信小店带货助手登录已失效");
    }
    const deadline = Date.now() + 20_000;
    let previousResponseCount = -1;
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      const expected = activeTotal + endedTotal;
      if (expected > 0 && products.size >= expected) break;
      for (const frame of view.webContents.mainFrame.framesInSubtree) {
        try {
          await frame.executeJavaScript(`
            (() => {
              const next = [...document.querySelectorAll("button")].find(
                (button) =>
                  !button.disabled &&
                  /下一页|下一页/.test(button.textContent || button.getAttribute("aria-label") || "")
              );
              if (next) {
                next.click();
                return "next";
              }
              let moved = false;
              for (const element of document.querySelectorAll("*")) {
                if (element.scrollHeight > element.clientHeight + 20) {
                  element.scrollTop = element.scrollHeight;
                  moved = true;
                }
              }
              window.scrollTo(0, document.documentElement.scrollHeight);
              return moved ? "scroll" : "none";
            })()
          `, true);
        } catch {
          // Ignore frames that navigate while the micro frontend updates.
        }
      }
      if (
        responseCount === previousResponseCount &&
        responseCount >= 2 &&
        expected === 0
      ) {
        break;
      }
      previousResponseCount = responseCount;
    }
    if (products.size === 0) {
      throw new Error("带货助手商品列表未返回数据");
    }
    return [...products.values()];
  } finally {
    debuggerApi.removeListener("message", onMessage);
    if (debuggerApi.isAttached()) debuggerApi.detach();
  }
}

async function waitForLoad(view: WebContentsView): Promise<void> {
  if (!view.webContents.isLoading()) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 20_000);
    view.webContents.once("did-stop-loading", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForProductClient(
  view: WebContentsView,
): Promise<WebFrameMain> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const frame of view.webContents.mainFrame.framesInSubtree) {
      try {
        const ready = await frame.executeJavaScript(`
          (() => {
            if (!Array.isArray(window.webpackJsonp)) return false;
            const webpackRuntimes = [];
            const captureId =
              900000000 + Math.floor(Math.random() * 99999999);
            const modules = {};
            modules[captureId] = (_module, _exports, runtime) => {
              webpackRuntimes.push(runtime);
            };
            window.webpackJsonp.push([[captureId], modules, [[captureId]]]);
            return webpackRuntimes.some((runtime) =>
              Object.values(runtime?.m ?? {}).some((factory) =>
                String(factory).includes("getTalentWindowProducts")
              )
            );
          })()
        `, true) as boolean;
        if (ready) return frame;
      } catch {
        // A child frame may navigate while the micro frontend is mounting.
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("等待带货助手官方商品请求客户端超时");
}

async function requestPage(
  frame: WebFrameMain,
  payload: Record<string, unknown>,
): Promise<WindowResponse> {
  const input = JSON.stringify({ endpoint: ENDPOINT, payload });
  return await frame.executeJavaScript(`
    (async () => {
      const { endpoint, payload } = ${input};
      const webpackRuntimes = [];
      const captureId = 900000000 + Math.floor(Math.random() * 99999999);
      const modules = {};
      modules[captureId] = (_module, _exports, runtime) => {
        webpackRuntimes.push(runtime);
      };
      window.webpackJsonp.push([
        [captureId],
        modules,
        [[captureId]],
      ]);
      let webpackRequire;
      let productModuleId;
      for (const runtime of webpackRuntimes) {
        const entry = Object.entries(runtime?.m ?? {}).find(([, factory]) =>
          String(factory).includes("getTalentWindowProducts")
        );
        if (entry) {
          webpackRequire = runtime;
          productModuleId = entry[0];
          break;
        }
      }
      if (!webpackRequire) throw new Error("未取得带货助手官方请求客户端");
      const productModule = webpackRequire(productModuleId);
      const request = Object.values(productModule).find(
        (candidate) =>
          typeof candidate === "function" &&
          String(candidate).includes("getTalentWindowProducts")
      );
      if (typeof request !== "function") {
        throw new Error("带货助手商品接口模块已变化");
      }
      return request(payload);
    })()
  `, true) as WindowResponse;
}

function responseBody(response: WindowResponse) {
  return response.data ?? response;
}

function normalizeProduct(
  product: WindowProduct,
  promotionStatus: ProductSummary["promotionStatus"],
): ProductSummary | null {
  const productId = String(product.productId ?? "").trim();
  if (!productId) return null;
  const rawRate = Number(product.commissionInfo?.commissionRate);
  return {
    productId,
    outProductId:
      product.outProductId === undefined || product.outProductId === null
        ? null
        : String(product.outProductId),
    title: String(product.title ?? product.productName ?? ""),
    shortTitle: String(product.shortTitle ?? ""),
    shopName: String(product.platformName ?? ""),
    // Official value 470000 is displayed as 47%; store a calculation fraction.
    commissionRate: Number.isFinite(rawRate) ? rawRate / 1_000_000 : null,
    promotionStatus,
    rawJson: JSON.stringify(product),
  };
}

async function collectStatus(
  frame: WebFrameMain,
  productStatus: 1 | 2,
): Promise<ProductSummary[]> {
  const products: ProductSummary[] = [];
  let offset = 0;
  for (;;) {
    const pageSize =
      productStatus === 1 ? ACTIVE_PAGE_SIZE : ENDED_PAGE_SIZE;
    const payload =
      productStatus === 1
        ? { pageSize, offset, productSource: null, reqSource: 1 }
        : {
            productStatus: 2,
            offset,
            pageSize,
            totalNum: 0,
            curPage: Math.floor(offset / pageSize) + 1,
          };
    const response = await requestPage(frame, payload);
    if (response.code !== undefined && response.code !== 0) {
      throw new Error(
        `商品列表请求失败（${response.code}）：${response.msg ?? "无错误说明"}`,
      );
    }
    const body = responseBody(response);
    const page = body.products ?? body.productList ?? [];
    for (const item of page) {
      const normalized = normalizeProduct(
        item,
        productStatus === 1 ? "active" : "ended",
      );
      if (normalized) products.push(normalized);
    }
    offset += page.length;
    const total = Number(body.totalNum ?? 0);
    if (
      page.length === 0 ||
      body.continueFlag === false ||
      (total > 0 && offset >= total) ||
      (body.continueFlag === undefined && total === 0 && page.length < pageSize)
    ) {
      break;
    }
  }
  return products;
}

export async function collectWindowProducts(
  runtime: AccountRuntime,
  task: AccountTaskContext,
): Promise<ProductSyncResult> {
  const view = await runtime.createExecutor("commerce");
  try {
    await view.webContents.loadURL(WINDOW_URL);
    await waitForLoad(view);
    if (/\/login/.test(view.webContents.getURL())) {
      throw new Error("微信小店带货助手登录已失效");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
    const pages = await collectWithOfficialClient(view);
    const captured: ProductSummary[] = [];
    for (const page of pages) {
      if (
        page.response.code !== undefined &&
        Number(page.response.code) !== 0
      ) {
        throw new Error(
          `商品列表请求失败（${page.response.code}）：${page.response.msg ?? "无错误说明"}`,
        );
      }
      const body = responseBody(page.response);
      for (const row of body.products ?? body.productList ?? []) {
        const product = normalizeProduct(
          row,
          page.status === 1 ? "active" : "ended",
        );
        if (product) captured.push(product);
      }
    }
    const byId = new Map<string, ProductSummary>();
    for (const product of captured) {
      const previous = byId.get(product.productId);
      byId.set(product.productId, {
        ...product,
        commissionRate:
          product.commissionRate ?? previous?.commissionRate ?? null,
      });
    }
    logEvent("info", "window-product-gateway", "products_collected", {
      taskId: task.taskId,
      accountId: runtime.accountId,
      activeCount: captured.filter(
        (product) => product.promotionStatus === "active",
      ).length,
      endedCount: captured.filter(
        (product) => product.promotionStatus === "ended",
      ).length,
    });
    return {
      accountId: runtime.accountId,
      syncedAt: new Date().toISOString(),
      products: [...byId.values()],
    };
  } catch (error) {
    logEvent("error", "window-product-gateway", "collection_failed", {
      taskId: task.taskId,
      accountId: runtime.accountId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    });
    throw error;
  } finally {
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
