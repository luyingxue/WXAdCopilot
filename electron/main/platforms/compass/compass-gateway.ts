import { WebContentsView } from "electron";
import type {
  PreinvestRange,
  PreinvestSyncResult,
  CartVideoAnalysisRefreshResult,
  CommerceStatus,
  VideoSummary,
} from "../../../shared/types.js";
import type { AccountRuntime } from "../../runtime/account-runtime.js";
import type { AccountTaskContext } from "../../runtime/account-task-queue.js";
import { logEvent } from "../../infrastructure/observability/logger.js";

const COMPASS_FEED_LIST_URL = "https://store.weixin.qq.com/compass/feed/list";
const LIST_ENDPOINT =
  "/shop-faas/mmecnodecompasscommon/common/liner_query/1/feed-feedlist-shopfinder-realtime";
const DETAIL_ENDPOINT =
  "/shop-faas/mmecnodecompasscommon/feed/getFeedDetailInfo";
const PAGE_SIZE = 100;
const NAVIGATION_RETRY_LIMIT = 3;
const DETAIL_CONCURRENCY = 8;
const PLATFORM_LAUNCH_START_MS = new Date("2020-01-01T00:00:00+08:00").getTime();

interface CompassListItem {
  export_id?: string;
  feedid_?: string;
  create_time?: number;
  videoInfo?: {
    description?: string;
  };
  read?: string | number;
  average_watch_time?: string | number;
  full_watch_radio?: string | number;
  fav?: string | number;
  like?: string | number;
  comment?: string | number;
  follow?: string | number;
  forward?: string | number;
}

interface CompassListResponse {
  code?: number;
  msg?: string;
  total?: number;
  list?: CompassListItem[];
}

interface CompassDetailResponse {
  code?: number;
  msg?: string;
  info?: {
    exportId?: string;
    createTime?: number;
    description?: string;
  };
  feed?: {
    totalDetailData?: {
      read?: string | number;
      like?: string | number;
      fav?: string | number;
      follow?: string | number;
      comment?: string | number;
      forward?: string | number;
      watchTime?: string | number;
      fullWatch?: string | number;
    };
    tabDetailData?: Array<{
      tabName?: string;
      detailData?: { read?: string | number };
    }>;
  };
  product?: {
    productId?: string;
    title?: string;
  };
  pay?: {
    accProductExposeCnt?: string | number;
    accProductClickCnt?: string | number;
    accPayGmv?: string | number;
    accPayCnt?: string | number;
    accRefundAmount?: string | number;
    accRefundCnt?: string | number;
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return numberOrNull(value) ?? 0;
}

function dateRange(range: PreinvestRange): {
  startMs: number;
  endMs: number;
} {
  const now = new Date();
  // Compass rejects a range whose end is in the future (code 882). The
  // construction-stage snapshot window intentionally covers fourteen calendar
  // days so later analysis rules can be replayed against denser history.
  const endMs = now.getTime();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "fortnight") {
    start.setDate(start.getDate() - 13);
  } else {
    start.setDate(1);
  }
  return { startMs: start.getTime(), endMs };
}

function allHistoryRanges(endMs: number): Array<{
  startMs: number;
  endMs: number;
}> {
  const ranges: Array<{ startMs: number; endMs: number }> = [];
  const cursor = new Date(PLATFORM_LAUNCH_START_MS);
  while (cursor.getTime() <= endMs) {
    const startMs = cursor.getTime();
    cursor.setMonth(cursor.getMonth() + 1);
    ranges.push({
      startMs,
      endMs: Math.min(endMs, cursor.getTime() - 1),
    });
  }
  return ranges.reverse();
}

function isNavigationContextError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Execution context was destroyed") ||
    error.message.includes("Cannot find context with specified id") ||
    error.message.includes("Target page, context or browser has been closed")
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

