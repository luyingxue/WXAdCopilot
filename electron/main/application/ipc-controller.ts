import {
  ipcMain,
  dialog,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import type {
  AccountInput,
  Platform,
  PreinvestRange,
  ViewBounds,
} from "../../shared/types.js";
import type { RuntimeRegistry } from "../runtime/runtime-registry.js";
import type { AccountService } from "./account-service.js";
import type { HealthService } from "./health-service.js";
import type { PreinvestService } from "./preinvest-service.js";
import type { ProductMaintenanceService } from "./product-maintenance-service.js";
import type { TrafficCurveAnalysisService } from "./traffic-curve-analysis-service.js";
import type { DuringInvestmentService } from "./during-investment-service.js";
import type { SnapshotScheduler } from "./snapshot-scheduler.js";
import type { DuringSnapshotScheduler } from "./during-snapshot-scheduler.js";
import type { CartVideoAnalysisService } from "./cart-video-analysis-service.js";
import { exportCartVideosToExcel } from "../infrastructure/export/cart-video-excel.js";
import { exportProductAnalysisToExcel } from "../infrastructure/export/product-analysis-excel.js";

interface IpcDependencies {
  window: BrowserWindow;
  runtimes: RuntimeRegistry;
  accounts: AccountService;
  health: HealthService;
  preinvest: PreinvestService;
  trafficCurve: TrafficCurveAnalysisService;
  products: ProductMaintenanceService;
  during: DuringInvestmentService;
  snapshotScheduler: SnapshotScheduler;
  duringSnapshotScheduler: DuringSnapshotScheduler;
  cartVideoAnalysis: CartVideoAnalysisService;
}

export function registerIpc(dependencies: IpcDependencies): void {
  const {
    window,
    runtimes,
    accounts,
    health,
    preinvest,
    trafficCurve,
    products,
    during,
    snapshotScheduler,
    duringSnapshotScheduler,
    cartVideoAnalysis,
  } = dependencies;
  [
    "accounts:list",
    "accounts:create",
    "accounts:update",
    "accounts:delete",
    "browser:show",
    "browser:hide",
    "browser:reset-platform-session",
    "browser:set-bounds",
    "browser:navigate",
    "health:check-account",
    "health:check-all",
    "preinvest:reset-test-data",
    "preinvest:sync-test-data",
    "preinvest:get-sync-state",
    "preinvest:get-traffic-analysis",
    "commerce:sync-videos",
    "products:get-state",
    "products:refresh",
    "products:refresh-business-data",
    "products:export",
    "during:get-current",
    "during:discover-now",
    "snapshot-machines:get-state",
    "cart-video-analysis:get-state",
    "cart-video-analysis:refresh",
    "cart-video-analysis:export",
  ].forEach((channel) => ipcMain.removeHandler(channel));

  const assertSender = (event: IpcMainInvokeEvent): void => {
    if (event.sender !== window.webContents) {
      throw new Error("Unauthorized IPC sender");
    }
  };

  ipcMain.handle("accounts:list", (event) => {
    assertSender(event);
    return accounts.list();
  });
  ipcMain.handle("accounts:create", (event, input: AccountInput) => {
    assertSender(event);
    return accounts.create(input);
  });
  ipcMain.handle(
    "accounts:update",
    (event, id: string, input: AccountInput) => {
      assertSender(event);
      return accounts.update(id, input);
    },
  );
  ipcMain.handle("accounts:delete", async (event, id: string) => {
    assertSender(event);
    await accounts.delete(id);
  });

  ipcMain.handle(
    "browser:show",
    async (event, accountId: string, platform: Platform) => {
      assertSender(event);
      await runtimes.show(accountId, platform);
    },
  );
  ipcMain.handle("browser:hide", (event) => {
    assertSender(event);
    runtimes.hideActive();
  });
  ipcMain.handle(
    "browser:reset-platform-session",
    async (event, accountId: string, platform: Platform) => {
      assertSender(event);
      await runtimes.forAccount(accountId).resetPlatform(platform);
    },
  );
  ipcMain.handle("browser:set-bounds", (event, bounds: ViewBounds) => {
    assertSender(event);
    runtimes.setBounds(bounds);
  });
  ipcMain.handle(
    "browser:navigate",
    (event, action: "back" | "forward" | "reload" | "home") => {
      assertSender(event);
      runtimes.navigate(action);
    },
  );

  ipcMain.handle("health:check-account", async (event, accountId: string) => {
    assertSender(event);
    return health.checkAccount(accountId);
  });
  ipcMain.handle("health:check-all", async (event) => {
    assertSender(event);
    return health.checkAll();
  });

  ipcMain.handle("preinvest:reset-test-data", (event, accountId: string) => {
    assertSender(event);
    preinvest.resetTestData(accountId);
  });
  ipcMain.handle(
    "preinvest:sync-test-data",
    async (event, accountId: string, range: PreinvestRange) => {
      assertSender(event);
      return preinvest.refresh(accountId, range);
    },
  );
  ipcMain.handle("preinvest:get-sync-state", (event, accountId: string) => {
    assertSender(event);
    return preinvest.getState(accountId);
  });
  ipcMain.handle(
    "preinvest:get-traffic-analysis",
    (event, accountId: string, targetExportId?: string) => {
      assertSender(event);
      return trafficCurve.analyze(accountId, targetExportId);
    },
  );
  ipcMain.handle("commerce:sync-videos", async (event, accountId: string) => {
    assertSender(event);
    return preinvest.refresh(accountId, "fortnight");
  });
  ipcMain.handle("products:get-state", (event, accountId: string) => {
    assertSender(event);
    return products.getState(accountId);
  });
  ipcMain.handle("products:refresh", async (event, accountId: string) => {
    assertSender(event);
    return products.refresh(accountId);
  });
  ipcMain.handle(
    "products:refresh-business-data",
    async (event, accountId: string) => {
      assertSender(event);
      return products.refreshBusinessData(accountId);
    },
  );
  ipcMain.handle("products:export", async (event, accountId: string) => {
    assertSender(event);
    const state = products.getState(accountId);
    const accountName =
      accounts.list().find((account) => account.id === accountId)?.name ??
      "账号";
    const safeName = accountName.replace(/[\\/:*?"<>|]/g, "_");
    const date = new Date().toISOString().slice(0, 10);
    const selection = await dialog.showSaveDialog(window, {
      title: "导出商品经营分析",
      defaultPath: `${safeName}-商品经营分析-${date}.xlsx`,
      filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    await exportProductAnalysisToExcel(selection.filePath, state);
    return selection.filePath;
  });
  ipcMain.handle(
    "during:get-current",
    (event, accountId: string, promotionId?: string) => {
      assertSender(event);
      return during.getState(accountId, promotionId);
    },
  );
  ipcMain.handle("during:discover-now", async (event, accountId: string) => {
    assertSender(event);
    await duringSnapshotScheduler.discoverNow(accountId);
    return during.getState(accountId);
  });
  ipcMain.handle("snapshot-machines:get-state", (event, accountId: string) => {
    assertSender(event);
    return {
      preinvest: snapshotScheduler.getStatus(accountId),
      during: duringSnapshotScheduler.getStatus(accountId),
    };
  });
  ipcMain.handle("cart-video-analysis:get-state", (event, accountId: string) => {
    assertSender(event);
    return cartVideoAnalysis.getState(accountId);
  });
  ipcMain.handle(
    "cart-video-analysis:refresh",
    async (event, accountId: string) => {
      assertSender(event);
      return cartVideoAnalysis.refresh(accountId);
    },
  );
  ipcMain.handle(
    "cart-video-analysis:export",
    async (event, accountId: string) => {
      assertSender(event);
      const state = cartVideoAnalysis.getState(accountId);
      const accountName =
        accounts.list().find((account) => account.id === accountId)?.name ??
        "账号";
      const safeName = accountName.replace(/[\\/:*?"<>|]/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      const selection = await dialog.showSaveDialog(window, {
        title: "导出带货视频分析",
        defaultPath: `${safeName}-带货视频分析-${date}.xlsx`,
        filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
      });
      if (selection.canceled || !selection.filePath) return null;
      await exportCartVideosToExcel(selection.filePath, state.videos);
      return selection.filePath;
    },
  );
}
