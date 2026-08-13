export type Platform = "commerce" | "compass" | "promote";
export type LoginStatus = "online" | "offline" | "checking" | "unknown";
export type AccountStatus =
  | "online"
  | "partial"
  | "offline"
  | "checking"
  | "unknown";
export type PreinvestRange = "fortnight" | "month";
export type CommerceStatus = "unknown" | "cart" | "no_cart";

export interface Account {
  id: string;
  name: string;
  groupName: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  status: AccountStatus;
  platforms: Record<
    Platform,
    {
      status: LoginStatus;
      checkedAt: string | null;
      reason: string | null;
    }
  >;
}

export interface AccountInput {
  name: string;
  groupName?: string;
  note?: string;
}

export interface BrowserState {
  accountId: string | null;
  platform: Platform | null;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export interface ViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoSummary {
  exportId: string;
  feedId: string | null;
  title: string;
  publishTime: string;
  durationSec: number;
  viewsCount: number;
  likesCount: number;
  commentsCount: number;
  forwardsCount: number;
  favoritesCount: number;
  followsCount: number;
  completionRate: number | null;
  averageWatchTimeSec: number | null;
  totalWatchTimeSec: number | null;
  fullWatchCount: number | null;
  fastFlipRate: number | null;
  yesterdayViewsCount: number | null;
  retention3Sec: number | null;
  retention5Sec: number | null;
  retention30Sec: number | null;
  lostRatePointCount: number | null;
  maxLostRateSec: number | null;
  maxLostPointRetention: number | null;
  trafficSources: Record<string, number> | null;
  fanTypeSources: Record<string, number> | null;
  productId: string | null;
  productName: string | null;
  productExposeCount: number | null;
  gpmPerThousandViews: number | null;
  commerceProductId: string | null;
  productClickCount: number | null;
  paidGmvYuan: number | null;
  paidOrderCount: number | null;
  refundGmvYuan: number | null;
  refundOrderCount: number | null;
  commerceMatched: boolean;
  commerceStatus: CommerceStatus;
  commissionRate: number | null;
  commissionDataStatus?: "available" | "product_not_found" | "rate_unavailable";
  listRawJson?: string;
  detailRawJson?: string | null;
}

export interface ProductSummary {
  productId: string;
  outProductId: string | null;
  title: string;
  shortTitle: string;
  shopName: string;
  commissionRate: number | null;
  promotionStatus: "active" | "ended" | "unknown";
  rawJson: string;
}

export interface ProductBusinessMetrics {
  cartVideoCount: number;
  transactingVideoCount: number;
  totalViewsCount: number;
  totalProductClickCount: number;
  totalPaidOrderCount: number;
  totalPaidGmvYuan: number;
  totalRefundGmvYuan: number;
  netGmvYuan: number;
  estimatedNetCommissionYuan: number | null;
  netCommissionPerThousandViews: number | null;
  viewClickRate: number | null;
  clickConversionRate: number | null;
  videoConversionRate: number | null;
  latestVideoPublishTime: string | null;
}

export interface ProductSyncResult {
  accountId: string;
  syncedAt: string;
  products: ProductSummary[];
}

export interface ProductMaintenanceState {
  accountId: string;
  products: Array<ProductSummary & ProductBusinessMetrics & { syncedAt: string }>;
  lastSyncedAt: string | null;
  businessLastSyncedAt: string | null;
}

export interface CommerceSyncResult {
  accountId: string;
  syncedAt: string;
  matchedCount: number;
  platformTotal: number;
  videos: Array<{
    exportId: string;
    gpmPerThousandViews: number | null;
    commerceProductId: string | null;
    productClickCount: number | null;
    paidGmvYuan: number | null;
    paidOrderCount: number | null;
    refundGmvYuan: number | null;
    refundOrderCount: number | null;
  }>;
}

export interface VideoSyncResult {
  accountId: string;
  syncedCount: number;
  platformTotal: number;
  syncedAt: string;
  videos: VideoSummary[];
}

export interface VideoSyncState {
  accountId: string;
  syncedCount: number;
  platformTotal: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  videos: VideoSummary[];
  range?: PreinvestRange;
  requestCount?: number;
  detailRequestCount?: number;
  skippedNoCartCount?: number;
}

export interface PreinvestSyncResult extends VideoSyncResult {
  range: PreinvestRange;
  requestCount: number;
  detailRequestCount: number;
  skippedNoCartCount: number;
}

export interface CartVideoAnalysisState extends VideoSyncState {
  scannedCount: number;
}

export interface CartVideoAnalysisRefreshResult extends VideoSyncResult {
  scannedCount: number;
  requestCount: number;
  detailRequestCount: number;
  skippedNoCartCount: number;
}

export interface TrafficCurvePoint {
  ageHours: number;
  viewsCount: number;
}

export interface NetCommissionCurvePoint {
  ageHours: number;
  netCommissionYuan: number;
}

export interface TrafficReferencePoint {
  ageHours: number;
  sampleCount: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number | null;
}

export interface TrafficCurveCandidate {
  exportId: string;
  title: string;
  publishTime: string;
  commerceStatus: CommerceStatus;
  currentAgeHours: number;
  currentViews: number;
  currentPercentile: number | null;
  recentSlopePerHour: number | null;
  baselineSlopePerHour: number | null;
  slopeVsBaseline: number | null;
  recentNetCommissionYuan: number | null;
  trend: "accelerating" | "stable" | "decelerating" | "insufficient";
}

export interface TrafficCurveAnalysis {
  target: TrafficCurveCandidate | null;
  candidates: TrafficCurveCandidate[];
  currentCurve: TrafficCurvePoint[];
  netCommissionCurve: NetCommissionCurvePoint[];
  referenceCurve: TrafficReferencePoint[];
  baselineVideoCount: number;
  baselineMode: "cart" | "no_cart" | "mixed" | "insufficient";
  baselineGeneratedAt: string | null;
  baselineWindowDays: number;
  baselineAlgorithmVersion: string;
  baselineFeatureVersion: string;
  confidence: "ready" | "trial" | "insufficient";
  currentPercentile: number | null;
  recentSlopePerHour: number | null;
  trend: "accelerating" | "stable" | "decelerating" | "insufficient";
  summary: string;
  commerceBaseline: {
    viewClickRate: TrafficMetricDistribution | null;
    thousandViewNetCommissionYuan: TrafficMetricDistribution | null;
    thousandClickNetCommissionYuan: TrafficMetricDistribution | null;
  };
}

export interface TrafficMetricDistribution {
  p25: number;
  p50: number;
  p75: number;
  sampleCount: number;
}

export interface DuringOrderCandidate {
  promotionId: string;
  orderName: string;
  videoTitle: string;
  status: number;
  statusLabel: string;
  capturedAt: string;
  productName: string | null;
  spendYuan: number | null;
  budgetYuan: number | null;
  budgetRate: number | null;
  productClickPv: number | null;
  productPayCount: number | null;
  netGmvYuan: number | null;
  estimatedNetCommissionYuan: number | null;
  netProfitYuan: number | null;
  commissionRoi: number | null;
  costPerThousandExposureYuan: number | null;
}

export interface DuringOrderCurrentSnapshot {
  accountId: string;
  promotionId: string;
  capturedAt: string;
  orderName: string;
  status: number;
  statusLabel: string;
  exportStatus: number | null;
  video: {
    exportId: string | null;
    globalExportId: string | null;
    title: string;
    coverUrl: string | null;
    publishedAt: string | null;
    hasShoppingCart: boolean | null;
  };
  product: {
    name: string | null;
    cpsProductId: string | null;
    shopProductId: string | null;
  };
  configuration: {
    target: number | null;
    targetLabel: string;
    durationSec: number | null;
    promotionType: number | null;
    promotionTypeLabel: string;
    pricingMethod: number | null;
    pricingMethodLabel: string;
    billingMethod: number | null;
    billingMethodLabel: string;
    createAt: string | null;
    estimatedStartAt: string | null;
    actualStartAt: string | null;
    estimatedEndAt: string | null;
    actualEndAt: string | null;
  };
  funds: {
    budgetWecoin: number | null;
    spentWecoin: number | null;
    paidWecoin: number | null;
    refundedWecoin: number | null;
  };
  effects: {
    exposureCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
    favoriteCount: number | null;
    forwardCount: number | null;
    videoFollowCount: number | null;
    bizFollowCount: number | null;
    productClickPv: number | null;
    productClickUv: number | null;
    productOrderCount: number | null;
    productPlaceorderCount: number | null;
    productPlaceorderGmvYuan: number | null;
    productPayCount: number | null;
    productPayGmvYuan: number | null;
    productPayRoi: number | null;
    productNetPayCount: number | null;
    productNetPayGmvYuan: number | null;
    productNetPayRoi: number | null;
  };
  calculated: {
    wecoinPerYuan: number;
    spendYuan: number | null;
    netGmvYuan: number | null;
    commissionRate: number | null;
    estimatedNetCommissionYuan: number | null;
    netProfitYuan: number | null;
    commissionRoi: number | null;
    costPerThousandExposureYuan: number | null;
    costPerProductClickYuan: number | null;
  };
}

export interface DuringOrderTimelinePoint {
  capturedAt: string;
  status: number;
  statusLabel: string;
  intervalSeconds: number | null;
  cumulative: {
    spendYuan: number | null;
    exposureCount: number | null;
    productClickPv: number | null;
    productPayCount: number | null;
    productNetPayCount: number | null;
    netGmvYuan: number | null;
    estimatedNetCommissionYuan: number | null;
    netProfitYuan: number | null;
  };
  delta: {
    spendYuan: number | null;
    exposureCount: number | null;
    productClickPv: number | null;
    productPayCount: number | null;
    productNetPayCount: number | null;
    netGmvYuan: number | null;
  };
  quality: "complete" | "partial" | "counter_regression";
}

export interface DuringInvestmentState {
  accountId: string;
  lastCapturedAt: string | null;
  lastError: string | null;
  candidates: DuringOrderCandidate[];
  current: DuringOrderCurrentSnapshot | null;
  timeline: DuringOrderTimelinePoint[];
}

export interface SnapshotMachineStatus {
  state: "refreshing" | "scheduled" | "waiting" | "error" | "disabled";
  lastRefreshedAt: string | null;
  nextRefreshAt: string | null;
  intervalMinutes: number;
  message: string;
}

export interface SnapshotMachinesState {
  preinvest: SnapshotMachineStatus;
  during: SnapshotMachineStatus;
}
