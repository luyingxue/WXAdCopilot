import type {
  CurvePoint,
  NetCommissionPoint,
  ReferencePoint,
  TrafficCurveAnalysis,
  TrafficCurveVideoMeta,
  TrafficSnapshotPoint,
  StoredTrafficBaseline,
} from "./types.js";
import type {
  CommerceStatus,
  TrafficMetricDistribution,
} from "../../../shared/types.js";

const HALF_HOUR = 0.5;
export const TRAFFIC_LIFECYCLE_HOURS = 14 * 24;
const BASELINE_DAYS = 30;
const MAX_BASELINE_VIDEOS = 30;
const MIN_COMPLETE_BINS = 16;
const READY_BASELINE_MINIMUM = 20;
const P90_MINIMUM = 30;
export const TRAFFIC_BASELINE_ALGORITHM_VERSION =
  "traffic-baseline-v3-14d-censored";
const FEATURE_VERSION = "preinvest-features-v2-14d";

function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function distribution(values: Array<number | null>): TrafficMetricDistribution | null {
  const valid = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (valid.length < 5) return null;
  return {
    p25: quantile(valid, 0.25),
    p50: quantile(valid, 0.5),
    p75: quantile(valid, 0.75),
    sampleCount: valid.length,
  };
}

function commerceBaseline(videos: TrafficCurveVideoMeta[]) {
  const metrics = videos.map((video) => {
    const views = video.viewsCount ?? 0;
    const clicks = video.productClickCount ?? null;
    const completeMoney =
      video.paidGmvYuan !== null &&
      video.paidGmvYuan !== undefined &&
      video.refundGmvYuan !== null &&
      video.refundGmvYuan !== undefined &&
      video.commissionRate !== null &&
      video.commissionRate !== undefined;
    const commission = completeMoney
      ? Math.max(0, video.paidGmvYuan! - video.refundGmvYuan!) *
        video.commissionRate!
      : null;
    return {
      viewClickRate:
        clicks === null || views <= 0 ? null : clicks / views,
      thousandViewNetCommissionYuan:
        commission === null || views <= 0 ? null : (commission / views) * 1_000,
      thousandClickNetCommissionYuan:
        commission === null || !clicks ? null : (commission / clicks) * 1_000,
    };
  });
  return {
    viewClickRate: distribution(metrics.map((metric) => metric.viewClickRate)),
    thousandViewNetCommissionYuan: distribution(
      metrics.map((metric) => metric.thousandViewNetCommissionYuan),
    ),
    thousandClickNetCommissionYuan: distribution(
      metrics.map((metric) => metric.thousandClickNetCommissionYuan),
    ),
  };
}

const EMPTY_COMMERCE_BASELINE = {
  viewClickRate: null,
  thousandViewNetCommissionYuan: null,
  thousandClickNetCommissionYuan: null,
};

function ageHours(point: TrafficSnapshotPoint): number {
  return (
    (new Date(point.capturedAt).getTime() -
      new Date(point.publishTime).getTime()) /
    3_600_000
  );
}

function bucketAge(hours: number): number {
  return Math.round(hours / HALF_HOUR) * HALF_HOUR;
}

function curveForVideo(points: TrafficSnapshotPoint[]): CurvePoint[] {
  const buckets = new Map<number, CurvePoint & { capturedAt: string }>();
  for (const point of points) {
    const rawAge = ageHours(point);
    if (
      rawAge < 0 ||
      rawAge > TRAFFIC_LIFECYCLE_HOURS + HALF_HOUR / 2
    ) continue;
    const bucket = bucketAge(rawAge);
    if (bucket < HALF_HOUR || bucket > TRAFFIC_LIFECYCLE_HOURS) continue;
    const existing = buckets.get(bucket);
    if (!existing || point.capturedAt > existing.capturedAt) {
      buckets.set(bucket, {
        ageHours: bucket,
        viewsCount: point.viewsCount,
        capturedAt: point.capturedAt,
      });
    }
  }
  let maximum = 0;
  return [...buckets.values()]
    .sort((a, b) => a.ageHours - b.ageHours)
    .map((point) => {
      maximum = Math.max(maximum, point.viewsCount);
      return { ageHours: point.ageHours, viewsCount: maximum };
    });
}