async function waitForCompassStable(view: WebContentsView): Promise<void> {
  for (let attempt = 0; attempt < NAVIGATION_RETRY_LIMIT; attempt += 1) {
    await waitForLoadStopped(view);
    const firstUrl = view.webContents.getURL();
    if (/\/(?:compass|talent)\/login/.test(firstUrl)) {
      throw new Error("电商罗盘登录已失效");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    if (view.webContents.getURL() === firstUrl) return;
  }
  throw new Error("电商罗盘页面持续跳转，无法建立稳定采集上下文");
}

async function getRouterModuleUrl(view: WebContentsView): Promise<string> {
  for (let attempt = 1; attempt <= NAVIGATION_RETRY_LIMIT; attempt += 1) {
    try {
      return await view.webContents.executeJavaScript(`
        (() => {
          const resources = performance
            .getEntriesByType("resource")
            .map((entry) => entry.name);
          const url = resources.find((item) =>
            /\\/assets\\/router\\.[^/]+\\.js(?:\\?|$)/.test(item)
          );
          if (!url) throw new Error("未找到罗盘请求客户端");
          return url;
        })()
      `, true) as string;
    } catch (error) {
      if (!isNavigationContextError(error) || attempt === NAVIGATION_RETRY_LIMIT) {
        throw error;
      }
      await waitForCompassStable(view);
    }
  }
  throw new Error("未找到罗盘请求客户端");
}

async function compassRequest<T>(
  view: WebContentsView,
  routerModuleUrl: string,
  url: string,
  data?: Record<string, unknown>,
  onNavigationRetry?: (attempt: number) => void,
): Promise<T> {
  if (url !== LIST_ENDPOINT && url !== DETAIL_ENDPOINT) {
    throw new Error(`投前采集拒绝未授权接口：${url}`);
  }
  for (let attempt = 1; attempt <= NAVIGATION_RETRY_LIMIT; attempt += 1) {
    try {
      const input = JSON.stringify({
        moduleUrl: routerModuleUrl,
        requestUrl: url,
        requestData: data,
      });
      return await view.webContents.executeJavaScript(`
        (async () => {
          const { moduleUrl, requestUrl, requestData } = ${input};
          const module = await import(moduleUrl);
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
            if (typeof value.post === "function") candidates.push(value);
            for (const child of Object.values(value)) visit(child, depth + 1);
          };
          visit(module);
          const client = candidates.find((candidate) =>
            typeof candidate.post === "function"
          );
          if (!client) {
            throw new Error(
              "罗盘请求客户端模块已变化：未找到 post 方法（exports=" +
                Object.keys(module).join(",") +
                "）"
            );
          }
          return client.post({
            url: requestUrl,
            ...(requestData ? { data: requestData } : {}),
          });
        })()
      `, true) as T;
    } catch (error) {
      if (!isNavigationContextError(error) || attempt === NAVIGATION_RETRY_LIMIT) {
        throw error;
      }
      onNavigationRetry?.(attempt);
      await waitForCompassStable(view);
    }
  }
  throw new Error(`罗盘接口请求失败：${url}`);
}

async function waitForRouterModule(view: WebContentsView): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const found = await view.webContents.executeJavaScript(`
        performance
          .getEntriesByType("resource")
          .some((entry) => /\\/assets\\/router\\.[^/]+\\.js/.test(entry.name))
      `, true) as boolean;
      if (found) return;
    } catch (error) {
      if (!isNavigationContextError(error)) throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("等待罗盘请求客户端超时");
}

async function readSelectedAccount(view: WebContentsView): Promise<{
  accountId: string;
  accountType: string;
}> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const accountId = await view.webContents.executeJavaScript(`
      (() => {
        for (let index = 0; index < sessionStorage.length; index += 1) {
          const key = sessionStorage.key(index);
          if (!key?.startsWith("FeedHomeListFilter")) continue;
          try {
            const value = JSON.parse(sessionStorage.getItem(key) || "{}");
            if (typeof value.selectedAccount === "string") {
              return value.selectedAccount;
            }
          } catch {}
        }
        return "";
      })()
    `, true) as string;
    if (accountId) {
      const accountType = accountId.split("@").at(-1) || "";
      if (!accountType) throw new Error("罗盘当前账号类型无效");
      return { accountId, accountType };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("未读取到罗盘当前带货账号，请先打开一次短视频明细页");
}

