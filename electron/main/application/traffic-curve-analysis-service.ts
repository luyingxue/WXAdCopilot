import type { TrafficCurveAnalysis } from "../../shared/types.js";
import {
  analyzeTrafficCurves,
  buildTrafficBaseline,
  TRAFFIC_BASELINE_ALGORITHM_VERSION,
} from "../analysis/traffic-curve/analyzer.js";
import { trafficCurveRepository } from "../infrastructure/persistence/repositories.js";

export class TrafficCurveAnalysisService {
  analyze(
    accountId: string,
    targetExportId?: string,
  ): TrafficCurveAnalysis {
    const data = trafficCurveRepository.load(accountId);
    const now = new Date();
    const target =
      data.videos.find((video) => video.exportId === targetExportId) ??
      data.videos
        .filter(
          (video) =>
            now.getTime() - new Date(video.publishTime).getTime() <=
            24 * 3_600_000,
        )
        .sort(
          (a, b) =>
            new Date(b.publishTime).getTime() -
            new Date(a.publishTime).getTime(),
        )
        .find((video) => video.commerceStatus === "cart") ??
      null;
    const commerceStatus =
      target?.commerceStatus === "cart" || target?.commerceStatus === "no_cart"
        ? target.commerceStatus
        : null;
    let baseline;
    if (commerceStatus) {
      const baselineDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      baseline = trafficCurveRepository.loadBaseline(
        accountId,
        baselineDate,
        commerceStatus,
      );
      const commerceBaselineMissing =
        baseline &&
        baseline.commerceBaseline.viewClickRate === null &&
        baseline.commerceBaseline.thousandViewNetCommissionYuan === null &&
        baseline.commerceBaseline.thousandClickNetCommissionYuan === null;
      const baselineAlgorithmOutdated =
        baseline?.algorithmVersion !== TRAFFIC_BASELINE_ALGORITHM_VERSION;
      if (!baseline || commerceBaselineMissing || baselineAlgorithmOutdated) {
        baseline = buildTrafficBaseline({
          ...data,
          commerceStatus,
          now: now.toISOString(),
        });
        trafficCurveRepository.saveBaseline(
          accountId,
          baselineDate,
          baseline,
          commerceStatus,
        );
      }
    }
    return analyzeTrafficCurves({
      ...data,
      targetExportId,
      now: now.toISOString(),
      baseline,
    });
  }
}