function netCommissionCurveForVideo(
  points: TrafficSnapshotPoint[],
  commissionRate: number | null | undefined,
): NetCommissionPoint[] {
  if (commissionRate === null || commissionRate === undefined) return [];
  const buckets = new Map<
    number,
    NetCommissionPoint & { capturedAt: string }
  >();
  for (const point of points) {
    if (point.paidGmvYuan === null || point.refundGmvYuan === null) continue;
    const rawAge = ageHours(point);
    if (
      rawAge < 0 ||
      rawAge > TRAFFIC_LIFECYCLE_HOURS + HALF_HOUR / 2
    ) continue;
    const bucket = bucketAge(rawAge);
    if (bucket < HALF_HOUR || bucket > TRAFFIC_LIFECYCLE_HOURS) continue;
    const existing = buckets.get(bucket);
    if (!existing || point.capturedAt > existing.capturedAt) {
      buckets.set(bucket, {
        ageHours: bucket,
        netCommissionYuan:
          Math.max(0, point.paidGmvYuan - point.refundGmvYuan) *
          commissionRate,
        capturedAt: point.capturedAt,
      });
    }
  }
  return [...buckets.values()]
    .sort((a, b) => a.ageHours - b.ageHours)
    .map(({ ageHours, netCommissionYuan }) => ({
      ageHours,
      netCommissionYuan,
    }));
}

function groupSnapshots(
  snapshots: TrafficSnapshotPoint[],
): Map<string, TrafficSnapshotPoint[]> {
  const grouped = new Map<string, TrafficSnapshotPoint[]>();
  for (const point of snapshots) {
    const values = grouped.get(point.exportId) ?? [];
    values.push(point);
    grouped.set(point.exportId, values);
  }
  return grouped;
}

function referenceCurve(
  curves: CurvePoint[][],
): ReferencePoint[] {
  const result: ReferencePoint[] = [];
  const previous = { p25: 0, p50: 0, p75: 0, p90: 0 };
  for (
    let age = HALF_HOUR;
    age <= TRAFFIC_LIFECYCLE_HOURS;
    age += HALF_HOUR
  ) {
    const values = curves
      .map((curve) => curve.find((point) => point.ageHours === age)?.viewsCount)
      .filter((value): value is number => value !== undefined);
    if (values.length < 5) continue;
    const next = {
      p25: Math.max(previous.p25, quantile(values, 0.25)),
      p50: Math.max(previous.p50, quantile(values, 0.5)),
      p75: Math.max(previous.p75, quantile(values, 0.75)),
      p90: Math.max(previous.p90, quantile(values, 0.9)),
    };
    Object.assign(previous, next);
    result.push({
      ageHours: age,
      sampleCount: values.length,
      p25: Math.round(next.p25),
      p50: Math.round(next.p50),
      p75: Math.round(next.p75),
      p90: values.length >= P90_MINIMUM ? Math.round(next.p90) : null,
    });
  }
  return result;
}

function percentileAt(
  views: number,
  reference: ReferencePoint | undefined,
): number | null {
  if (!reference) return null;
  if (views <= reference.p25) {
    return reference.p25 === 0 ? 25 : (views / reference.p25) * 25;
  }
  if (views <= reference.p50) {
    return 25 + ((views - reference.p25) / Math.max(1, reference.p50 - reference.p25)) * 25;
  }
  if (views <= reference.p75) {
    return 50 + ((views - reference.p50) / Math.max(1, reference.p75 - reference.p50)) * 25;
  }
  if (reference.p90 !== null && views <= reference.p90) {
    return 75 + ((views - reference.p75) / Math.max(1, reference.p90 - reference.p75)) * 15;
  }
  return reference.p90 === null ? 80 : Math.min(99, 90 + (views / Math.max(1, reference.p90) - 1) * 10);
}

function slope(curve: CurvePoint[], hours: number): number | null {
  const end = curve.at(-1);
  if (!end) return null;
  const start = [...curve]
    .reverse()
    .find((point) => end.ageHours - point.ageHours >= hours);
  if (!start) return null;
  return (end.viewsCount - start.viewsCount) / (end.ageHours - start.ageHours);
}

function recentNetCommission(
  curve: NetCommissionPoint[],
  hours: number,
): number | null {
  const end = curve.at(-1);
  if (!end) return null;
  const start = [...curve]
    .reverse()
    .find((point) => end.ageHours - point.ageHours >= hours);
  if (!start) return null;
  return end.netCommissionYuan - start.netCommissionYuan;
}

function referenceSlope(
  reference: ReferencePoint[],
  age: number,
  hours: number,
): number | null {
  const end = [...reference].reverse().find((point) => point.ageHours <= age);
  const start = [...reference]
    .reverse()
    .find((point) => point.ageHours <= age - hours);
  if (!end || !start || end.ageHours === start.ageHours) return null;
  return (end.p50 - start.p50) / (end.ageHours - start.ageHours);
}

