import type { WebContentsView } from "electron";
import type { AccountRuntime } from "../../runtime/account-runtime.js";
import type { AccountTaskContext } from "../../runtime/account-task-queue.js";
import { logEvent } from "../../infrastructure/observability/logger.js";

const API_BASE =
  "https://channels.weixin.qq.com/promote/api/web/transfer/MmFinderPromotionApiSvr";

export interface PromoteOrderSnapshotResult {
  promotionId: string;
  capturedAt: string;
  orderDetail: Record<string, unknown>;
  orderList: Record<string, unknown>;
}

export interface PromoteCaptureResult {
  accountId: string;
  capturedAt: string;
  requestCount: number;
  orderList: Record<string, unknown>;
  orders: PromoteOrderSnapshotResult[];
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

async function request(
  view: WebContentsView,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return view.webContents.executeJavaScript(
    `(async () => {
      const response = await fetch(${JSON.stringify(`${API_BASE}/${method}`)}, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(${JSON.stringify({
          ...body,
          baseReq: { featureFlag: 26 },
        })})
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return body;
    })()`,
    true,
  ) as Promise<Record<string, unknown>>;
}

function promotionIdsFromList(
  response: Record<string, unknown>,
  previouslyTrackedIds: string[],
): string[] {
  const data = response.data as { orderList?: unknown[] } | undefined;
  if (!Array.isArray(data?.orderList)) return [];
  const trackableStatuses = new Set([1, 2, 5, 9, 10, 11]);
  const previouslyTracked = new Set(previouslyTrackedIds);
  return data.orderList
    .filter((item) => {
      const candidate = item as { status?: unknown; promotionId?: unknown };
      return (
        trackableStatuses.has(Number(candidate.status)) ||
        previouslyTracked.has(String(candidate.promotionId ?? ""))
      );
    })
    .map((item) => (item as { promotionId?: unknown }).promotionId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function capturePromoteOrders(
  runtime: AccountRuntime,
  task: AccountTaskContext,
  previouslyTrackedIds: string[] = [],
): Promise<PromoteCaptureResult> {
  const view = await runtime.createExecutor("promote");
  try {
    await view.webContents.loadURL(
      "https://channels.weixin.qq.com/promote/pages/platform/short-video",
    );
    await waitForLoadStopped(view);
    if (!view.webContents.getURL().includes("/promote/pages/platform/")) {
      throw new Error("加热平台登录态不可用");
    }

    const nowSec = Math.floor(Date.now() / 1_000);
    const orderList = await request(view, "searchFeedPromotionOrderList", {
      status: 0,
      createTsMin: String(nowSec - 14 * 24 * 60 * 60),
      createTsMax: String(nowSec),
      sortField: 1,
      sortOrder: 0,
      page: 1,
      pageSize: 300,
    });
    const promotionIds = promotionIdsFromList(orderList, previouslyTrackedIds);
    const orders = await Promise.all(
      promotionIds.map(async (promotionId) => {
        const orderDetail = await request(
          view,
          "getFeedPromotionOrderDetail",
          { promotionId },
        );
        return {
          promotionId,
          capturedAt: new Date().toISOString(),
          orderDetail,
          orderList,
        };
      }),
    );
    const capturedAt = new Date().toISOString();
    logEvent("info", "promote-order-gateway", "capture_completed", {
      taskId: task.taskId,
      accountId: runtime.accountId,
      orderCount: orders.length,
      requestCount: 1 + promotionIds.length,
    });
    return {
      accountId: runtime.accountId,
      capturedAt,
      requestCount: 1 + promotionIds.length,
      orderList,
      orders,
    };
  } finally {
    view.webContents.close();
  }
}