function listItemToVideo(item: CompassListItem): VideoSummary {
  return {
    exportId: item.export_id!,
    feedId: item.feedid_ ?? null,
    title: item.videoInfo?.description ?? "",
    publishTime: new Date(numberOrZero(item.create_time) * 1000).toISOString(),
    durationSec: 0,
    viewsCount: numberOrZero(item.read),
    likesCount: numberOrZero(item.like),
    commentsCount: numberOrZero(item.comment),
    forwardsCount: numberOrZero(item.forward),
    favoritesCount: numberOrZero(item.fav),
    followsCount: numberOrZero(item.follow),
    completionRate: numberOrNull(item.full_watch_radio),
    averageWatchTimeSec: numberOrNull(item.average_watch_time),
    totalWatchTimeSec: null,
    fullWatchCount: null,
    fastFlipRate: null,
    yesterdayViewsCount: null,
    retention3Sec: null,
    retention5Sec: null,
    retention30Sec: null,
    lostRatePointCount: null,
    maxLostRateSec: null,
    maxLostPointRetention: null,
    trafficSources: null,
    fanTypeSources: null,
    productId: null,
    productName: null,
    productExposeCount: null,
    gpmPerThousandViews: null,
    commerceProductId: null,
    productClickCount: null,
    paidGmvYuan: null,
    paidOrderCount: null,
    refundGmvYuan: null,
    refundOrderCount: null,
    commerceMatched: false,
    commerceStatus: "unknown",
    commissionRate: null,
    listRawJson: JSON.stringify(item),
    detailRawJson: null,
  };
}

function applyDetail(
  video: VideoSummary,
  detail: CompassDetailResponse,
): void {
  video.detailRawJson = JSON.stringify(detail);
  const total = detail.feed?.totalDetailData;
  if (total) {
    video.viewsCount = numberOrZero(total.read);
    video.likesCount = numberOrZero(total.like);
    video.favoritesCount = numberOrZero(total.fav);
    video.commentsCount = numberOrZero(total.comment);
    video.forwardsCount = numberOrZero(total.forward);
    video.followsCount = numberOrZero(total.follow);
    const watchTime = numberOrNull(total.watchTime);
    const fullWatch = numberOrNull(total.fullWatch);
    video.totalWatchTimeSec = watchTime;
    video.fullWatchCount = fullWatch;
    video.averageWatchTimeSec =
      watchTime === null || video.viewsCount === 0
        ? null
        : watchTime / video.viewsCount;
    video.completionRate =
      fullWatch === null || video.viewsCount === 0
        ? null
        : fullWatch / video.viewsCount;
  }
  video.trafficSources =
    detail.feed?.tabDetailData?.reduce<Record<string, number>>((result, row) => {
      if (row.tabName) result[row.tabName] = numberOrZero(row.detailData?.read);
      return result;
    }, {}) ?? null;

  const productId = detail.product?.productId?.trim() || null;
  video.commerceStatus = productId ? "cart" : "no_cart";
  video.commerceMatched = true;
  video.productId = productId;
  video.commerceProductId = productId;
  video.productName = detail.product?.title?.trim() || null;

  if (!productId) return;
  const exposure = numberOrZero(detail.pay?.accProductExposeCnt);
  const clicks = numberOrZero(detail.pay?.accProductClickCnt);
  const paidGmvYuan = numberOrZero(detail.pay?.accPayGmv) / 100;
  video.productExposeCount = exposure;
  video.productClickCount = clicks;
  video.paidGmvYuan = paidGmvYuan;
  video.paidOrderCount = numberOrZero(detail.pay?.accPayCnt);
  video.refundGmvYuan = numberOrZero(detail.pay?.accRefundAmount) / 100;
  video.refundOrderCount = numberOrZero(detail.pay?.accRefundCnt);
  video.gpmPerThousandViews =
    video.viewsCount === 0 ? null : (paidGmvYuan / video.viewsCount) * 1000;
}

