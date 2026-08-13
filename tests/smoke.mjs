import { _electron as electron } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const userDataDir = await mkdtemp(path.join(tmpdir(), "wxadcopilot-smoke-"));
let electronApp;

try {
  electronApp = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      WXAD_USER_DATA_DIR: userDataDir,
    },
  });

  const window = await electronApp.firstWindow();
  await window.getByRole("button", { name: "＋ 添加账号" }).click();
  await window.getByLabel("账号名称").fill("测试账号");
  await window.getByLabel("分组").fill("自动化测试");
  await window.getByRole("button", { name: "保存" }).click();

  await window.getByText("测试账号", { exact: true }).first().waitFor();
  await window.getByText("未检测", { exact: true }).first().waitFor();
  await window
    .locator(".account-card")
    .filter({ hasText: "测试账号" })
    .click({ button: "right" });
  await window.getByRole("button", { name: "编辑账号" }).click();
  await window.getByLabel("账号名称").fill("已编辑账号");
  await window.getByRole("button", { name: "保存" }).click();
  await window.getByText("已编辑账号", { exact: true }).first().waitFor();
  await window.getByRole("button", { name: "微信小店" }).click();
  await window.getByRole("button", { name: "电商罗盘" }).click();
  await window.getByRole("button", { name: "加热平台" }).click();

  const browserHost = window.locator(".browser-host");
  await browserHost.evaluate((element) => {
    element.dataset.lifecycleMarker = "persistent-browser-host";
  });
  await window.getByRole("button", { name: "投前分析" }).click();
  await window.waitForTimeout(100);
  if (
    (await window.getByRole("button", { name: "刷新当前快照" }).count()) !== 0
  ) {
    throw new Error("Read-only preinvest page exposed a manual snapshot action");
  }
  await window.getByRole("heading", { name: "流量曲线分析" }).waitFor();
  if ((await window.getByRole("button", { name: "模拟数据" }).count()) !== 0) {
    throw new Error("Preinvest page still exposes simulated data");
  }
  const hiddenViews = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children.map((view) => ({
      visible: view.getVisible(),
      bounds: view.getBounds(),
    })),
  );
  if (hiddenViews.some((view) => view.visible)) {
    throw new Error("Official browser view remained visible over analysis");
  }

  await window.getByRole("button", { name: "官网浏览" }).click();
  await window.waitForTimeout(100);
  if (
    await browserHost.getAttribute("data-lifecycle-marker") !==
    "persistent-browser-host"
  ) {
    throw new Error("Browser host was recreated during module switch");
  }
  const restoredViews = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].contentView.children.map((view) => ({
      visible: view.getVisible(),
      bounds: view.getBounds(),
    })),
  );
  const visibleView = restoredViews.find((view) => view.visible);
  if (!visibleView || visibleView.bounds.width <= 0 || visibleView.bounds.height <= 0) {
    throw new Error("Official browser view did not restore with valid bounds");
  }

  await window.getByRole("button", { name: "系统数据维护" }).click();
  await window.getByRole("heading", { name: "商品数据库" }).waitFor();
  await window.getByRole("button", { name: "刷新商品资料" }).waitFor();
  await window.getByRole("button", { name: "刷新经营数据" }).waitFor();
  await window.getByRole("button", { name: "导出 Excel" }).first().waitFor();
  await window
    .getByText("估算净佣金（已覆盖）", { exact: true })
    .first()
    .waitFor();
  if (process.env.WXAD_SMOKE_SCREENSHOT) {
    await window.screenshot({ path: process.env.WXAD_SMOKE_SCREENSHOT });
  }

  const result = await electronApp.evaluate(({ app }) => ({
    name: app.getName(),
    userData: app.getPath("userData"),
  }));

  if (result.userData !== userDataDir) {
    throw new Error("Smoke test did not use isolated user data");
  }
  console.log("Smoke test passed", result);
} finally {
  await electronApp?.close();
  await rm(userDataDir, { recursive: true, force: true });
}
