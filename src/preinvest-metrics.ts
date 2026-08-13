import type {
  TrafficCurveCandidate,
  VideoSummary,
} from "../electron/shared/types";

export interface PreinvestCommerceMetrics {
  netGmvYuan: number | null;
  estimatedNetCommissionYuan: number | null;
  viewClickRate: number | null;
  thousandViewNetCommissionYuan: number | null;
  thousandClickNetCommissionYuan: number | null;
  sampleConfidence: "ready" | "low" | "insufficient";
}

export interface PreinvestDecision {
  state: "test" | "observe" | "reject" | "insufficient";
  label: string;
  reason: string;
}

export function calculatePreinvestCommerce(
  video: VideoSummary,
): PreinvestCommerceMetrics {
  const hasCompleteMoney =
    video.paidGmvYuan !== null &&
    video.refundGmvYuan !== null &&
    video.commissionRate !== null;
  const netGmvYuan = hasCompleteMoney
    ? Math.max(0, video.paidGmvYuan! - video.refundGmvYuan!)
    : null;
  const commission =
    netGmvYuan === null || video.commissionRate === null
      ? null
      : netGmvYuan * video.commissionRate;
  const clicks = video.productClickCount;
  return {
    netGmvYuan,
    estimatedNetCommissionYuan: commission,
    viewClickRate:
      clicks === null || video.viewsCount <= 0 ? null : clicks / video.viewsCount,
    thousandViewNetCommissionYuan:
      commission === null || video.viewsCount <= 0
        ? null
        : (commission / video.viewsCount) * 1_000,
    thousandClickNetCommissionYuan:
      commission === null || !clicks ? null : (commission / clicks) * 1_000,
    sampleConfidence:
      clicks === null || clicks === 0
        ? "insufficient"
        : clicks >= 30
          ? "ready"
          : "low",
  };
}

export function decidePreinvestCandidate(
  video: VideoSummary,
  curve: TrafficCurveCandidate | undefined,
  metrics: PreinvestCommerceMetrics,
): PreinvestDecision {
  if (video.commerceStatus !== "cart") {
    return { state: "reject", label: "不参与判断", reason: "未挂车" };
  }
  if (!curve || curve.currentPercentile === null) {
    return {
      state: "insufficient",
      label: "数据不足",
      reason: "生命周期曲线尚未形成",
    };
  }
  if (curve.currentAgeHours < 12) {
    return {
      state: "observe",
      label: "继续观察",
      reason: "自然流尚未满12小时",
    };
  }
  if (
    metrics.estimatedNetCommissionYuan === null ||
    metrics.sampleConfidence === "insufficient"
  ) {
    return {
      state: "insufficient",
      label: "数据不足",
      reason:
        metrics.estimatedNetCommissionYuan === null
          ? "佣金或退款数据未完整"
          : "尚无商品点击样本",
    };
  }
  if (
    curve.currentPercentile >= 70 &&
    (curve.slopeVsBaseline ?? 0) >= 1 &&
    curve.trend !== "decelerating" &&
    metrics.sampleConfidence === "ready" &&
    (metrics.thousandViewNetCommissionYuan ?? 0) > 0
  ) {
    return {
      state: "test",
      label: "建议测试",
      reason: `流量P${Math.round(curve.currentPercentile)}且商业效率有效`,
    };
  }
  if (
    curve.currentPercentile < 50 &&
    curve.trend === "decelerating"
  ) {
    return {
      state: "reject",
      label: "不建议",
      reason: "流量低于中位且正在衰减",
    };
  }
  return {
    state: "observe",
    label: "继续观察",
    reason:
      metrics.sampleConfidence === "low"
        ? "点击样本较少"
        : "尚未同时满足流量与商业条件",
  };
}
