import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  closeDatabase,
  initializeDatabase,
} from "./infrastructure/persistence/database.js";
import { logEvent } from "./infrastructure/observability/logger.js";
import { RuntimeRegistry } from "./runtime/runtime-registry.js";
import { AccountService } from "./application/account-service.js";
import { HealthService } from "./application/health-service.js";
import { PreinvestService } from "./application/preinvest-service.js";
import { registerIpc } from "./application/ipc-controller.js";
import { SnapshotScheduler } from "./application/snapshot-scheduler.js";
import { TrafficCurveAnalysisService } from "./application/traffic-curve-analysis-service.js";
import { ProductMaintenanceService } from "./application/product-maintenance-service.js";
import { DuringInvestmentService } from "./application/during-investment-service.js";
import { DuringSnapshotScheduler } from "./application/during-snapshot-scheduler.js";
import { CartVideoAnalysisService } from "./application/cart-video-analysis-service.js";
import { StoreSessionService } from "./application/store-session-service.js";
import { StoreSessionScheduler } from "./application/store-session-scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let runtimes: RuntimeRegistry | null = null;
let snapshotScheduler: SnapshotScheduler | null = null;
let duringSnapshotScheduler: DuringSnapshotScheduler | null = null;
let storeSessionScheduler: StoreSessionScheduler | null = null;
let quittingGracefully = false;

if (process.env.WXAD_USER_DATA_DIR) {
  app.setPath("userData", process.env.WXAD_USER_DATA_DIR);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: "WXAdCopilot",
    backgroundColor: "#f4f6f8",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      console.error("Renderer failed to load", {
        errorCode,
        errorDescription,
        validatedURL,
      });
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logEvent("error", "process", "renderer_process_gone", {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  runtimes = new RuntimeRegistry(mainWindow);
  const preinvest = new PreinvestService(runtimes);
  const accountService = new AccountService(runtimes);
  const cartVideoAnalysis = new CartVideoAnalysisService(runtimes);
  const productMaintenance = new ProductMaintenanceService(
    runtimes,
    cartVideoAnalysis,
  );
  const duringInvestment = new DuringInvestmentService(runtimes);
  const storeSession = new StoreSessionService(runtimes);
  snapshotScheduler = new SnapshotScheduler(preinvest);
  duringSnapshotScheduler = new DuringSnapshotScheduler(duringInvestment);
  storeSessionScheduler = new StoreSessionScheduler(storeSession);
  registerIpc({
    window: mainWindow,
    runtimes,
    accounts: accountService,
    health: new HealthService(runtimes),
    preinvest,
    trafficCurve: new TrafficCurveAnalysisService(),
    products: productMaintenance,
    during: duringInvestment,
    snapshotScheduler,
    duringSnapshotScheduler,
    cartVideoAnalysis,
  });
  snapshotScheduler.start();
  duringSnapshotScheduler.start();
  storeSessionScheduler.start();

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
  if (process.env.WXAD_DEBUG === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    logEvent("info", "process", "main_window_closed", {});
    snapshotScheduler?.stop();
    snapshotScheduler = null;
    duringSnapshotScheduler?.stop();
    duringSnapshotScheduler = null;
    storeSessionScheduler?.stop();
    storeSessionScheduler = null;
    runtimes?.dispose();
    runtimes = null;
    mainWindow = null;
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    initializeDatabase();
    await createMainWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("child-process-gone", (_event, details) => {
  logEvent("error", "process", "child_process_gone", {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: details.serviceName,
  });
});

app.on("before-quit", () => {
  logEvent("info", "process", "before_quit", {});
  snapshotScheduler?.stop();
  duringSnapshotScheduler?.stop();
  storeSessionScheduler?.stop();
  void runtimes?.flush();
  runtimes?.dispose();
  closeDatabase();
});

async function quitGracefully(): Promise<void> {
  if (quittingGracefully) return;
  quittingGracefully = true;
  await runtimes?.flush();
  app.quit();
}

process.on("SIGINT", () => {
  logEvent("warn", "process", "signal_received", { signal: "SIGINT" });
  void quitGracefully();
});
process.on("SIGTERM", () => {
  logEvent("warn", "process", "signal_received", { signal: "SIGTERM" });
  void quitGracefully();
});
process.on("unhandledRejection", (reason) => {
  logEvent("error", "process", "unhandled_rejection", {
    message: reason instanceof Error ? reason.stack ?? reason.message : String(reason),
  });
});
process.on("uncaughtException", (error) => {
  logEvent("error", "process", "uncaught_exception", {
    message: error.stack ?? error.message,
  });
});