function trendOf(curve: CurvePoint[]): TrafficCurveAnalysis["trend"] {
  const recent = slope(curve, 2);
  const priorCurve = curve.slice(0, -4);
  const prior = slope(priorCurve, 2);
  if (recent === null || prior === null) return "insufficient";
  if (prior === 0) return recent > 0 ? "accelerating" : "stable";
  const ratio = recent / prior;
  if (ratio >= 1.2) return "accelerating";
  if (ratio <= 0.8) return "decelerating";
  return "stable";
}

export function analyzeTrafficCurves(input: {
  videos: TrafficCurveVideoMeta[];
  snapshots: TrafficSnapshotPoint[];
  targetExportId?: string;
  now?: string;
  baseline?: StoredTrafficBaseline;
}): TrafficCurveAnalysis {
  const nowMs = new Date(input.now ?? new Date().toISOString()).getTime();
  const grouped = groupSnapshots(input.snapshots);
  const candidates = input.videos
    .map((video) => {
      const points = grouped.get(video.exportId) ?? [];
      const curve = curveForVideo(points);
      const netCommissionCurve = netCommissionCurveForVideo(
        points,
        video.commissionRate,
      );
      return {
        ...video,
        currentAgeHours: Math.max(
          0,
          (nowMs - new Date(video.publishTime).getTime()) / 3_600_000,
        ),
        currentViews: curve.at(-1)?.viewsCount ?? 0,
        currentPercentile: null,
        recentSlopePerHour: null,
        baselineSlopePerHour: null,
        slopeVsBaseline: null,
        recentNetCommissionYuan: recentNetCommission(
          netCommissionCurve,
          2,
        ),
        trend: trendOf(curve),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.publishTime).getTime() - new Date(a.publishTime).getTime(),
    );
  const target =
    candidates.find((video) => video.exportId === input.targetExportId) ??
    candidates.find(
      (video) =>
        video.currentAgeHours <= TRAFFIC_LIFECYCLE_HOURS &&
        video.commerceStatus === "cart",
    ) ??
    candidates.find(
      (video) => video.currentAgeHours <= TRAFFIC_LIFECYCLE_HOURS,
    ) ??
    candidates[0] ??
    null;
  if (!target) {
    return {
      target: null,
      candidates,
      currentCurve: [],
      netCommissionCurve: [],
      referenceCurve: [],
      baselineVideoCount: 0,
      baselineMode: "insufficient",
      baselineGeneratedAt: input.baseline?.generatedAt ?? null,
      baselineWindowDays: BASELINE_DAYS,
      baselineAlgorithmVersion:
        input.baseline?.algorithmVersion ??
        TRAFFIC_BASELINE_ALGORITHM_VERSION,
      baselineFeatureVersion:
        input.baseline?.featureVersion ?? FEATURE_VERSION,
      confidence: "insufficient",
      currentPercentile: null,
      recentSlopePerHour: null,
      trend: "insufficient",
      summary: "最近14天没有可分析视频",
      commerceBaseline:
        input.baseline?.commerceBaseline ?? EMPTY_COMMERCE_BASELINE,
    };
  }

  const computedBaseline =
    input.baseline ??
    buildTrafficBaseline({
      videos: input.videos,
      snapshots: input.snapshots,
      commerceStatus: target.commerceStatus,
      now: input.now,
      excludeExportId: target.exportId,
    });
  const baselineMode = computedBaseline.baselineMode;
  const baseline = computedBaseline.referenceCurve;
  const analyzedCandidates = candidates.map((candidate) => {
    const curve = curveForVideo(grouped.get(candidate.exportId) ?? []);
    const currentPoint = curve.at(-1);
    const referencePoint = currentPoint
      ? [...baseline]
          .reverse()
          .find((point) => point.ageHours <= currentPoint.ageHours)
      : undefined;
    const recent = slope(curve, 2);
    const baselineSlope = currentPoint
      ? referenceSlope(baseline, currentPoint.ageHours, 2)
      : null;
    return {
      ...candidate,
      currentPercentile: currentPoint
        ? percentileAt(currentPoint.viewsCount, referencePoint)
        : null,
      recentSlopePerHour: recent,
      baselineSlopePerHour: baselineSlope,
      slopeVsBaseline:
        recent === null || !baselineSlope ? null : recent / baselineSlope,
      trend: trendOf(curve),
    };
  });
  const analyzedTarget =
    analyzedCandidates.find((candidate) => candidate.exportId === target.exportId) ??
    target;
  const currentCurve = curveForVideo(grouped.get(target.exportId) ?? []);
  const netCommissionCurve = netCommissionCurveForVideo(
    grouped.get(target.exportId) ?? [],
    target.commissionRate,
  );
  const current = currentCurve.at(-1);
  const reference = current
    ? [...baseline]
        .reverse()
        .find((point) => point.ageHours <= current.ageHours)
    : undefined;
  const confidence =
    computedBaseline.baselineVideoCount >= READY_BASELINE_MINIMUM
      ? "ready"
      : computedBaseline.baselineVideoCount >= 5
        ? "trial"
        : "insufficient";
  const percentile = current
    ? percentileAt(current.viewsCount, reference)
    : null;
  const recentSlope = slope(currentCurve, 2);
  const trend = trendOf(currentCurve);
  const summary =
    confidence === "insufficient"
      ? `有效基线样本仅${computedBaseline.baselineVideoCount}条，暂不生成投放结论`
      : `当前约位于历史P${Math.round(percentile ?? 0)}，最近2小时流速${
          recentSlope === null ? "不足以计算" : `${Math.round(recentSlope)}/小时`
        }，趋势${
          trend === "accelerating"
            ? "加速"
            : trend === "decelerating"
              ? "衰减"
              : trend === "stable"
                ? "稳定"
                : "待观察"
        }`;
  return {
    target: analyzedTarget,
    candidates: analyzedCandidates,
    currentCurve,
    netCommissionCurve,
    referenceCurve: baseline,
    baselineVideoCount: computedBaseline.baselineVideoCount,
    baselineMode,
    baselineGeneratedAt: computedBaseline.generatedAt,
    baselineWindowDays: computedBaseline.windowDays,
    baselineAlgorithmVersion: computedBaseline.algorithmVersion,
    baselineFeatureVersion: computedBaseline.featureVersion,
    confidence,
    currentPercentile: percentile,
    recentSlopePerHour: recentSlope,
    trend,
    summary,
    commerceBaseline: computedBaseline.commerceBaseline,
  };
}

export function buildTrafficBaseline(input: {
  videos: TrafficCurveVideoMeta[];
  snapshots: TrafficSnapshotPoint[];
  commerceStatus: CommerceStatus;
  now?: string;
  excludeExportId?: string;
}): StoredTrafficBaseline {
  const generatedAt = input.now ?? new Date().toISOString();
  const nowMs = new Date(generatedAt).getTime();
  const cutoff = nowMs - BASELINE_DAYS * 86_400_000;
  const grouped = groupSnapshots(input.snapshots);
  if (input.commerceStatus === "unknown") {
    return {
      referenceCurve: [],
      baselineVideoCount: 0,
      baselineMode: "insufficient",
      generatedAt,
      windowDays: BASELINE_DAYS,
      algorithmVersion: TRAFFIC_BASELINE_ALGORITHM_VERSION,
      featureVersion: FEATURE_VERSION,
      commerceBaseline: EMPTY_COMMERCE_BASELINE,
    };
  }
  const selected = input.videos
    .filter((video) => {
      const publishedAt = new Date(video.publishTime).getTime();
      return (
        video.exportId !== input.excludeExportId &&
        video.commerceStatus === input.commerceStatus &&
        publishedAt >= cutoff
      );
    })
    .map((video) => ({
      video,
      curve: curveForVideo(grouped.get(video.exportId) ?? []),
    }))
    .filter(({ curve }) => curve.length >= MIN_COMPLETE_BINS)
    .sort(
      (a, b) =>
        new Date(b.video.publishTime).getTime() -
        new Date(a.video.publishTime).getTime(),
    )
    .slice(0, MAX_BASELINE_VIDEOS);
  const commercialVideos = input.videos
    .filter((video) => {
      const publishedAt = new Date(video.publishTime).getTime();
      return (
        video.exportId !== input.excludeExportId &&
        video.commerceStatus === "cart" &&
        publishedAt >= cutoff
      );
    })
    .sort(
      (a, b) =>
        new Date(b.publishTime).getTime() -
        new Date(a.publishTime).getTime(),
    )
    .slice(0, MAX_BASELINE_VIDEOS);
  return {
    referenceCurve: referenceCurve(selected.map(({ curve }) => curve)),
    baselineVideoCount: selected.length,
    baselineMode: selected.length > 0 ? input.commerceStatus : "insufficient",
    generatedAt,
    windowDays: BASELINE_DAYS,
    algorithmVersion: TRAFFIC_BASELINE_ALGORITHM_VERSION,
    featureVersion: FEATURE_VERSION,
    commerceBaseline: commerceBaseline(commercialVideos),
  };
}