export async function collectCompassSnapshots(
  runtime: AccountRuntime,
  range: PreinvestRange,
  task: AccountTaskContext,
  options?: {
    allHistory?: boolean;
    knownCommerceStatuses?: Record<string, CommerceStatus>;
    knownCartVideos?: VideoSummary[];
    discoveryStartAt?: string | null;
  },
): Promise<PreinvestSyncResult> {
  const accountId = runtime.accountId;
  const scope = "compass-gateway";
  const logContext = { taskId: task.taskId, accountId };
  const collectorView = await runtime.createExecutor("compass");
  try {
    await collectorView.webContents.loadURL(COMPASS_FEED_LIST_URL);
    await waitForCompassStable(collectorView);
    await waitForRouterModule(collectorView);
    const routerModuleUrl = await getRouterModuleUrl(collectorView);
    const selectedAccount = await readSelectedAccount(collectorView);
    logEvent("info", scope, "account_context_ready", {
      ...logContext,
      accountType: selectedAccount.accountType,
    });
    let requestCount = 0;

    const boundedRange = dateRange(range);
    const discoveryStartMs = options?.discoveryStartAt
      ? Math.max(
          PLATFORM_LAUNCH_START_MS,
          new Date(options.discoveryStartAt).getTime() - 24 * 60 * 60 * 1_000,
        )
      : null;
    const startMs = options?.allHistory
      ? PLATFORM_LAUNCH_START_MS
      : (discoveryStartMs ?? boundedRange.startMs);
    const endMs = boundedRange.endMs;
    logEvent("info", scope, "snapshot_range_resolved", {
      ...logContext,
      range,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
    });
    const items: CompassListItem[] = [];
    let platformTotal = 0;
    const queryRanges = options?.allHistory
      ? allHistoryRanges(endMs)
      : [{ startMs, endMs }];
    let consecutiveEmptyRanges = 0;
    rangeLoop: for (const queryRange of queryRanges) {
      let offset = 0;
      let rangeTotal = 0;
      do {
        const requestData = {
          time_query: {
            dateFormat: 2,
            dateType: 0,
            startMs: queryRange.startMs,
            endMs: queryRange.endMs,
          },
          accountType: selectedAccount.accountType,
          accountId: selectedAccount.accountId,
          limit: PAGE_SIZE,
          offset,
        };
        const response = await compassRequest<CompassListResponse>(
          collectorView,
          routerModuleUrl,
          LIST_ENDPOINT,
          requestData,
          (attempt) => {
            logEvent("warn", scope, "navigation_retry", {
              ...logContext,
              endpoint: LIST_ENDPOINT,
              attempt,
            });
          },
        );
        requestCount += 1;
        logEvent("info", scope, "direct_api_requested", {
          ...logContext,
          endpoint: LIST_ENDPOINT,
          rangeStart: new Date(queryRange.startMs).toISOString(),
          rangeEnd: new Date(queryRange.endMs).toISOString(),
          offset,
          limit: PAGE_SIZE,
        });
        if (response.code !== 0) {
          if (
            options?.allHistory &&
            response.code === 882 &&
            consecutiveEmptyRanges >= 3
          ) {
            logEvent("info", scope, "history_boundary_reached", {
              ...logContext,
              rangeStart: new Date(queryRange.startMs).toISOString(),
              consecutiveEmptyRanges,
            });
            break rangeLoop;
          }
          logEvent("error", scope, "list_rejected", {
            ...logContext,
            endpoint: LIST_ENDPOINT,
            code: response.code,
            message: response.msg,
          });
          throw new Error(
            `罗盘 List 请求失败（${response.code ?? "无状态码"}）：${response.msg || "无错误说明"}`,
          );
        }
        rangeTotal = Number(response.total ?? 0);
        const pageItems = (response.list ?? []).filter(
          (item): item is CompassListItem & { export_id: string } =>
            Boolean(item.export_id),
        );
        items.push(...pageItems);
        logEvent("info", scope, "list_page_received", {
          ...logContext,
          offset,
          responseTotal: rangeTotal,
          responseItems: response.list?.length ?? 0,
          validItems: pageItems.length,
        });
        offset += PAGE_SIZE;
        if (pageItems.length < PAGE_SIZE || offset >= rangeTotal) break;
      } while (true);
      platformTotal += rangeTotal;
      consecutiveEmptyRanges =
        rangeTotal === 0 ? consecutiveEmptyRanges + 1 : 0;
    }

    const uniqueItems = Array.from(
      new Map(items.map((item) => [item.export_id!, item])).values(),
    );
    const videosById = new Map(
      (options?.knownCartVideos ?? []).map((video) => [
        video.exportId,
        { ...video },
      ]),
    );
    for (const item of uniqueItems) {
      const listed = listItemToVideo(item);
      const previous = videosById.get(listed.exportId);
      videosById.set(
        listed.exportId,
        previous
          ? {
              ...previous,
              feedId: listed.feedId ?? previous.feedId,
              title: listed.title || previous.title,
              publishTime: listed.publishTime,
              viewsCount: listed.viewsCount,
              likesCount: listed.likesCount,
              commentsCount: listed.commentsCount,
              forwardsCount: listed.forwardsCount,
              favoritesCount: listed.favoritesCount,
              followsCount: listed.followsCount,
              completionRate:
                listed.completionRate ?? previous.completionRate,
              averageWatchTimeSec:
                listed.averageWatchTimeSec ?? previous.averageWatchTimeSec,
              listRawJson: listed.listRawJson,
            }
          : listed,
      );
    }
    const videos = [...videosById.values()];
    let detailRequestCount = 0;
    let skippedNoCartCount = 0;
    const detailTargets: VideoSummary[] = [];
    for (const video of videos) {
      if (options?.knownCommerceStatuses?.[video.exportId] === "no_cart") {
        video.commerceStatus = "no_cart";
        video.commerceMatched = true;
        skippedNoCartCount += 1;
        continue;
      }
      detailTargets.push(video);
    }
    for (let index = 0; index < detailTargets.length; index += DETAIL_CONCURRENCY) {
      const batch = detailTargets.slice(index, index + DETAIL_CONCURRENCY);
      const responses = await Promise.all(
        batch.map(async (video) => ({
          video,
          detail: await compassRequest<CompassDetailResponse>(
            collectorView,
            routerModuleUrl,
            DETAIL_ENDPOINT,
            { id: video.exportId },
            (attempt) => {
              logEvent("warn", scope, "navigation_retry", {
                ...logContext,
                endpoint: DETAIL_ENDPOINT,
                exportId: video.exportId,
                attempt,
              });
            },
          ),
        })),
      );
      requestCount += responses.length;
      detailRequestCount += responses.length;
      for (const { video, detail } of responses) {
        if (detail.code !== 0) {
          logEvent("error", scope, "detail_rejected", {
            ...logContext,
            endpoint: DETAIL_ENDPOINT,
            exportId: video.exportId,
            code: detail.code,
            message: detail.msg,
          });
          throw new Error(
            `视频详情请求失败（${detail.code ?? "无状态码"}）：${detail.msg || video.exportId}`,
          );
        }
        applyDetail(video, detail);
      }
      logEvent("info", scope, "detail_batch_synced", {
        ...logContext,
        endpoint: DETAIL_ENDPOINT,
        batchSize: responses.length,
        detailRequestCount,
      });
    }

    const syncedAt = new Date().toISOString();
    logEvent("info", scope, "sync_completed", {
      ...logContext,
      range,
      videos: videos.length,
      requestCount,
      listRequestCount: requestCount - detailRequestCount,
      detailRequestCount,
      skippedNoCartCount,
    });
    return {
      accountId,
      range,
      syncedAt,
      syncedCount: videos.length,
      platformTotal,
      requestCount,
      detailRequestCount,
      skippedNoCartCount,
      videos,
    };
  } finally {
    collectorView.webContents.close();
  }
}

export async function collectAllCartVideoAnalysis(
  runtime: AccountRuntime,
  task: AccountTaskContext,
  knownCommerceStatuses: Record<string, CommerceStatus>,
  knownCartVideos: VideoSummary[],
  lastSyncedAt: string | null,
): Promise<CartVideoAnalysisRefreshResult> {
  const hasLocalIndex = Object.keys(knownCommerceStatuses).length > 0;
  const result = await collectCompassSnapshots(runtime, "month", task, {
    allHistory: !hasLocalIndex,
    knownCommerceStatuses,
    knownCartVideos,
    discoveryStartAt: hasLocalIndex ? lastSyncedAt : null,
  });
  const scannedCount = new Set([
    ...Object.keys(knownCommerceStatuses),
    ...result.videos.map((video) => video.exportId),
  ]).size;
  return {
    accountId: result.accountId,
    syncedAt: result.syncedAt,
    syncedCount: result.videos.filter(
      (video) => video.commerceStatus === "cart",
    ).length,
    scannedCount,
    platformTotal: scannedCount,
    requestCount: result.requestCount,
    detailRequestCount: result.detailRequestCount,
    skippedNoCartCount: result.skippedNoCartCount,
    videos: result.videos,
  };
}
