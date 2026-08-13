import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainRoot = path.join(root, "electron", "main");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      return entry.name.endsWith(".ts") ? [target] : [];
    }),
  );
  return nested.flat();
}

function relative(file) {
  return path.relative(root, file);
}

const violations = [];
const rules = [
  {
    directory: "platforms",
    forbidden: ["/application/", "/infrastructure/persistence/"],
  },
  {
    directory: "runtime",
    forbidden: ["/application/", "/platforms/", "/infrastructure/persistence/"],
  },
  {
    directory: "infrastructure",
    forbidden: ["/application/", "/platforms/", "/runtime/"],
  },
  {
    directory: "analysis",
    forbidden: [
      "/application/",
      "/platforms/",
      "/runtime/",
      "/infrastructure/",
      "electron",
    ],
  },
];

for (const rule of rules) {
  const directory = path.join(mainRoot, rule.directory);
  for (const file of await sourceFiles(directory)) {
    const source = await readFile(file, "utf8");
    for (const forbidden of rule.forbidden) {
      if (source.includes(forbidden)) {
        violations.push(`${relative(file)} cannot depend on ${forbidden}`);
      }
    }
  }
}

const mainSource = await readFile(path.join(mainRoot, "main.ts"), "utf8");
for (const forbidden of ["/platforms/", "/persistence/repositories", "database.js"]) {
  if (mainSource.includes(forbidden) && forbidden !== "database.js") {
    violations.push(`electron/main/main.ts cannot directly depend on ${forbidden}`);
  }
}

const runtimeSource = (
  await Promise.all(
    (await sourceFiles(path.join(mainRoot, "runtime"))).map((file) =>
      readFile(file, "utf8"),
    ),
  )
).join("\n");
for (const forbiddenAuthMechanism of [
  "cookies.on(",
  "cookies.remove(",
  "restoreSessionCookies",
  "saveSessionCookies",
]) {
  if (runtimeSource.includes(forbiddenAuthMechanism)) {
    violations.push(
      `runtime cannot rewrite or externally persist official auth: ${forbiddenAuthMechanism}`,
    );
  }
}

const duringGatewaySource = await readFile(
  path.join(mainRoot, "platforms", "promote", "promote-order-gateway.ts"),
  "utf8",
);
for (const retiredDuringRequest of [
  "getFeedPromotionOrderOverview",
  "getFeedPromotionOrdersTsIndicator",
  "getFeedPromotionOrderIndicatorDetail",
]) {
  if (duringGatewaySource.includes(retiredDuringRequest)) {
    violations.push(
      `during-investment gateway must not call retired request: ${retiredDuringRequest}`,
    );
  }
}

const duringServiceSource = await readFile(
  path.join(mainRoot, "application", "during-investment-service.ts"),
  "utf8",
);
if (
  duringServiceSource.includes("collectCompassVideoSnapshot") ||
  duringServiceSource.includes('"compass"')
) {
  violations.push(
    "during-investment service must not refresh Compass video snapshots",
  );
}

const databaseSource = await readFile(
  path.join(mainRoot, "infrastructure", "persistence", "database.ts"),
  "utf8",
);
for (const requiredPromoteTable of [
  "CREATE TABLE IF NOT EXISTS promote_orders",
  "CREATE TABLE IF NOT EXISTS promote_order_snapshots",
  "CREATE TABLE IF NOT EXISTS promote_decisions",
  "CREATE TABLE IF NOT EXISTS promote_actions",
  "commission_rate REAL",
  "budget_wecoin_tenths INTEGER",
  "capture_quality TEXT NOT NULL",
  "spent_wecoin_tenths INTEGER",
  "product_net_pay_gmv_fen INTEGER",
  "paid_gmv_fen INTEGER",
  "refund_gmv_fen INTEGER",
  "UNIQUE (account_id, promotion_id, captured_at)",
  "snapshot_run_id TEXT NOT NULL",
  "FOREIGN KEY (snapshot_run_id, promotion_id)",
  "algorithm_version TEXT NOT NULL",
  "feature_version TEXT NOT NULL",
  "detail_raw_json TEXT",
  "CREATE VIEW promote_order_snapshot_deltas",
]) {
  if (!databaseSource.includes(requiredPromoteTable)) {
    violations.push(
      `final promote database schema is missing: ${requiredPromoteTable}`,
    );
  }
}

for (const retiredSnapshotTable of [
  "CREATE TABLE IF NOT EXISTS video_metric_snapshots",
  "CREATE TABLE IF NOT EXISTS commerce_metric_snapshots",
]) {
  if (databaseSource.includes(retiredSnapshotTable)) {
    violations.push(`retired snapshot table was recreated: ${retiredSnapshotTable}`);
  }
}

if (!databaseSource.includes("if (result.orders.length === 0) return;")) {
  violations.push("empty promote captures must not be persisted");
}

for (const legacy of [
  "browser-workspace.ts",
  "commerce-collector.ts",
  "database.ts",
  "login-health.ts",
  "secure-cookie-vault.ts",
]) {
  try {
    await readFile(path.join(mainRoot, legacy));
    violations.push(`legacy root module still exists: electron/main/${legacy}`);
  } catch {}
}

if (violations.length > 0) {
  throw new Error(`Architecture boundary violations:\n${violations.join("\n")}`);
}

console.log("Architecture boundary test passed");
