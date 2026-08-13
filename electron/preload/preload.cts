import { contextBridge, ipcRenderer } from "electron";
import type {
  Account,
  AccountInput,
  BrowserState,
  Platform,
  ProductMaintenanceState,
  PreinvestRange,
  TrafficCurveAnalysis,
  DuringInvestmentState,
  SnapshotMachinesState,
  CartVideoAnalysisState,
  ViewBounds,
  VideoSyncState,
} from "../shared/types.js";

const api = {
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke("accounts:list"),
    create: (input: AccountInput): Promise<Account> =>
      ipcRenderer.invoke("accounts:create", input),
    update: (id: string, input: AccountInput): Promise<Account> =>
      ipcRenderer.invoke("accounts:update", id, input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke("accounts:delete", id),
  },
  browser: {
    show: (accountId: string, platform: Platform): Promise<void> =>
      ipcRenderer.invoke("browser:show", accountId, platform),
    hide: (): Promise<void> => ipcRenderer.invoke("browser:hide"),
    resetPlatformSession: (
      accountId: string,
      platform: Platform,
    ): Promise<void> =>
      ipcRenderer.invoke("browser:reset-platform-session", accountId, platform),
    setBounds: (bounds: ViewBounds): Promise<void> =>
      ipcRenderer.invoke("browser:set-bounds", bounds),
    navigate: (
      action: "back" | "forward" | "reload" | "home",
    ): Promise<void> => ipcRenderer.invoke("browser:navigate", action),
    onState: (listener: (state: BrowserState) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) =>
        listener(state);
      ipcRenderer.on("browser:state", handler);
      return () => ipcRenderer.removeListener("browser:state", handler);
    },
  },
  health: {
    checkAccount: (accountId: string): Promise<Account[]> =>
      ipcRenderer.invoke("health:check-account", accountId),
    checkAll: (): Promise<Account[]> => ipcRenderer.invoke("health:check-all"),
  },
  preinvest: {
    resetTestData: (accountId: string): Promise<void> =>
      ipcRenderer.invoke("preinvest:reset-test-data", accountId),
    syncTestData: (
      accountId: string,
      range: PreinvestRange,
    ): Promise<VideoSyncState> =>
      ipcRenderer.invoke("preinvest:sync-test-data", accountId, range),
    getSyncState: (accountId: string): Promise<VideoSyncState> =>
      ipcRenderer.invoke("preinvest:get-sync-state", accountId),
    getTrafficAnalysis: (
      accountId: string,
      targetExportId?: string,
    ): Promise<TrafficCurveAnalysis> =>
      ipcRenderer.invoke(
        "preinvest:get-traffic-analysis",
        accountId,
        targetExportId,
      ),
  },
  commerce: {
    syncVideos: (accountId: string): Promise<VideoSyncState> =>
      ipcRenderer.invoke("commerce:sync-videos", accountId),
  },
  products: {
    getState: (accountId: string): Promise<ProductMaintenanceState> =>
      ipcRenderer.invoke("products:get-state", accountId),
    refresh: (accountId: string): Promise<ProductMaintenanceState> =>
      ipcRenderer.invoke("products:refresh", accountId),
    refreshBusinessData: (
      accountId: string,
    ): Promise<ProductMaintenanceState> =>
      ipcRenderer.invoke("products:refresh-business-data", accountId),
    exportExcel: (accountId: string): Promise<string | null> =>
      ipcRenderer.invoke("products:export", accountId),
  },
  during: {
    getCurrent: (
      accountId: string,
      promotionId?: string,
    ): Promise<DuringInvestmentState> =>
      ipcRenderer.invoke("during:get-current", accountId, promotionId),
    discoverNow: (accountId: string): Promise<DuringInvestmentState> =>
      ipcRenderer.invoke("during:discover-now", accountId),
  },
  snapshotMachines: {
    getState: (accountId: string): Promise<SnapshotMachinesState> =>
      ipcRenderer.invoke("snapshot-machines:get-state", accountId),
  },
  cartVideoAnalysis: {
    getState: (accountId: string): Promise<CartVideoAnalysisState> =>
      ipcRenderer.invoke("cart-video-analysis:get-state", accountId),
    refresh: (accountId: string): Promise<CartVideoAnalysisState> =>
      ipcRenderer.invoke("cart-video-analysis:refresh", accountId),
    exportExcel: (accountId: string): Promise<string | null> =>
      ipcRenderer.invoke("cart-video-analysis:export", accountId),
  },
};

contextBridge.exposeInMainWorld("wxad", api);

export type WxadApi = typeof api;
