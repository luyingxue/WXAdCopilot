import type {
  Account,
  AccountInput,
  CartVideoAnalysisRefreshResult,
  CartVideoAnalysisState,
  PreinvestSyncResult,
  ProductSyncResult,
  VideoSummary,
  VideoSyncState,
} from "../../../shared/types.js";
import {
  createAccount,
  deleteAccount,
  getMissingProductIds,
  getKnownCommerceStatuses,
  getCartVideoAnalysisState,
  getProductMaintenanceState,
  getDuringInvestmentState,
  hasCompletedPromoteCaptureSince,
  hasCompletedSnapshotSince,
  getVideoSyncState,
  listAccounts,
  listTrackedPromotionIds,
  listSnapshotEnabledAccountIds,
  loadTrafficCurveData,
  loadTrafficBaseline,
  resetPreinvestTestData,
  savePreinvestSyncResult,
  saveCartVideoAnalysisResult,
  saveCartVideoAnalysisError,
  saveProducts,
  savePromoteCapture,
  saveVideoSyncError,
  saveTrafficBaseline,
  setPlatformStatus,
  updateAccount,
} from "./database.js";

export const accountRepository = {
  list(): Account[] {
    return listAccounts();
  },
  create(input: AccountInput): Account {
    return createAccount(input);
  },
  update(id: string, input: AccountInput): Account {
    return updateAccount(id, input);
  },
  delete(id: string): void {
    deleteAccount(id);
  },
  setPlatformStatus,
};

export const preinvestRepository = {
  listSnapshotEnabledAccountIds(): string[] {
    return listSnapshotEnabledAccountIds();
  },
  hasCompletedSnapshotSince(
    accountId: string,
    capturedAtInclusive: string,
  ): boolean {
    return hasCompletedSnapshotSince(accountId, capturedAtInclusive);
  },
  getState(accountId: string): VideoSyncState {
    return getVideoSyncState(accountId);
  },
  getMissingProductIds(accountId: string, videos: VideoSummary[]): string[] {
    return getMissingProductIds(accountId, videos);
  },
  saveProducts(result: ProductSyncResult): void {
    saveProducts(result);
  },
  resetTestData(accountId: string): void {
    resetPreinvestTestData(accountId);
  },
  saveResult(result: PreinvestSyncResult): void {
    savePreinvestSyncResult(result);
  },
  saveError(accountId: string, message: string): void {
    saveVideoSyncError(accountId, message);
  },
};

export const trafficCurveRepository = {
  load(accountId: string) {
    return loadTrafficCurveData(accountId);
  },
  loadBaseline(
    accountId: string,
    baselineDate: string,
    commerceStatus: "cart" | "no_cart",
  ) {
    return loadTrafficBaseline(accountId, baselineDate, commerceStatus);
  },
  saveBaseline(
    accountId: string,
    baselineDate: string,
    baseline: Parameters<typeof saveTrafficBaseline>[2],
    commerceStatus: "cart" | "no_cart",
  ): void {
    saveTrafficBaseline(accountId, baselineDate, baseline, commerceStatus);
  },
};

export const productRepository = {
  getState: getProductMaintenanceState,
  save: saveProducts,
};

export const cartVideoAnalysisRepository = {
  getState(accountId: string): CartVideoAnalysisState {
    return getCartVideoAnalysisState(accountId);
  },
  getKnownCommerceStatuses,
  saveResult(result: CartVideoAnalysisRefreshResult): void {
    saveCartVideoAnalysisResult(result);
  },
  saveError: saveCartVideoAnalysisError,
};

export const duringInvestmentRepository = {
  saveCapture: savePromoteCapture,
  hasCompletedSince: hasCompletedPromoteCaptureSince,
  getState: getDuringInvestmentState,
  listTrackedPromotionIds,
};
