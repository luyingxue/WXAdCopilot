import type {
  CommerceStatus,
  TrafficCurveAnalysis,
  TrafficCurvePoint,
  NetCommissionCurvePoint,
  TrafficMetricDistribution,
  TrafficReferencePoint,
} from "../../../shared/types.js";

export type CurvePoint = TrafficCurvePoint;
export type NetCommissionPoint = NetCommissionCurvePoint;
export type ReferencePoint = TrafficReferencePoint;
export type { TrafficCurveAnalysis };

export interface TrafficSnapshotPoint {
  exportId: string;
  publishTime: string;
  capturedAt: string;
  viewsCount: number;
  paidGmvYuan: number | null;
  refundGmvYuan: number | null;
  commerceStatus: CommerceStatus;
}

export interface TrafficCurveVideoMeta {
  exportId: string;
  title: string;
  publishTime: string;
  commerceStatus: CommerceStatus;
  viewsCount?: number;
  productClickCount?: number | null;
  paidGmvYuan?: number | null;
  refundGmvYuan?: number | null;
  commissionRate?: number | null;
}

export interface StoredTrafficBaseline {
  referenceCurve: ReferencePoint[];
  baselineVideoCount: number;
  baselineMode: "cart" | "no_cart" | "insufficient";
  generatedAt: string;
  windowDays: number;
  algorithmVersion: string;
  featureVersion: string;
  commerceBaseline: {
    viewClickRate: TrafficMetricDistribution | null;
    thousandViewNetCommissionYuan: TrafficMetricDistribution | null;
    thousandClickNetCommissionYuan: TrafficMetricDistribution | null;
  };
}
