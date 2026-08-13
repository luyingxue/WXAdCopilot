import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Account,
  AccountInput,
  AccountStatus,
  CommerceSyncResult,
  CommerceStatus,
  CartVideoAnalysisRefreshResult,
  CartVideoAnalysisState,
  LoginStatus,
  Platform,
  PreinvestSyncResult,
  ProductSyncResult,
  ProductMaintenanceState,
  DuringInvestmentState,
  DuringOrderCurrentSnapshot,
  DuringOrderTimelinePoint,
  VideoSummary,
  VideoSyncResult,
  VideoSyncState,
  TrafficMetricDistribution,
  TrafficReferencePoint,
} from "../../../shared/types.js";

const PLATFORMS: Platform[] = ["commerce", "compass", "promote"];
let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (!database) {
    throw new Error("Database has not been initialized");
  }
  return database;
}

export function initializeDatabase(): void {
  const databasePath = path.join(app.getPath("userData"), "wxadcopilot.sqlite3");
  database = new DatabaseSync(databasePath);
  db().exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS platform_sessions (
      account_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('commerce', 'compass', 'promote')),
      status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('online', 'offline', 'checking', 'unknown')),
      checked_at TEXT,
      reason TEXT,
      PRIMARY KEY (account_id, platform),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS videos (
      account_id TEXT NOT NULL,
      export_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      publish_time TEXT NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      views_count INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, export_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS video_sync_state (
      account_id TEXT PRIMARY KEY,
      synced_count INTEGER NOT NULL DEFAULT 0,
      platform_total INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      last_error TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cart_video_analysis_state (
      account_id TEXT PRIMARY KEY,
      cart_video_count INTEGER NOT NULL DEFAULT 0,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      platform_total INTEGER NOT NULL DEFAULT 0,
      last_synced_at TEXT,
      last_error TEXT,
      request_count INTEGER NOT NULL DEFAULT 0,
      detail_request_count INTEGER NOT NULL DEFAULT 0,
      skipped_no_cart_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cart_video_analysis_items (
      account_id TEXT NOT NULL,
      export_id TEXT NOT NULL,
      refreshed_at TEXT NOT NULL,
      PRIMARY KEY (account_id, export_id),
      FOREIGN KEY (account_id, export_id)
        REFERENCES videos(account_id, export_id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS snapshot_runs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      range_code TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      video_count INTEGER NOT NULL DEFAULT 0,
      platform_total INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      detail_request_count INTEGER NOT NULL DEFAULT 0,
      skipped_no_cart_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS snapshot_runs_account_time
      ON snapshot_runs(account_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS video_snapshots (
      run_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      export_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      title TEXT NOT NULL,
      publish_time TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      feed_id TEXT,
      views_count INTEGER NOT NULL,
      likes_count INTEGER NOT NULL,
      comments_count INTEGER NOT NULL,
      forwards_count INTEGER NOT NULL,
      favorites_count INTEGER NOT NULL,
      follows_count INTEGER NOT NULL,
      completion_rate REAL,
      average_watch_time_sec REAL,
      total_watch_time_sec REAL,
      full_watch_count INTEGER,
      fast_flip_rate REAL,
      yesterday_views_count INTEGER,
      retention_3_sec REAL,
      retention_5_sec REAL,
      retention_30_sec REAL,
      lost_rate_point_count INTEGER,
      max_lost_rate_sec REAL,
      max_lost_point_retention REAL,
      traffic_sources_json TEXT,
      fan_type_sources_json TEXT,
      commerce_status TEXT NOT NULL
        CHECK (commerce_status IN ('unknown', 'cart', 'no_cart')),
      product_id TEXT,
      product_name TEXT,
      product_expose_count INTEGER,
      commerce_product_id TEXT,
      product_click_count INTEGER,
      paid_gmv_fen INTEGER,
      gpm_per_thousand_views REAL,
      paid_order_count INTEGER,
      refund_gmv_fen INTEGER,
      refund_order_count INTEGER,
      list_raw_json TEXT NOT NULL,
      detail_raw_json TEXT,
      list_complete INTEGER NOT NULL CHECK (list_complete IN (0, 1)),
      detail_complete INTEGER NOT NULL CHECK (detail_complete IN (0, 1)),
      collector_version TEXT NOT NULL,
      PRIMARY KEY (run_id, export_id),
      FOREIGN KEY (run_id) REFERENCES snapshot_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id, export_id)
        REFERENCES videos(account_id, export_id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS video_snapshots_video_time
      ON video_snapshots(account_id, export_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS traffic_baseline_versions (
      account_id TEXT NOT NULL,
      baseline_date TEXT NOT NULL,
      commerce_status TEXT NOT NULL
        CHECK (commerce_status IN ('cart', 'no_cart')),
      generated_at TEXT NOT NULL,
      window_days INTEGER NOT NULL,
      sample_count INTEGER NOT NULL,
      reference_curve_json TEXT NOT NULL,
      commerce_baseline_json TEXT NOT NULL DEFAULT '{}',
      algorithm_version TEXT NOT NULL DEFAULT 'traffic-baseline-v1',
      feature_version TEXT NOT NULL DEFAULT 'preinvest-features-v1',
      PRIMARY KEY (account_id, baseline_date, commerce_status),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS traffic_baseline_latest
      ON traffic_baseline_versions(
        account_id, commerce_status, baseline_date DESC
      );

    CREATE TABLE IF NOT EXISTS products (
      account_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      out_product_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      short_title TEXT NOT NULL DEFAULT '',
      shop_name TEXT NOT NULL DEFAULT '',
      commission_rate REAL,
      promotion_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (promotion_status IN ('active', 'ended', 'unknown')),
      raw_json TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      PRIMARY KEY (account_id, product_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS products_account_status
      ON products(account_id, promotion_status);

    CREATE TABLE IF NOT EXISTS promote_capture_runs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      order_count INTEGER NOT NULL DEFAULT 0,
      request_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS promote_capture_runs_account_time
      ON promote_capture_runs(account_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS promote_orders (
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      order_name TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 0,
      export_status INTEGER,
      video_export_id TEXT,
      video_global_export_id TEXT,
      video_title TEXT NOT NULL DEFAULT '',
      video_cover_url TEXT,
      video_published_at TEXT,
      has_shopping_cart INTEGER
        CHECK (has_shopping_cart IN (0, 1) OR has_shopping_cart IS NULL),
      product_name TEXT,
      cps_product_id TEXT,
      shop_product_id TEXT,
      target INTEGER,
      duration_sec INTEGER,
      promotion_type INTEGER,
      pricing_method INTEGER,
      billing_method INTEGER,
      budget_wecoin_tenths INTEGER,
      commission_rate REAL,
      create_at TEXT,
      estimated_start_at TEXT,
      actual_start_at TEXT,
      estimated_end_at TEXT,
      actual_end_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (account_id, promotion_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    CREATE TABLE IF NOT EXISTS promote_order_snapshots (
      run_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      capture_quality TEXT NOT NULL DEFAULT 'complete'
        CHECK (capture_quality IN ('complete', 'partial')),
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      spent_wecoin_tenths INTEGER,
      paid_wecoin_tenths INTEGER,
      refunded_wecoin_tenths INTEGER,
      exposure_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      favorite_count INTEGER,
      forward_count INTEGER,
      video_follow_count INTEGER,
      biz_follow_count INTEGER,
      product_click_pv INTEGER,
      product_click_uv INTEGER,
      product_order_count INTEGER,
      product_placeorder_count INTEGER,
      product_placeorder_gmv_fen INTEGER,
      product_pay_count INTEGER,
      product_pay_gmv_fen INTEGER,
      product_pay_roi REAL,
      product_net_pay_count INTEGER,
      product_net_pay_gmv_fen INTEGER,
      product_net_pay_roi REAL,
      detail_raw_json TEXT,
      PRIMARY KEY (run_id, promotion_id),
      UNIQUE (account_id, promotion_id, captured_at),
      FOREIGN KEY (run_id)
        REFERENCES promote_capture_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id, promotion_id)
        REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS promote_order_snapshots_latest
      ON promote_order_snapshots(account_id, promotion_id, captured_at DESC);

    CREATE TABLE IF NOT EXISTS promote_decisions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      snapshot_run_id TEXT NOT NULL,
      snapshot_captured_at TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      recommendation TEXT NOT NULL
        CHECK (recommendation IN (
          'continue', 'observe', 'adjust', 'pause', 'stop'
        )),
      risk_level TEXT NOT NULL
        CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
      confidence REAL CHECK (
        confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
      ),
      reason_codes_json TEXT NOT NULL DEFAULT '[]',
      explanation TEXT NOT NULL DEFAULT '',
      policy_version TEXT NOT NULL,
      feature_version TEXT NOT NULL,
      valid_until TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id, promotion_id)
        REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE,
      FOREIGN KEY (snapshot_run_id, promotion_id)
        REFERENCES promote_order_snapshots(run_id, promotion_id)
        ON DELETE CASCADE
    ) STRICT;

    CREATE INDEX IF NOT EXISTS promote_decisions_order_time
      ON promote_decisions(account_id, promotion_id, decided_at DESC);

    CREATE TABLE IF NOT EXISTS promote_actions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      decision_id TEXT,
      requested_at TEXT NOT NULL,
      executed_at TEXT,
      actor_type TEXT NOT NULL
        CHECK (actor_type IN ('human', 'automation')),
      actor_id TEXT,
      action_type TEXT NOT NULL
        CHECK (action_type IN (
          'continue', 'adjust_budget', 'pause', 'resume', 'stop'
        )),
      parameters_json TEXT NOT NULL DEFAULT '{}',
      execution_status TEXT NOT NULL
        CHECK (execution_status IN (
          'pending', 'succeeded', 'failed', 'cancelled'
        )),
      official_result_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id, promotion_id)
        REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE,
      FOREIGN KEY (decision_id)
        REFERENCES promote_decisions(id) ON DELETE SET NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS promote_actions_order_time
      ON promote_actions(account_id, promotion_id, requested_at DESC);
  `);

  const platformTable = db()
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'platform_sessions'",
    )
    .get() as { sql: string } | undefined;
  if (platformTable && platformTable.sql.includes("'creator'")) {
    db().exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN IMMEDIATE;
      ALTER TABLE platform_sessions RENAME TO platform_sessions_legacy;
      CREATE TABLE platform_sessions (
        account_id TEXT NOT NULL,
        platform TEXT NOT NULL
          CHECK (platform IN ('commerce', 'compass', 'promote')),
        status TEXT NOT NULL DEFAULT 'unknown'
          CHECK (status IN ('online', 'offline', 'checking', 'unknown')),
        checked_at TEXT,
        reason TEXT,
        PRIMARY KEY (account_id, platform),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      ) STRICT;
      INSERT INTO platform_sessions
        (account_id, platform, status, checked_at, reason)
      SELECT account_id, platform, status, checked_at, reason
      FROM platform_sessions_legacy
      WHERE platform IN ('commerce', 'compass', 'promote');
      DROP TABLE platform_sessions_legacy;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
  const ensurePlatform = db().prepare(`
    INSERT OR IGNORE INTO platform_sessions (account_id, platform)
    SELECT id, ? FROM accounts
  `);
  for (const platform of PLATFORMS) ensurePlatform.run(platform);

  let promoteSnapshotColumns = new Set(
    (db().prepare("PRAGMA table_info(promote_order_snapshots)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  if (promoteSnapshotColumns.has("order_detail_json")) {
    migratePromoteSchemaV3();
    promoteSnapshotColumns = new Set(
      (db().prepare("PRAGMA table_info(promote_order_snapshots)").all() as Array<{
        name: string;
      }>).map((column) => column.name),
    );
  }
  if (
    promoteSnapshotColumns.has("spent_wecoin") ||
    promoteSnapshotColumns.has("product_net_pay_gmv_yuan")
  ) {
    migratePromoteSchemaV4();
  }
  db().exec(`
    DROP VIEW IF EXISTS promote_order_snapshot_deltas;
    CREATE VIEW promote_order_snapshot_deltas AS
    WITH sequenced AS (
      SELECT
        s.*,
        LAG(captured_at) OVER order_time AS previous_captured_at,
        LAG(spent_wecoin_tenths) OVER order_time AS previous_spent,
        LAG(exposure_count) OVER order_time AS previous_exposure,
        LAG(product_click_pv) OVER order_time AS previous_clicks,
        LAG(product_pay_count) OVER order_time AS previous_pay_count,
        LAG(product_net_pay_count) OVER order_time AS previous_net_pay_count,
        LAG(product_net_pay_gmv_fen) OVER order_time AS previous_net_pay_gmv
      FROM promote_order_snapshots s
      WINDOW order_time AS (
        PARTITION BY account_id, promotion_id ORDER BY captured_at
      )
    )
    SELECT
      sequenced.*,
      CASE WHEN previous_captured_at IS NULL THEN NULL
           ELSE CAST(
             ROUND((julianday(captured_at) - julianday(previous_captured_at))
               * 86400)
             AS INTEGER
           ) END AS interval_seconds,
      spent_wecoin_tenths - previous_spent AS delta_spent_wecoin_tenths,
      exposure_count - previous_exposure AS delta_exposure_count,
      product_click_pv - previous_clicks AS delta_product_click_pv,
      product_pay_count - previous_pay_count AS delta_product_pay_count,
      product_net_pay_count - previous_net_pay_count
        AS delta_product_net_pay_count,
      product_net_pay_gmv_fen - previous_net_pay_gmv
        AS delta_product_net_pay_gmv_fen,
      CASE WHEN
        spent_wecoin_tenths < previous_spent OR
        exposure_count < previous_exposure OR
        product_click_pv < previous_clicks OR
        product_pay_count < previous_pay_count OR
        product_net_pay_count < previous_net_pay_count OR
        product_net_pay_gmv_fen < previous_net_pay_gmv
      THEN 1 ELSE 0 END AS has_counter_regression
    FROM sequenced;
  `);

  const videoColumns = db()
    .prepare("PRAGMA table_info(videos)")
    .all() as Array<{ name: string }>;
  const existingColumns = new Set(videoColumns.map((column) => column.name));
  const trafficBaselineColumns = new Set(
    (db().prepare("PRAGMA table_info(traffic_baseline_versions)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  if (!trafficBaselineColumns.has("commerce_baseline_json")) {
    db().exec(
      "ALTER TABLE traffic_baseline_versions ADD COLUMN commerce_baseline_json TEXT NOT NULL DEFAULT '{}'",
    );
  }
  const productColumns = new Set(
    (db().prepare("PRAGMA table_info(products)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  if (!productColumns.has("short_title")) {
    db().exec(
      "ALTER TABLE products ADD COLUMN short_title TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!productColumns.has("shop_name")) {
    db().exec(
      "ALTER TABLE products ADD COLUMN shop_name TEXT NOT NULL DEFAULT ''",
    );
  }
  db().exec(`
    UPDATE products
    SET short_title = COALESCE(NULLIF(short_title, ''), json_extract(raw_json, '$.shortTitle'), ''),
        shop_name = COALESCE(NULLIF(shop_name, ''), json_extract(raw_json, '$.platformName'), '')
    WHERE short_title = '' OR shop_name = ''
  `);
  const additions: Array<[string, string]> = [
    ["forwards_count", "INTEGER NOT NULL DEFAULT 0"],
    ["favorites_count", "INTEGER NOT NULL DEFAULT 0"],
    ["follows_count", "INTEGER NOT NULL DEFAULT 0"],
    ["completion_rate", "REAL"],
    ["average_watch_time_sec", "REAL"],
    ["total_watch_time_sec", "REAL"],
    ["full_watch_count", "INTEGER"],
    ["fast_flip_rate", "REAL"],
    ["yesterday_views_count", "INTEGER"],
    ["product_id", "TEXT"],
    ["product_name", "TEXT"],
    ["product_expose_count", "INTEGER"],
    ["gpm_per_thousand_views", "REAL"],
    ["commerce_product_id", "TEXT"],
    ["product_click_count", "INTEGER"],
    ["paid_gmv_fen", "INTEGER"],
    ["paid_order_count", "INTEGER"],
    ["refund_gmv_fen", "INTEGER"],
    ["refund_order_count", "INTEGER"],
    ["commerce_matched", "INTEGER NOT NULL DEFAULT 0"],
    ["commerce_status", "TEXT NOT NULL DEFAULT 'unknown'"],
    ["feed_id", "TEXT"],
    ["retention_3_sec", "REAL"],
    ["retention_5_sec", "REAL"],
    ["retention_30_sec", "REAL"],
    ["lost_rate_point_count", "INTEGER"],
    ["max_lost_rate_sec", "REAL"],
    ["max_lost_point_retention", "REAL"],
    ["traffic_sources_json", "TEXT"],
    ["fan_type_sources_json", "TEXT"],
  ];
  for (const [name, definition] of additions) {
    if (!existingColumns.has(name)) {
      db().exec(`ALTER TABLE videos ADD COLUMN ${name} ${definition}`);
    }
  }
  const syncStateColumns = new Set(
    (db().prepare("PRAGMA table_info(video_sync_state)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  const syncStateAdditions: Array<[string, string]> = [
    ["last_range", "TEXT"],
    ["request_count", "INTEGER NOT NULL DEFAULT 0"],
    ["detail_request_count", "INTEGER NOT NULL DEFAULT 0"],
    ["skipped_no_cart_count", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [name, definition] of syncStateAdditions) {
    if (!syncStateColumns.has(name)) {
      db().exec(`ALTER TABLE video_sync_state ADD COLUMN ${name} ${definition}`);
    }
  }
  const detailFieldMigration = db()
    .prepare("SELECT value FROM app_meta WHERE key = 'detail_fields_v1'")
    .get() as { value: string } | undefined;
  if (!detailFieldMigration) {
    db().exec(`
      UPDATE videos
      SET commerce_status = 'unknown', commerce_matched = 0
      WHERE commerce_status = 'no_cart'
        AND total_watch_time_sec IS NULL;
      INSERT INTO app_meta (key, value) VALUES ('detail_fields_v1', 'done');
    `);
  }
  const gpmUnitMigration = db()
    .prepare("SELECT value FROM app_meta WHERE key = 'gpm_unit'")
    .get() as { value: string } | undefined;
  if (!gpmUnitMigration) {
    db().exec(`
      UPDATE videos
      SET gpm_per_thousand_views = gpm_per_thousand_views / 100.0
      WHERE gpm_per_thousand_views IS NOT NULL;
      INSERT INTO app_meta (key, value) VALUES ('gpm_unit', 'yuan_v1');
    `);
  }
  const schemaV5 = db()
    .prepare("SELECT value FROM app_meta WHERE key = 'database_schema'")
    .get() as { value: string } | undefined;
  if (schemaV5?.value !== "v5") {
    migrateDatabaseSchemaV5();
  }
}

function computeAccountStatus(statuses: LoginStatus[]): AccountStatus {
  if (statuses.some((status) => status === "checking")) return "checking";
  const known = statuses.filter((status) => status !== "unknown");
  if (known.length === 0) return "unknown";
  if (statuses.every((status) => status === "online")) return "online";
  if (statuses.every((status) => status === "offline")) return "offline";
  return "partial";
}

export function listAccounts(): Account[] {
  const rows = db()
    .prepare(
      `SELECT id, name, group_name, note, created_at, updated_at
       FROM accounts ORDER BY group_name, created_at`,
    )
    .all() as Array<Record<string, string>>;

  const sessionStatement = db().prepare(
    `SELECT platform, status, checked_at, reason
     FROM platform_sessions WHERE account_id = ?`,
  );

  return rows.map((row) => {
    const sessionRows = sessionStatement.all(row.id) as Array<
      Record<string, string | null>
    >;
    const platforms = Object.fromEntries(
      PLATFORMS.map((platform) => {
        const session = sessionRows.find((item) => item.platform === platform);
        return [
          platform,
          {
            status: (session?.status ?? "unknown") as LoginStatus,
            checkedAt: session?.checked_at ?? null,
            reason: session?.reason ?? null,
          },
        ];
      }),
    ) as Account["platforms"];

    return {
      id: row.id,
      name: row.name,
      groupName: row.group_name,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: computeAccountStatus(
        PLATFORMS.map((platform) => platforms[platform].status),
      ),
      platforms,
    };
  });
}

export function createAccount(input: AccountInput): Account {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().exec("BEGIN IMMEDIATE");
  try {
    db()
      .prepare(
        `INSERT INTO accounts (id, name, group_name, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        input.groupName?.trim() ?? "",
        input.note?.trim() ?? "",
        now,
        now,
      );

    const sessionInsert = db().prepare(
      `INSERT INTO platform_sessions (account_id, platform) VALUES (?, ?)`,
    );
    for (const platform of PLATFORMS) {
      sessionInsert.run(id, platform);
    }
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
  return listAccounts().find((account) => account.id === id)!;
}

export function updateAccount(id: string, input: AccountInput): Account {
  db()
    .prepare(
      `UPDATE accounts
       SET name = ?, group_name = ?, note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name.trim(),
      input.groupName?.trim() ?? "",
      input.note?.trim() ?? "",
      new Date().toISOString(),
      id,
    );
  const account = listAccounts().find((item) => item.id === id);
  if (!account) throw new Error("Account not found");
  return account;
}

export function deleteAccount(id: string): void {
  db().prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

export function setPlatformStatus(
  accountId: string,
  platform: Platform,
  status: LoginStatus,
  reason: string | null = null,
): void {
  db()
    .prepare(
      `UPDATE platform_sessions
       SET status = ?, checked_at = ?, reason = ?
       WHERE account_id = ? AND platform = ?`,
    )
    .run(status, new Date().toISOString(), reason, accountId, platform);
}

export function resetPreinvestTestData(accountId: string): void {
  db().exec("BEGIN IMMEDIATE");
  try {
    db()
      .prepare("DELETE FROM snapshot_runs WHERE account_id = ?")
      .run(accountId);
    db().prepare("DELETE FROM videos WHERE account_id = ?").run(accountId);
    db()
      .prepare("DELETE FROM video_sync_state WHERE account_id = ?")
      .run(accountId);
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function saveVideoSyncResult(result: VideoSyncResult): void {
  const preinvest = result as Partial<PreinvestSyncResult>;
  const runId = randomUUID();
  db().exec("BEGIN IMMEDIATE");
  try {
    db()
      .prepare(`
        INSERT INTO snapshot_runs (
          id, account_id, captured_at, range_code, status, video_count,
          platform_total, request_count, detail_request_count,
          skipped_no_cart_count, error_message, created_at
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, NULL, ?)
      `)
      .run(
        runId,
        result.accountId,
        result.syncedAt,
        preinvest.range ?? "fortnight",
        result.syncedCount,
        result.platformTotal,
        preinvest.requestCount ?? 0,
        preinvest.detailRequestCount ?? 0,
        preinvest.skippedNoCartCount ?? 0,
        new Date().toISOString(),
      );
    const upsertVideo = db().prepare(`
      INSERT INTO videos (
        account_id, export_id, title, publish_time, duration_sec,
        views_count, likes_count, comments_count, forwards_count,
        favorites_count, follows_count, completion_rate,
        average_watch_time_sec, total_watch_time_sec, full_watch_count,
        fast_flip_rate, yesterday_views_count,
        product_id, product_name, feed_id, retention_3_sec,
        product_expose_count, commerce_status, commerce_matched,
        gpm_per_thousand_views, commerce_product_id, product_click_count,
        paid_gmv_fen, paid_order_count, refund_gmv_fen, refund_order_count,
        retention_5_sec, retention_30_sec, lost_rate_point_count, max_lost_rate_sec,
        max_lost_point_retention, traffic_sources_json,
        fan_type_sources_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, export_id) DO UPDATE SET
        title = excluded.title,
        publish_time = excluded.publish_time,
        duration_sec = excluded.duration_sec,
        views_count = excluded.views_count,
        likes_count = excluded.likes_count,
        comments_count = excluded.comments_count,
        forwards_count = excluded.forwards_count,
        favorites_count = excluded.favorites_count,
        follows_count = excluded.follows_count,
        completion_rate = excluded.completion_rate,
        average_watch_time_sec = excluded.average_watch_time_sec,
        total_watch_time_sec = COALESCE(
          excluded.total_watch_time_sec, videos.total_watch_time_sec
        ),
        full_watch_count = COALESCE(
          excluded.full_watch_count, videos.full_watch_count
        ),
        fast_flip_rate = excluded.fast_flip_rate,
        yesterday_views_count = excluded.yesterday_views_count,
        product_id = excluded.product_id,
        product_name = excluded.product_name,
        product_expose_count = excluded.product_expose_count,
        commerce_status = CASE
          WHEN excluded.commerce_status = 'unknown' THEN videos.commerce_status
          ELSE excluded.commerce_status
        END,
        commerce_matched = CASE
          WHEN excluded.commerce_status = 'unknown' THEN videos.commerce_matched
          ELSE excluded.commerce_matched
        END,
        gpm_per_thousand_views = excluded.gpm_per_thousand_views,
        commerce_product_id = excluded.commerce_product_id,
        product_click_count = excluded.product_click_count,
        paid_gmv_fen = excluded.paid_gmv_fen,
        paid_order_count = excluded.paid_order_count,
        refund_gmv_fen = excluded.refund_gmv_fen,
        refund_order_count = excluded.refund_order_count,
        feed_id = excluded.feed_id,
        retention_3_sec = excluded.retention_3_sec,
        retention_5_sec = excluded.retention_5_sec,
        retention_30_sec = excluded.retention_30_sec,
        lost_rate_point_count = excluded.lost_rate_point_count,
        max_lost_rate_sec = excluded.max_lost_rate_sec,
        max_lost_point_retention = excluded.max_lost_point_retention,
        traffic_sources_json = COALESCE(
          excluded.traffic_sources_json, videos.traffic_sources_json
        ),
        fan_type_sources_json = excluded.fan_type_sources_json,
        updated_at = excluded.updated_at
    `);
    for (const video of result.videos) {
      upsertVideo.run(
        result.accountId,
        video.exportId,
        video.title,
        video.publishTime,
        video.durationSec,
        video.viewsCount,
        video.likesCount,
        video.commentsCount,
        video.forwardsCount,
        video.favoritesCount,
        video.followsCount,
        video.completionRate,
        video.averageWatchTimeSec,
        video.totalWatchTimeSec,
        video.fullWatchCount,
        video.fastFlipRate,
        video.yesterdayViewsCount,
        video.productId,
        video.productName,
        video.feedId,
        video.retention3Sec,
        video.productExposeCount,
        video.commerceStatus,
        video.commerceMatched ? 1 : 0,
        video.gpmPerThousandViews,
        video.commerceProductId,
        video.productClickCount,
        video.paidGmvYuan === null
          ? null
          : Math.round(video.paidGmvYuan * 100),
        video.paidOrderCount,
        video.refundGmvYuan === null
          ? null
          : Math.round(video.refundGmvYuan * 100),
        video.refundOrderCount,
        video.retention5Sec,
        video.retention30Sec,
        video.lostRatePointCount,
        video.maxLostRateSec,
        video.maxLostPointRetention,
        video.trafficSources === null ? null : JSON.stringify(video.trafficSources),
        video.fanTypeSources === null ? null : JSON.stringify(video.fanTypeSources),
        result.syncedAt,
      );
      db().prepare(`
        INSERT INTO video_snapshots (
          run_id, account_id, export_id, captured_at,
          title, publish_time, duration_sec, feed_id,
          views_count, likes_count, comments_count, forwards_count,
          favorites_count, follows_count, completion_rate,
          average_watch_time_sec, total_watch_time_sec, full_watch_count,
          fast_flip_rate, yesterday_views_count,
          retention_3_sec, retention_5_sec, retention_30_sec,
          lost_rate_point_count, max_lost_rate_sec, max_lost_point_retention,
          traffic_sources_json, fan_type_sources_json,
          commerce_status, product_id, product_name, product_expose_count,
          commerce_product_id, product_click_count, paid_gmv_fen,
          gpm_per_thousand_views, paid_order_count, refund_gmv_fen,
          refund_order_count, list_raw_json, detail_raw_json,
          list_complete, detail_complete, collector_version
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        runId,
        result.accountId,
        video.exportId,
        result.syncedAt,
        video.title,
        video.publishTime,
        video.durationSec,
        video.feedId,
        video.viewsCount,
        video.likesCount,
        video.commentsCount,
        video.forwardsCount,
        video.favoritesCount,
        video.followsCount,
        video.completionRate,
        video.averageWatchTimeSec,
        video.totalWatchTimeSec,
        video.fullWatchCount,
        video.fastFlipRate,
        video.yesterdayViewsCount,
        video.retention3Sec,
        video.retention5Sec,
        video.retention30Sec,
        video.lostRatePointCount,
        video.maxLostRateSec,
        video.maxLostPointRetention,
        video.trafficSources === null ? null : JSON.stringify(video.trafficSources),
        video.fanTypeSources === null ? null : JSON.stringify(video.fanTypeSources),
        video.commerceStatus,
        video.productId,
        video.productName,
        video.productExposeCount,
        video.commerceProductId,
        video.productClickCount,
        video.paidGmvYuan === null
          ? null
          : Math.round(video.paidGmvYuan * 100),
        video.gpmPerThousandViews,
        video.paidOrderCount,
        video.refundGmvYuan === null
          ? null
          : Math.round(video.refundGmvYuan * 100),
        video.refundOrderCount,
        video.listRawJson ?? "{}",
        video.detailRawJson ?? null,
        1,
        video.commerceStatus === "no_cart" || video.detailRawJson ? 1 : 0,
        "compass-v1",
      );
    }
    db()
      .prepare(`
        INSERT INTO video_sync_state (
          account_id, synced_count, platform_total, last_synced_at, last_error,
          last_range, request_count, detail_request_count, skipped_no_cart_count
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
          synced_count = excluded.synced_count,
          platform_total = excluded.platform_total,
          last_synced_at = excluded.last_synced_at,
          last_error = NULL,
          last_range = excluded.last_range,
          request_count = excluded.request_count,
          detail_request_count = excluded.detail_request_count,
          skipped_no_cart_count = excluded.skipped_no_cart_count
      `)
      .run(
        result.accountId,
        result.syncedCount,
        result.platformTotal,
        result.syncedAt,
        preinvest.range ?? null,
        preinvest.requestCount ?? 0,
        preinvest.detailRequestCount ?? 0,
        preinvest.skippedNoCartCount ?? 0,
      );
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function listSnapshotEnabledAccountIds(): string[] {
  const rows = db()
    .prepare(`
      SELECT DISTINCT account_id
      FROM (
        SELECT account_id
        FROM platform_sessions
        WHERE platform = 'compass' AND status = 'online'
        UNION
        SELECT account_id
        FROM snapshot_runs
        WHERE status = 'completed'
      )
    `)
    .all() as Array<{ account_id: string }>;
  return rows.map((row) => row.account_id);
}

export function hasCompletedSnapshotSince(
  accountId: string,
  capturedAtInclusive: string,
): boolean {
  const row = db()
    .prepare(`
      SELECT 1 AS found
      FROM snapshot_runs
      WHERE account_id = ?
        AND status = 'completed'
        AND captured_at >= ?
      LIMIT 1
    `)
    .get(accountId, capturedAtInclusive) as { found: number } | undefined;
  return row?.found === 1;
}

export function savePreinvestSyncResult(result: PreinvestSyncResult): void {
  saveVideoSyncResult(result);
}

export function saveVideoSyncError(accountId: string, message: string): void {
  db()
    .prepare(`
      INSERT INTO video_sync_state (
        account_id, synced_count, platform_total, last_error
      ) VALUES (?, 0, 0, ?)
      ON CONFLICT (account_id) DO UPDATE SET last_error = excluded.last_error
    `)
    .run(accountId, message);
}

export function getKnownCommerceStatuses(
  accountId: string,
): Record<string, CommerceStatus> {
  const rows = db()
    .prepare(`
      SELECT export_id, commerce_status
      FROM videos
      WHERE account_id = ? AND commerce_status IN ('cart', 'no_cart')
    `)
    .all(accountId) as Array<{
    export_id: string;
    commerce_status: CommerceStatus;
  }>;
  return Object.fromEntries(
    rows.map((row) => [row.export_id, row.commerce_status]),
  );
}

export function saveCartVideoAnalysisResult(
  result: CartVideoAnalysisRefreshResult,
): void {
  db().exec("BEGIN IMMEDIATE");
  try {
    const upsertVideo = db().prepare(`
      INSERT INTO videos (
        account_id, export_id, title, publish_time, duration_sec,
        views_count, likes_count, comments_count, forwards_count,
        favorites_count, follows_count, completion_rate,
        average_watch_time_sec, total_watch_time_sec, full_watch_count,
        fast_flip_rate, yesterday_views_count,
        product_id, product_name, feed_id, retention_3_sec,
        product_expose_count, commerce_status, commerce_matched,
        gpm_per_thousand_views, commerce_product_id, product_click_count,
        paid_gmv_fen, paid_order_count, refund_gmv_fen, refund_order_count,
        retention_5_sec, retention_30_sec, lost_rate_point_count,
        max_lost_rate_sec, max_lost_point_retention, traffic_sources_json,
        fan_type_sources_json, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT (account_id, export_id) DO UPDATE SET
        title = excluded.title,
        publish_time = excluded.publish_time,
        views_count = excluded.views_count,
        likes_count = excluded.likes_count,
        comments_count = excluded.comments_count,
        forwards_count = excluded.forwards_count,
        favorites_count = excluded.favorites_count,
        follows_count = excluded.follows_count,
        completion_rate = excluded.completion_rate,
        average_watch_time_sec = excluded.average_watch_time_sec,
        total_watch_time_sec = COALESCE(
          excluded.total_watch_time_sec, videos.total_watch_time_sec
        ),
        full_watch_count = COALESCE(
          excluded.full_watch_count, videos.full_watch_count
        ),
        product_id = excluded.product_id,
        product_name = excluded.product_name,
        feed_id = excluded.feed_id,
        product_expose_count = excluded.product_expose_count,
        commerce_status = excluded.commerce_status,
        commerce_matched = excluded.commerce_matched,
        gpm_per_thousand_views = excluded.gpm_per_thousand_views,
        commerce_product_id = excluded.commerce_product_id,
        product_click_count = excluded.product_click_count,
        paid_gmv_fen = excluded.paid_gmv_fen,
        paid_order_count = excluded.paid_order_count,
        refund_gmv_fen = excluded.refund_gmv_fen,
        refund_order_count = excluded.refund_order_count,
        traffic_sources_json = COALESCE(
          excluded.traffic_sources_json, videos.traffic_sources_json
        ),
        updated_at = excluded.updated_at
    `);
    for (const video of result.videos) {
      upsertVideo.run(
        result.accountId,
        video.exportId,
        video.title,
        video.publishTime,
        video.durationSec,
        video.viewsCount,
        video.likesCount,
        video.commentsCount,
        video.forwardsCount,
        video.favoritesCount,
        video.followsCount,
        video.completionRate,
        video.averageWatchTimeSec,
        video.totalWatchTimeSec,
        video.fullWatchCount,
        video.fastFlipRate,
        video.yesterdayViewsCount,
        video.productId,
        video.productName,
        video.feedId,
        video.retention3Sec,
        video.productExposeCount,
        video.commerceStatus,
        video.commerceMatched ? 1 : 0,
        video.gpmPerThousandViews,
        video.commerceProductId,
        video.productClickCount,
        video.paidGmvYuan === null
          ? null
          : Math.round(video.paidGmvYuan * 100),
        video.paidOrderCount,
        video.refundGmvYuan === null
          ? null
          : Math.round(video.refundGmvYuan * 100),
        video.refundOrderCount,
        video.retention5Sec,
        video.retention30Sec,
        video.lostRatePointCount,
        video.maxLostRateSec,
        video.maxLostPointRetention,
        video.trafficSources === null
          ? null
          : JSON.stringify(video.trafficSources),
        video.fanTypeSources === null
          ? null
          : JSON.stringify(video.fanTypeSources),
        result.syncedAt,
      );
    }

    db()
      .prepare("DELETE FROM cart_video_analysis_items WHERE account_id = ?")
      .run(result.accountId);
    const insertMembership = db().prepare(`
      INSERT INTO cart_video_analysis_items (
        account_id, export_id, refreshed_at
      ) VALUES (?, ?, ?)
    `);
    for (const video of result.videos) {
      if (video.commerceStatus === "cart") {
        insertMembership.run(result.accountId, video.exportId, result.syncedAt);
      }
    }
    const cartCount = result.videos.filter(
      (video) => video.commerceStatus === "cart",
    ).length;
    db()
      .prepare(`
        INSERT INTO cart_video_analysis_state (
          account_id, cart_video_count, scanned_count, platform_total,
          last_synced_at, last_error, request_count, detail_request_count,
          skipped_no_cart_count
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET
          cart_video_count = excluded.cart_video_count,
          scanned_count = excluded.scanned_count,
          platform_total = excluded.platform_total,
          last_synced_at = excluded.last_synced_at,
          last_error = NULL,
          request_count = excluded.request_count,
          detail_request_count = excluded.detail_request_count,
          skipped_no_cart_count = excluded.skipped_no_cart_count
      `)
      .run(
        result.accountId,
        cartCount,
        result.scannedCount,
        result.platformTotal,
        result.syncedAt,
        result.requestCount,
        result.detailRequestCount,
        result.skippedNoCartCount,
      );
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function saveCartVideoAnalysisError(
  accountId: string,
  message: string,
): void {
  db()
    .prepare(`
      INSERT INTO cart_video_analysis_state (
        account_id, cart_video_count, scanned_count, platform_total, last_error
      ) VALUES (?, 0, 0, 0, ?)
      ON CONFLICT (account_id) DO UPDATE SET last_error = excluded.last_error
    `)
    .run(accountId, message);
}

export function saveCommerceSyncResult(result: CommerceSyncResult): void {
  const update = db().prepare(`
    UPDATE videos
    SET gpm_per_thousand_views = ?,
        commerce_product_id = ?,
        product_click_count = ?,
        paid_gmv_fen = ?,
        paid_order_count = ?,
        refund_gmv_fen = ?,
        refund_order_count = ?,
        commerce_matched = 1
    WHERE account_id = ? AND export_id = ?
  `);
  db().exec("BEGIN IMMEDIATE");
  try {
    db()
      .prepare(`
        UPDATE videos
        SET commerce_matched = 0,
            gpm_per_thousand_views = NULL,
            commerce_product_id = NULL,
            product_click_count = NULL,
            paid_gmv_fen = NULL,
            paid_order_count = NULL,
            refund_gmv_fen = NULL,
            refund_order_count = NULL
        WHERE account_id = ?
      `)
      .run(result.accountId);
    for (const video of result.videos) {
      update.run(
        video.gpmPerThousandViews,
        video.commerceProductId,
        video.productClickCount,
        video.paidGmvYuan === null
          ? null
          : Math.round(video.paidGmvYuan * 100),
        video.paidOrderCount,
        video.refundGmvYuan === null
          ? null
          : Math.round(video.refundGmvYuan * 100),
        video.refundOrderCount,
        result.accountId,
        video.exportId,
      );
    }
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

function readVideoSyncState(
  accountId: string,
  source: "preinvest" | "cart-analysis",
): VideoSyncState {
  const state = db()
    .prepare(
      source === "cart-analysis"
        ? `
          SELECT cart_video_count AS synced_count, platform_total,
                 last_synced_at, last_error, NULL AS last_range,
                 request_count, detail_request_count, skipped_no_cart_count
          FROM cart_video_analysis_state WHERE account_id = ?
        `
        : `
          SELECT synced_count, platform_total, last_synced_at, last_error,
                 last_range, request_count, detail_request_count,
                 skipped_no_cart_count
          FROM video_sync_state WHERE account_id = ?
        `,
    )
    .get(accountId) as Record<string, string | number | null> | undefined;
  const videoRows = db()
    .prepare(`
      SELECT v.export_id, v.title, v.publish_time, v.duration_sec,
             views_count, likes_count, comments_count, forwards_count,
             favorites_count, follows_count, completion_rate,
             average_watch_time_sec, total_watch_time_sec, full_watch_count,
             fast_flip_rate, yesterday_views_count,
             v.product_id, product_name, product_expose_count,
             gpm_per_thousand_views,
             commerce_product_id, product_click_count, paid_gmv_fen,
             paid_order_count, refund_gmv_fen, refund_order_count,
             commerce_matched, commerce_status, feed_id,
             retention_3_sec, retention_5_sec,
             retention_30_sec, lost_rate_point_count, max_lost_rate_sec,
             max_lost_point_retention,
             traffic_sources_json, fan_type_sources_json,
             p.product_id AS matched_product_id, p.commission_rate
      FROM videos v
      LEFT JOIN products p
        ON p.account_id = v.account_id AND p.product_id = v.product_id
      WHERE v.account_id = ?
        ${
          source === "cart-analysis"
            ? `AND EXISTS (
                SELECT 1 FROM cart_video_analysis_items selected
                WHERE selected.account_id = v.account_id
                  AND selected.export_id = v.export_id
              )`
            : "AND (? IS NULL OR v.updated_at = ?)"
        }
      ORDER BY v.publish_time DESC
    `)
    .all(
      ...(source === "cart-analysis"
        ? [accountId]
        : [
            accountId,
            state?.last_synced_at ?? null,
            state?.last_synced_at ?? null,
          ]),
    ) as Array<Record<string, string | number | null>>;
  const videos: VideoSummary[] = videoRows.map((row) => ({
    exportId: String(row.export_id),
    feedId: row.feed_id === null ? null : String(row.feed_id),
    title: String(row.title),
    publishTime: String(row.publish_time),
    durationSec: Number(row.duration_sec),
    viewsCount: Number(row.views_count),
    likesCount: Number(row.likes_count),
    commentsCount: Number(row.comments_count),
    forwardsCount: Number(row.forwards_count),
    favoritesCount: Number(row.favorites_count),
    followsCount: Number(row.follows_count),
    completionRate:
      row.completion_rate === null ? null : Number(row.completion_rate),
    averageWatchTimeSec:
      row.average_watch_time_sec === null
        ? null
        : Number(row.average_watch_time_sec),
    totalWatchTimeSec:
      row.total_watch_time_sec === null
        ? null
        : Number(row.total_watch_time_sec),
    fullWatchCount:
      row.full_watch_count === null ? null : Number(row.full_watch_count),
    fastFlipRate:
      row.fast_flip_rate === null ? null : Number(row.fast_flip_rate),
    yesterdayViewsCount:
      row.yesterday_views_count === null
        ? null
        : Number(row.yesterday_views_count),
    retention3Sec:
      row.retention_3_sec === null ? null : Number(row.retention_3_sec),
    retention5Sec:
      row.retention_5_sec === null ? null : Number(row.retention_5_sec),
    retention30Sec:
      row.retention_30_sec === null ? null : Number(row.retention_30_sec),
    lostRatePointCount:
      row.lost_rate_point_count === null
        ? null
        : Number(row.lost_rate_point_count),
    maxLostRateSec:
      row.max_lost_rate_sec === null ? null : Number(row.max_lost_rate_sec),
    maxLostPointRetention:
      row.max_lost_point_retention === null
        ? null
        : Number(row.max_lost_point_retention),
    trafficSources:
      row.traffic_sources_json === null
        ? null
        : JSON.parse(String(row.traffic_sources_json)) as Record<string, number>,
    fanTypeSources:
      row.fan_type_sources_json === null
        ? null
        : JSON.parse(String(row.fan_type_sources_json)) as Record<string, number>,
    productId: row.product_id === null ? null : String(row.product_id),
    productName: row.product_name === null ? null : String(row.product_name),
    productExposeCount:
      row.product_expose_count === null
        ? null
        : Number(row.product_expose_count),
    gpmPerThousandViews:
      row.gpm_per_thousand_views === null
        ? null
        : Number(row.gpm_per_thousand_views),
    commerceProductId:
      row.commerce_product_id === null
        ? null
        : String(row.commerce_product_id),
    productClickCount:
      row.product_click_count === null
        ? null
        : Number(row.product_click_count),
    paidGmvYuan:
      row.paid_gmv_fen === null ? null : Number(row.paid_gmv_fen) / 100,
    paidOrderCount:
      row.paid_order_count === null ? null : Number(row.paid_order_count),
    refundGmvYuan:
      row.refund_gmv_fen === null ? null : Number(row.refund_gmv_fen) / 100,
    refundOrderCount:
      row.refund_order_count === null
        ? null
        : Number(row.refund_order_count),
    commerceMatched: Number(row.commerce_matched) === 1,
    commerceStatus: (row.commerce_status ?? "unknown") as CommerceStatus,
    commissionRate:
      row.commission_rate === null ? null : Number(row.commission_rate),
    commissionDataStatus:
      row.commission_rate !== null
        ? "available"
        : row.matched_product_id === null
          ? "product_not_found"
          : "rate_unavailable",
  }));
  return {
    accountId,
    syncedCount: Number(state?.synced_count ?? 0),
    platformTotal: Number(state?.platform_total ?? 0),
    lastSyncedAt: state?.last_synced_at
      ? String(state.last_synced_at)
      : null,
    lastError: state?.last_error ? String(state.last_error) : null,
    videos,
    range:
      state?.last_range === "fortnight" || state?.last_range === "month"
        ? state.last_range
        : undefined,
    requestCount: Number(state?.request_count ?? 0),
    detailRequestCount: Number(state?.detail_request_count ?? 0),
    skippedNoCartCount: Number(state?.skipped_no_cart_count ?? 0),
  };
}

export function getVideoSyncState(accountId: string): VideoSyncState {
  return readVideoSyncState(accountId, "preinvest");
}

export function getCartVideoAnalysisState(
  accountId: string,
): CartVideoAnalysisState {
  const state = readVideoSyncState(accountId, "cart-analysis");
  const metadata = db()
    .prepare(`
      SELECT scanned_count
      FROM cart_video_analysis_state
      WHERE account_id = ?
    `)
    .get(accountId) as { scanned_count: number } | undefined;
  return { ...state, scannedCount: metadata?.scanned_count ?? 0 };
}

export function getMissingProductIds(
  accountId: string,
  videos: VideoSummary[],
): string[] {
  const requested = [
    ...new Set(
      videos
        .filter((video) => video.commerceStatus === "cart")
        .map((video) => video.productId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (requested.length === 0) return [];
  const exists = db().prepare(
    "SELECT 1 FROM products WHERE account_id = ? AND product_id = ?",
  );
  return requested.filter((productId) => !exists.get(accountId, productId));
}

export function saveProducts(result: ProductSyncResult): void {
  const statement = db().prepare(`
    INSERT INTO products (
      account_id, product_id, out_product_id, title, short_title, shop_name,
      commission_rate, promotion_status, raw_json, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (account_id, product_id) DO UPDATE SET
      out_product_id = COALESCE(excluded.out_product_id, products.out_product_id),
      title = CASE
        WHEN excluded.title = '' THEN products.title
        ELSE excluded.title
      END,
      short_title = CASE
        WHEN excluded.short_title = '' THEN products.short_title
        ELSE excluded.short_title
      END,
      shop_name = CASE
        WHEN excluded.shop_name = '' THEN products.shop_name
        ELSE excluded.shop_name
      END,
      commission_rate = COALESCE(
        excluded.commission_rate, products.commission_rate
      ),
      promotion_status = excluded.promotion_status,
      raw_json = excluded.raw_json,
      synced_at = excluded.synced_at
  `);
  db().exec("BEGIN IMMEDIATE");
  try {
    for (const product of result.products) {
      statement.run(
        result.accountId,
        product.productId,
        product.outProductId,
        product.title,
        product.shortTitle,
        product.shopName,
        product.commissionRate,
        product.promotionStatus,
        product.rawJson,
        result.syncedAt,
      );
    }
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function getProductMaintenanceState(
  accountId: string,
): ProductMaintenanceState {
  const rows = db()
    .prepare(`
      WITH product_business AS (
        SELECT
          account_id,
          product_id,
          COUNT(*) AS cart_video_count,
          SUM(CASE WHEN COALESCE(paid_order_count, 0) > 0 THEN 1 ELSE 0 END)
            AS transacting_video_count,
          SUM(views_count) AS total_views_count,
          SUM(COALESCE(product_click_count, 0)) AS total_product_click_count,
          SUM(COALESCE(paid_order_count, 0)) AS total_paid_order_count,
          SUM(COALESCE(paid_gmv_fen, 0)) AS total_paid_gmv_fen,
          SUM(COALESCE(refund_gmv_fen, 0)) AS total_refund_gmv_fen,
          MAX(publish_time) AS latest_video_publish_time
        FROM videos
        WHERE account_id = ?
          AND commerce_status = 'cart'
          AND product_id IS NOT NULL
        GROUP BY account_id, product_id
      )
      SELECT p.product_id, p.out_product_id, p.title, p.short_title,
             p.shop_name, p.commission_rate, p.promotion_status,
             p.raw_json, p.synced_at,
             COALESCE(b.cart_video_count, 0) AS cart_video_count,
             COALESCE(b.transacting_video_count, 0) AS transacting_video_count,
             COALESCE(b.total_views_count, 0) AS total_views_count,
             COALESCE(b.total_product_click_count, 0) AS total_product_click_count,
             COALESCE(b.total_paid_order_count, 0) AS total_paid_order_count,
             COALESCE(b.total_paid_gmv_fen, 0) AS total_paid_gmv_fen,
             COALESCE(b.total_refund_gmv_fen, 0) AS total_refund_gmv_fen,
             b.latest_video_publish_time
      FROM products p
      LEFT JOIN product_business b
        ON b.account_id = p.account_id AND b.product_id = p.product_id
      WHERE p.account_id = ?
      ORDER BY
        CASE p.promotion_status WHEN 'active' THEN 0 WHEN 'ended' THEN 1 ELSE 2 END,
        total_paid_gmv_fen DESC,
        p.title
    `)
    .all(accountId, accountId) as Array<Record<string, string | number | null>>;
  const businessState = db()
    .prepare(`
      SELECT last_synced_at
      FROM cart_video_analysis_state
      WHERE account_id = ?
    `)
    .get(accountId) as { last_synced_at: string | null } | undefined;
  return {
    accountId,
    products: rows.map((row) => {
      const views = Number(row.total_views_count);
      const clicks = Number(row.total_product_click_count);
      const orders = Number(row.total_paid_order_count);
      const videos = Number(row.cart_video_count);
      const transactingVideos = Number(row.transacting_video_count);
      const paidGmvYuan = Number(row.total_paid_gmv_fen) / 100;
      const refundGmvYuan = Number(row.total_refund_gmv_fen) / 100;
      const netGmvYuan = paidGmvYuan - refundGmvYuan;
      const commissionRate =
        row.commission_rate === null ? null : Number(row.commission_rate);
      const estimatedNetCommissionYuan =
        commissionRate === null ? null : netGmvYuan * commissionRate;
      return {
        productId: String(row.product_id),
        outProductId:
          row.out_product_id === null ? null : String(row.out_product_id),
        title: String(row.title),
        shortTitle: String(row.short_title),
        shopName: String(row.shop_name),
        commissionRate,
        promotionStatus: String(row.promotion_status) as
          | "active"
          | "ended"
          | "unknown",
        rawJson: String(row.raw_json),
        syncedAt: String(row.synced_at),
        cartVideoCount: videos,
        transactingVideoCount: transactingVideos,
        totalViewsCount: views,
        totalProductClickCount: clicks,
        totalPaidOrderCount: orders,
        totalPaidGmvYuan: paidGmvYuan,
        totalRefundGmvYuan: refundGmvYuan,
        netGmvYuan,
        estimatedNetCommissionYuan,
        netCommissionPerThousandViews:
          estimatedNetCommissionYuan === null || views === 0
            ? null
            : (estimatedNetCommissionYuan / views) * 1000,
        viewClickRate: views === 0 ? null : clicks / views,
        clickConversionRate: clicks === 0 ? null : orders / clicks,
        videoConversionRate: videos === 0 ? null : transactingVideos / videos,
        latestVideoPublishTime:
          row.latest_video_publish_time === null
            ? null
            : String(row.latest_video_publish_time),
      };
    }),
    lastSyncedAt:
      rows.length === 0
        ? null
        : rows.reduce(
            (latest, row) =>
              String(row.synced_at) > latest ? String(row.synced_at) : latest,
            "",
          ),
    businessLastSyncedAt: businessState?.last_synced_at ?? null,
  };
}

export function loadTrafficCurveData(accountId: string): {
  videos: Array<{
    exportId: string;
    title: string;
    publishTime: string;
    commerceStatus: CommerceStatus;
    viewsCount: number;
    productClickCount: number | null;
    paidGmvYuan: number | null;
    refundGmvYuan: number | null;
    commissionRate: number | null;
  }>;
  snapshots: Array<{
    exportId: string;
    publishTime: string;
    capturedAt: string;
    viewsCount: number;
    paidGmvYuan: number | null;
    refundGmvYuan: number | null;
    commerceStatus: CommerceStatus;
  }>;
} {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const videos = db()
    .prepare(`
      SELECT v.export_id, v.title, v.publish_time, v.commerce_status,
             v.views_count, v.product_click_count, v.paid_gmv_fen,
             v.refund_gmv_fen, p.commission_rate
      FROM videos v
      LEFT JOIN products p
        ON p.account_id = v.account_id AND p.product_id = v.product_id
      WHERE v.account_id = ? AND v.publish_time >= ?
      ORDER BY v.publish_time DESC
    `)
    .all(accountId, cutoff) as Array<{
      export_id: string;
      title: string;
      publish_time: string;
      commerce_status: CommerceStatus;
      views_count: number;
      product_click_count: number | null;
      paid_gmv_fen: number | null;
      refund_gmv_fen: number | null;
      commission_rate: number | null;
    }>;
  const snapshots = db()
    .prepare(`
      SELECT export_id, publish_time, captured_at, views_count,
             paid_gmv_fen, refund_gmv_fen, commerce_status
      FROM video_snapshots
      WHERE account_id = ?
        AND publish_time >= ?
        AND captured_at >= publish_time
        AND (julianday(captured_at) - julianday(publish_time)) * 24 <= 336.25
      ORDER BY export_id, captured_at
    `)
    .all(accountId, cutoff) as Array<{
      export_id: string;
      publish_time: string;
      captured_at: string;
      views_count: number;
      paid_gmv_fen: number | null;
      refund_gmv_fen: number | null;
      commerce_status: CommerceStatus;
    }>;
  return {
    videos: videos.map((row) => ({
      exportId: row.export_id,
      title: row.title,
      publishTime: row.publish_time,
      commerceStatus: row.commerce_status,
      viewsCount: Number(row.views_count),
      productClickCount:
        row.product_click_count === null ? null : Number(row.product_click_count),
      paidGmvYuan:
        row.paid_gmv_fen === null ? null : Number(row.paid_gmv_fen) / 100,
      refundGmvYuan:
        row.refund_gmv_fen === null ? null : Number(row.refund_gmv_fen) / 100,
      commissionRate:
        row.commission_rate === null ? null : Number(row.commission_rate),
    })),
    snapshots: snapshots.map((row) => ({
      exportId: row.export_id,
      publishTime: row.publish_time,
      capturedAt: row.captured_at,
      viewsCount: row.views_count,
      paidGmvYuan:
        row.paid_gmv_fen === null ? null : Number(row.paid_gmv_fen) / 100,
      refundGmvYuan:
        row.refund_gmv_fen === null ? null : Number(row.refund_gmv_fen) / 100,
      commerceStatus: row.commerce_status,
    })),
  };
}

export function loadTrafficBaseline(
  accountId: string,
  baselineDate: string,
  commerceStatus: "cart" | "no_cart",
): {
  referenceCurve: TrafficReferencePoint[];
  baselineVideoCount: number;
  baselineMode: "cart" | "no_cart";
  generatedAt: string;
  windowDays: number;
  algorithmVersion: string;
  featureVersion: string;
  commerceBaseline: {
    viewClickRate: TrafficMetricDistribution | null;
    thousandViewNetCommissionYuan: TrafficMetricDistribution | null;
    thousandClickNetCommissionYuan: TrafficMetricDistribution | null;
  };
} | null {
  const row = db()
    .prepare(`
      SELECT generated_at, window_days, sample_count, reference_curve_json,
             commerce_baseline_json, algorithm_version, feature_version
      FROM traffic_baseline_versions
      WHERE account_id = ? AND baseline_date = ? AND commerce_status = ?
    `)
    .get(accountId, baselineDate, commerceStatus) as {
      generated_at: string;
      window_days: number;
      sample_count: number;
      reference_curve_json: string;
      commerce_baseline_json: string;
      algorithm_version: string;
      feature_version: string;
    } | undefined;
  if (!row) return null;
  return {
    referenceCurve: JSON.parse(row.reference_curve_json) as TrafficReferencePoint[],
    baselineVideoCount: Number(row.sample_count),
    baselineMode: commerceStatus,
    generatedAt: String(row.generated_at),
    windowDays: Number(row.window_days),
    algorithmVersion: String(row.algorithm_version),
    featureVersion: String(row.feature_version),
    commerceBaseline: {
      viewClickRate: null,
      thousandViewNetCommissionYuan: null,
      thousandClickNetCommissionYuan: null,
      ...(JSON.parse(row.commerce_baseline_json || "{}") as Record<string, unknown>),
    },
  };
}

export function saveTrafficBaseline(
  accountId: string,
  baselineDate: string,
  baseline: {
    referenceCurve: TrafficReferencePoint[];
    baselineVideoCount: number;
    baselineMode: "cart" | "no_cart" | "insufficient";
    generatedAt: string;
    windowDays: number;
    algorithmVersion: string;
    featureVersion: string;
    commerceBaseline: {
      viewClickRate: import("../../../shared/types.js").TrafficMetricDistribution | null;
      thousandViewNetCommissionYuan: import("../../../shared/types.js").TrafficMetricDistribution | null;
      thousandClickNetCommissionYuan: import("../../../shared/types.js").TrafficMetricDistribution | null;
    };
  },
  requestedStatus: "cart" | "no_cart",
): void {
  db().prepare(`
    INSERT INTO traffic_baseline_versions (
      account_id, baseline_date, commerce_status, generated_at,
      window_days, sample_count, reference_curve_json, commerce_baseline_json,
      algorithm_version, feature_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, baseline_date, commerce_status) DO UPDATE SET
      commerce_baseline_json = excluded.commerce_baseline_json
    WHERE traffic_baseline_versions.commerce_baseline_json = '{}'
  `).run(
    accountId,
    baselineDate,
    requestedStatus,
    baseline.generatedAt,
    baseline.windowDays,
    baseline.baselineVideoCount,
    JSON.stringify(baseline.referenceCurve),
    JSON.stringify(baseline.commerceBaseline),
    baseline.algorithmVersion,
    baseline.featureVersion,
  );
}

interface PromoteCapturePersistenceInput {
  accountId: string;
  capturedAt: string;
  requestCount: number;
  orderList: Record<string, unknown>;
  orders: Array<{
    promotionId: string;
    capturedAt: string;
    orderDetail: Record<string, unknown>;
  }>;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown): string | null {
  const seconds = numeric(value);
  return seconds && seconds > 0
    ? new Date(seconds * 1_000).toISOString()
    : null;
}

function parsePromoteDetail(orderDetail: Record<string, unknown>) {
  const detailData = record(orderDetail.data);
  const order = record(detailData.order);
  const info = record(order.orderInfo);
  const indicator = record(order.indicator);
  const payment = record(info.paymentInfo);
  const material = Array.isArray(order.feedMaterialList)
    ? record(order.feedMaterialList[0])
    : {};
  const finder = record(material.finderObject);
  const cart = record(finder.shoppingcartJumpinfo);
  const component = record(finder.finderComponent);
  const miniJump = record(component.miniAppJumpInfo);
  const productPath = textValue(miniJump.path) ?? textValue(cart.path) ?? "";
  const integer = (value: unknown): number | null => {
    const parsed = numeric(value);
    return parsed === null ? null : Math.round(parsed);
  };
  const gmvFen = (key: string): number | null => integer(indicator[key]);
  const count = (key: string): number | null => numeric(indicator[key]);
  return {
    info,
    finder,
    orderName: textValue(info.orderName) ?? "",
    status: numeric(info.status) ?? 0,
    exportStatus: numeric(info.orderApiExportStatus),
    videoExportId: textValue(finder.exportId),
    videoGlobalExportId: textValue(finder.globalExportId),
    videoTitle: textValue(finder.description) ?? "",
    videoCoverUrl: textValue(finder.coverUrl),
    videoPublishedAt: timestamp(finder.createTime),
    hasShoppingCart:
      typeof record(finder.flag).hasShoppingCart === "boolean"
        ? Number(Boolean(record(finder.flag).hasShoppingCart))
        : null,
    productName: textValue(cart.wording) ?? textValue(component.wording),
    cpsProductId:
      textValue(cart.productId) ?? textValue(miniJump.fetchInfoId),
    shopProductId:
      /[?&]productId=([^&]+)/.exec(productPath)?.[1] ?? null,
    target: numeric(info.promotionTarget),
    durationSec: numeric(info.duration),
    promotionType: numeric(info.promotionType),
    pricingMethod: numeric(info.pricingMethod),
    billingMethod: numeric(info.billingMethod),
    budgetWecoinTenths: integer(info.quota),
    createAt: timestamp(info.createTs),
    estimatedStartAt: timestamp(info.estimatedStartts),
    actualStartAt: timestamp(info.actualStartts),
    estimatedEndAt: timestamp(info.estimatedEndts),
    actualEndAt: timestamp(info.actualEndts),
    spentWecoinTenths: integer(indicator.cost),
    paidWecoinTenths:
      numeric(indicator.payAmount) === null
        ? integer(payment.paidWecoinAmount) === null
          ? null
          : Math.round(integer(payment.paidWecoinAmount)! * 10)
        : integer(indicator.payAmount),
    refundedWecoinTenths:
      numeric(indicator.refundAmount) === null
        ? integer(payment.refundWecoinAmount) === null
          ? null
          : Math.round(integer(payment.refundWecoinAmount)! * 10)
        : integer(indicator.refundAmount),
    exposureCount: count("exposureCount"),
    likeCount: count("likeCount"),
    commentCount: count("commentCount"),
    favoriteCount: count("favCount"),
    forwardCount: count("forwardCount"),
    videoFollowCount: count("followCount"),
    bizFollowCount: count("bizFollowCount"),
    productClickPv: count("productClickCountPv"),
    productClickUv: count("productClickCountUv"),
    productOrderCount: count("productOrderCount"),
    productPlaceorderCount: count("feedProductPlaceorderPv"),
    productPlaceorderGmvFen: gmvFen("feedProductPlaceorderGmv"),
    productPayCount: count("feedProductPayPv"),
    productPayGmvFen: gmvFen("feedProductPayGmv"),
    productPayRoi: count("feedProductPayRoi"),
    productNetPayCount: count("feedProductNetPayPv"),
    productNetPayGmvFen: gmvFen("feedProductNetPayGmv"),
    productNetPayRoi: count("feedProductNetPayRoi"),
  };
}

function commissionRateForProduct(
  accountId: string,
  cpsProductId: string | null,
  shopProductId: string | null,
): number | null {
  const product = db().prepare(`
    SELECT commission_rate FROM products
    WHERE account_id = ? AND (
      product_id IN (?, ?) OR out_product_id IN (?, ?)
    )
    ORDER BY synced_at DESC
    LIMIT 1
  `).get(
    accountId,
    cpsProductId,
    shopProductId,
    cpsProductId,
    shopProductId,
  ) as { commission_rate: number | null } | undefined;
  return product?.commission_rate ?? null;
}

const PROMOTE_ORDER_UPSERT_SQL = `
  INSERT INTO promote_orders (
    account_id, promotion_id, order_name, status, export_status,
    video_export_id, video_global_export_id, video_title, video_cover_url,
    video_published_at, has_shopping_cart, product_name, cps_product_id,
    shop_product_id, target, duration_sec, promotion_type, pricing_method,
    billing_method, budget_wecoin_tenths, commission_rate, create_at,
    estimated_start_at, actual_start_at, estimated_end_at, actual_end_at,
    first_seen_at, last_seen_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(account_id, promotion_id) DO UPDATE SET
    order_name = excluded.order_name,
    status = excluded.status,
    export_status = excluded.export_status,
    video_export_id = COALESCE(excluded.video_export_id, video_export_id),
    video_global_export_id =
      COALESCE(excluded.video_global_export_id, video_global_export_id),
    video_title = COALESCE(NULLIF(excluded.video_title, ''), video_title),
    video_cover_url = COALESCE(excluded.video_cover_url, video_cover_url),
    video_published_at =
      COALESCE(excluded.video_published_at, video_published_at),
    has_shopping_cart =
      COALESCE(excluded.has_shopping_cart, has_shopping_cart),
    product_name = COALESCE(excluded.product_name, product_name),
    cps_product_id = COALESCE(excluded.cps_product_id, cps_product_id),
    shop_product_id = COALESCE(excluded.shop_product_id, shop_product_id),
    target = COALESCE(excluded.target, target),
    duration_sec = COALESCE(excluded.duration_sec, duration_sec),
    promotion_type = COALESCE(excluded.promotion_type, promotion_type),
    pricing_method = COALESCE(excluded.pricing_method, pricing_method),
    billing_method = COALESCE(excluded.billing_method, billing_method),
    budget_wecoin_tenths =
      COALESCE(excluded.budget_wecoin_tenths, budget_wecoin_tenths),
    commission_rate = COALESCE(commission_rate, excluded.commission_rate),
    create_at = COALESCE(excluded.create_at, create_at),
    estimated_start_at =
      COALESCE(excluded.estimated_start_at, estimated_start_at),
    actual_start_at = COALESCE(excluded.actual_start_at, actual_start_at),
    estimated_end_at =
      COALESCE(excluded.estimated_end_at, estimated_end_at),
    actual_end_at = COALESCE(excluded.actual_end_at, actual_end_at),
    last_seen_at = excluded.last_seen_at
`;

const PROMOTE_SNAPSHOT_INSERT_SQL = `
  INSERT INTO promote_order_snapshots (
    run_id, account_id, promotion_id, captured_at, status, capture_quality,
    missing_fields_json, spent_wecoin_tenths, paid_wecoin_tenths,
    refunded_wecoin_tenths, exposure_count, like_count,
    comment_count, favorite_count, forward_count, video_follow_count,
    biz_follow_count, product_click_pv, product_click_uv, product_order_count,
    product_placeorder_count, product_placeorder_gmv_fen, product_pay_count,
    product_pay_gmv_fen, product_pay_roi, product_net_pay_count,
    product_net_pay_gmv_fen, product_net_pay_roi, detail_raw_json
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(account_id, promotion_id, captured_at) DO NOTHING
`;

function upsertPromoteOrder(
  accountId: string,
  promotionId: string,
  capturedAt: string,
  parsed: ReturnType<typeof parsePromoteDetail>,
): void {
  db().prepare(PROMOTE_ORDER_UPSERT_SQL).run(
    accountId,
    promotionId,
    parsed.orderName,
    parsed.status,
    parsed.exportStatus,
    parsed.videoExportId,
    parsed.videoGlobalExportId,
    parsed.videoTitle,
    parsed.videoCoverUrl,
    parsed.videoPublishedAt,
    parsed.hasShoppingCart,
    parsed.productName,
    parsed.cpsProductId,
    parsed.shopProductId,
    parsed.target,
    parsed.durationSec,
    parsed.promotionType,
    parsed.pricingMethod,
    parsed.billingMethod,
    parsed.budgetWecoinTenths,
    commissionRateForProduct(
      accountId,
      parsed.cpsProductId,
      parsed.shopProductId,
    ),
    parsed.createAt,
    parsed.estimatedStartAt,
    parsed.actualStartAt,
    parsed.estimatedEndAt,
    parsed.actualEndAt,
    capturedAt,
    capturedAt,
  );
}

function insertPromoteSnapshot(
  runId: string,
  accountId: string,
  promotionId: string,
  capturedAt: string,
  orderDetail: Record<string, unknown>,
  parsed: ReturnType<typeof parsePromoteDetail>,
): void {
  const qualityFields = {
    spent_wecoin_tenths: parsed.spentWecoinTenths,
    exposure_count: parsed.exposureCount,
    product_click_pv: parsed.productClickPv,
    product_net_pay_count: parsed.productNetPayCount,
    product_net_pay_gmv_fen: parsed.productNetPayGmvFen,
  };
  const missingFields = Object.entries(qualityFields)
    .filter(([, value]) => value === null)
    .map(([field]) => field);
  db().prepare(PROMOTE_SNAPSHOT_INSERT_SQL).run(
    runId,
    accountId,
    promotionId,
    capturedAt,
    parsed.status,
    missingFields.length ? "partial" : "complete",
    JSON.stringify(missingFields),
    parsed.spentWecoinTenths,
    parsed.paidWecoinTenths,
    parsed.refundedWecoinTenths,
    parsed.exposureCount,
    parsed.likeCount,
    parsed.commentCount,
    parsed.favoriteCount,
    parsed.forwardCount,
    parsed.videoFollowCount,
    parsed.bizFollowCount,
    parsed.productClickPv,
    parsed.productClickUv,
    parsed.productOrderCount,
    parsed.productPlaceorderCount,
    parsed.productPlaceorderGmvFen,
    parsed.productPayCount,
    parsed.productPayGmvFen,
    parsed.productPayRoi,
    parsed.productNetPayCount,
    parsed.productNetPayGmvFen,
    parsed.productNetPayRoi,
    JSON.stringify(orderDetail),
  );
}

function migrateDatabaseSchemaV5(): void {
  const videoColumns = new Set(
    (db().prepare("PRAGMA table_info(videos)").all() as Array<{ name: string }>)
      .map((column) => column.name),
  );
  const snapshotColumns = new Set(
    (db().prepare("PRAGMA table_info(video_snapshots)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );
  const baselineColumns = new Set(
    (db().prepare("PRAGMA table_info(traffic_baseline_versions)").all() as Array<{
      name: string;
    }>).map((column) => column.name),
  );

  db().exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
  try {
    if (!videoColumns.has("paid_gmv_fen")) {
      db().exec("ALTER TABLE videos ADD COLUMN paid_gmv_fen INTEGER;");
    }
    if (!videoColumns.has("refund_gmv_fen")) {
      db().exec("ALTER TABLE videos ADD COLUMN refund_gmv_fen INTEGER;");
    }
    if (videoColumns.has("paid_gmv_yuan")) {
      db().exec(`
        UPDATE videos
        SET paid_gmv_fen = CAST(ROUND(paid_gmv_yuan * 100) AS INTEGER)
        WHERE paid_gmv_yuan IS NOT NULL;
        ALTER TABLE videos DROP COLUMN paid_gmv_yuan;
      `);
    }
    if (videoColumns.has("refund_gmv_yuan")) {
      db().exec(`
        UPDATE videos
        SET refund_gmv_fen = CAST(ROUND(refund_gmv_yuan * 100) AS INTEGER)
        WHERE refund_gmv_yuan IS NOT NULL;
        ALTER TABLE videos DROP COLUMN refund_gmv_yuan;
      `);
    }

    if (!snapshotColumns.has("paid_gmv_fen")) {
      db().exec("ALTER TABLE video_snapshots ADD COLUMN paid_gmv_fen INTEGER;");
    }
    if (!snapshotColumns.has("refund_gmv_fen")) {
      db().exec("ALTER TABLE video_snapshots ADD COLUMN refund_gmv_fen INTEGER;");
    }
    if (snapshotColumns.has("paid_gmv_yuan")) {
      db().exec(`
        UPDATE video_snapshots
        SET paid_gmv_fen = CAST(ROUND(paid_gmv_yuan * 100) AS INTEGER)
        WHERE paid_gmv_yuan IS NOT NULL;
        ALTER TABLE video_snapshots DROP COLUMN paid_gmv_yuan;
      `);
    }
    if (snapshotColumns.has("refund_gmv_yuan")) {
      db().exec(`
        UPDATE video_snapshots
        SET refund_gmv_fen = CAST(ROUND(refund_gmv_yuan * 100) AS INTEGER)
        WHERE refund_gmv_yuan IS NOT NULL;
        ALTER TABLE video_snapshots DROP COLUMN refund_gmv_yuan;
      `);
    }

    if (!baselineColumns.has("algorithm_version")) {
      db().exec(`
        ALTER TABLE traffic_baseline_versions
        ADD COLUMN algorithm_version TEXT NOT NULL
        DEFAULT 'traffic-baseline-v1';
      `);
    }
    if (!baselineColumns.has("feature_version")) {
      db().exec(`
        ALTER TABLE traffic_baseline_versions
        ADD COLUMN feature_version TEXT NOT NULL
        DEFAULT 'preinvest-features-v1';
      `);
    }

    db().exec(`
      DROP TABLE IF EXISTS video_metric_snapshots;
      DROP TABLE IF EXISTS commerce_metric_snapshots;

      DROP TABLE IF EXISTS promote_actions;
      DROP TABLE IF EXISTS promote_decisions;
      CREATE TABLE promote_decisions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        promotion_id TEXT NOT NULL,
        snapshot_run_id TEXT NOT NULL,
        snapshot_captured_at TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        recommendation TEXT NOT NULL
          CHECK (recommendation IN (
            'continue', 'observe', 'adjust', 'pause', 'stop'
          )),
        risk_level TEXT NOT NULL
          CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        confidence REAL CHECK (
          confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
        ),
        reason_codes_json TEXT NOT NULL DEFAULT '[]',
        explanation TEXT NOT NULL DEFAULT '',
        policy_version TEXT NOT NULL,
        feature_version TEXT NOT NULL,
        valid_until TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id, promotion_id)
          REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE,
        FOREIGN KEY (snapshot_run_id, promotion_id)
          REFERENCES promote_order_snapshots(run_id, promotion_id)
          ON DELETE CASCADE
      ) STRICT;
      CREATE INDEX promote_decisions_order_time
        ON promote_decisions(account_id, promotion_id, decided_at DESC);

      CREATE TABLE promote_actions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        promotion_id TEXT NOT NULL,
        decision_id TEXT,
        requested_at TEXT NOT NULL,
        executed_at TEXT,
        actor_type TEXT NOT NULL
          CHECK (actor_type IN ('human', 'automation')),
        actor_id TEXT,
        action_type TEXT NOT NULL
          CHECK (action_type IN (
            'continue', 'adjust_budget', 'pause', 'resume', 'stop'
          )),
        parameters_json TEXT NOT NULL DEFAULT '{}',
        execution_status TEXT NOT NULL
          CHECK (execution_status IN (
            'pending', 'succeeded', 'failed', 'cancelled'
          )),
        official_result_json TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (account_id, promotion_id)
          REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE,
        FOREIGN KEY (decision_id)
          REFERENCES promote_decisions(id) ON DELETE SET NULL
      ) STRICT;
      CREATE INDEX promote_actions_order_time
        ON promote_actions(account_id, promotion_id, requested_at DESC);

      DELETE FROM promote_capture_runs
      WHERE NOT EXISTS (
        SELECT 1 FROM promote_order_snapshots snapshots
        WHERE snapshots.run_id = promote_capture_runs.id
      );

      CREATE INDEX IF NOT EXISTS videos_account_publish
        ON videos(account_id, publish_time DESC);
      CREATE INDEX IF NOT EXISTS video_snapshots_account_publish
        ON video_snapshots(account_id, publish_time, captured_at);

      INSERT INTO app_meta (key, value)
      VALUES ('database_schema', 'v5')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  } catch (error) {
    db().exec("ROLLBACK; PRAGMA foreign_keys = ON;");
    throw error;
  }
}

function migratePromoteSchemaV3(): void {
  const legacyRows = db().prepare(`
    SELECT run_id, account_id, promotion_id, captured_at, order_detail_json
    FROM promote_order_snapshots
    ORDER BY captured_at
  `).all() as Array<{
    run_id: string;
    account_id: string;
    promotion_id: string;
    captured_at: string;
    order_detail_json: string;
  }>;
  db().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    ALTER TABLE promote_order_snapshots
      RENAME TO promote_order_snapshots_legacy;
    CREATE TABLE promote_order_snapshots (
      run_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      capture_quality TEXT NOT NULL DEFAULT 'complete'
        CHECK (capture_quality IN ('complete', 'partial')),
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      spent_wecoin_tenths INTEGER,
      paid_wecoin_tenths INTEGER,
      refunded_wecoin_tenths INTEGER,
      exposure_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      favorite_count INTEGER,
      forward_count INTEGER,
      video_follow_count INTEGER,
      biz_follow_count INTEGER,
      product_click_pv INTEGER,
      product_click_uv INTEGER,
      product_order_count INTEGER,
      product_placeorder_count INTEGER,
      product_placeorder_gmv_fen INTEGER,
      product_pay_count INTEGER,
      product_pay_gmv_fen INTEGER,
      product_pay_roi REAL,
      product_net_pay_count INTEGER,
      product_net_pay_gmv_fen INTEGER,
      product_net_pay_roi REAL,
      detail_raw_json TEXT,
      PRIMARY KEY (run_id, promotion_id),
      UNIQUE (account_id, promotion_id, captured_at),
      FOREIGN KEY (run_id)
        REFERENCES promote_capture_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id, promotion_id)
        REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE
    ) STRICT;
  `);
  try {
    for (const row of legacyRows) {
      const detail = JSON.parse(row.order_detail_json) as Record<string, unknown>;
      const parsed = parsePromoteDetail(detail);
      upsertPromoteOrder(
        row.account_id,
        row.promotion_id,
        row.captured_at,
        parsed,
      );
      insertPromoteSnapshot(
        row.run_id,
        row.account_id,
        row.promotion_id,
        row.captured_at,
        detail,
        parsed,
      );
    }
    db().exec(`
      DROP TABLE promote_order_snapshots_legacy;
      CREATE INDEX promote_order_snapshots_latest
        ON promote_order_snapshots(
          account_id, promotion_id, captured_at DESC
        );
      INSERT INTO app_meta (key, value)
      VALUES ('promote_snapshot_schema', 'v4')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  } catch (error) {
    db().exec("ROLLBACK; PRAGMA foreign_keys = ON;");
    throw error;
  }
}

function migratePromoteSchemaV4(): void {
  db().exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;

    ALTER TABLE promote_order_snapshots
      RENAME TO promote_order_snapshots_v3;
    ALTER TABLE promote_orders RENAME TO promote_orders_v3;

    CREATE TABLE promote_orders (
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      order_name TEXT NOT NULL DEFAULT '',
      status INTEGER NOT NULL DEFAULT 0,
      export_status INTEGER,
      video_export_id TEXT,
      video_global_export_id TEXT,
      video_title TEXT NOT NULL DEFAULT '',
      video_cover_url TEXT,
      video_published_at TEXT,
      has_shopping_cart INTEGER
        CHECK (has_shopping_cart IN (0, 1) OR has_shopping_cart IS NULL),
      product_name TEXT,
      cps_product_id TEXT,
      shop_product_id TEXT,
      target INTEGER,
      duration_sec INTEGER,
      promotion_type INTEGER,
      pricing_method INTEGER,
      billing_method INTEGER,
      budget_wecoin_tenths INTEGER,
      commission_rate REAL,
      create_at TEXT,
      estimated_start_at TEXT,
      actual_start_at TEXT,
      estimated_end_at TEXT,
      actual_end_at TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (account_id, promotion_id),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    ) STRICT;

    INSERT INTO promote_orders (
      account_id, promotion_id, order_name, status, export_status,
      video_export_id, video_global_export_id, video_title, video_cover_url,
      video_published_at, has_shopping_cart, product_name, cps_product_id,
      shop_product_id, target, duration_sec, promotion_type, pricing_method,
      billing_method, budget_wecoin_tenths, commission_rate, create_at,
      estimated_start_at, actual_start_at, estimated_end_at, actual_end_at,
      first_seen_at, last_seen_at
    )
    SELECT
      account_id, promotion_id, order_name, status, export_status,
      video_export_id, video_global_export_id, video_title, video_cover_url,
      video_published_at, has_shopping_cart, product_name, cps_product_id,
      shop_product_id, target, duration_sec, promotion_type, pricing_method,
      billing_method,
      CASE WHEN budget_wecoin IS NULL THEN NULL
           ELSE CAST(ROUND(budget_wecoin * 10) AS INTEGER) END,
      commission_rate, create_at, estimated_start_at, actual_start_at,
      estimated_end_at, actual_end_at, first_seen_at, last_seen_at
    FROM promote_orders_v3;

    CREATE TABLE promote_order_snapshots (
      run_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      capture_quality TEXT NOT NULL DEFAULT 'complete'
        CHECK (capture_quality IN ('complete', 'partial')),
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      spent_wecoin_tenths INTEGER,
      paid_wecoin_tenths INTEGER,
      refunded_wecoin_tenths INTEGER,
      exposure_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      favorite_count INTEGER,
      forward_count INTEGER,
      video_follow_count INTEGER,
      biz_follow_count INTEGER,
      product_click_pv INTEGER,
      product_click_uv INTEGER,
      product_order_count INTEGER,
      product_placeorder_count INTEGER,
      product_placeorder_gmv_fen INTEGER,
      product_pay_count INTEGER,
      product_pay_gmv_fen INTEGER,
      product_pay_roi REAL,
      product_net_pay_count INTEGER,
      product_net_pay_gmv_fen INTEGER,
      product_net_pay_roi REAL,
      detail_raw_json TEXT,
      PRIMARY KEY (run_id, promotion_id),
      UNIQUE (account_id, promotion_id, captured_at),
      FOREIGN KEY (run_id)
        REFERENCES promote_capture_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id, promotion_id)
        REFERENCES promote_orders(account_id, promotion_id) ON DELETE CASCADE
    ) STRICT;

    INSERT OR IGNORE INTO promote_order_snapshots (
      run_id, account_id, promotion_id, captured_at, status, capture_quality,
      missing_fields_json, spent_wecoin_tenths, paid_wecoin_tenths,
      refunded_wecoin_tenths, exposure_count, like_count, comment_count,
      favorite_count, forward_count, video_follow_count, biz_follow_count,
      product_click_pv, product_click_uv, product_order_count,
      product_placeorder_count, product_placeorder_gmv_fen,
      product_pay_count, product_pay_gmv_fen, product_pay_roi,
      product_net_pay_count, product_net_pay_gmv_fen,
      product_net_pay_roi, detail_raw_json
    )
    SELECT
      run_id, account_id, promotion_id, captured_at, status,
      CASE WHEN spent_wecoin IS NULL OR exposure_count IS NULL
             OR product_click_pv IS NULL OR product_net_pay_count IS NULL
             OR product_net_pay_gmv_yuan IS NULL
           THEN 'partial' ELSE 'complete' END,
      json_array(),
      CASE WHEN spent_wecoin IS NULL THEN NULL
           ELSE CAST(ROUND(spent_wecoin * 10) AS INTEGER) END,
      CASE WHEN paid_wecoin IS NULL THEN NULL
           ELSE CAST(ROUND(paid_wecoin * 10) AS INTEGER) END,
      CASE WHEN refunded_wecoin IS NULL THEN NULL
           ELSE CAST(ROUND(refunded_wecoin * 10) AS INTEGER) END,
      exposure_count, like_count, comment_count, favorite_count,
      forward_count, video_follow_count, biz_follow_count, product_click_pv,
      product_click_uv, product_order_count, product_placeorder_count,
      CASE WHEN product_placeorder_gmv_yuan IS NULL THEN NULL
           ELSE CAST(ROUND(product_placeorder_gmv_yuan * 100) AS INTEGER) END,
      product_pay_count,
      CASE WHEN product_pay_gmv_yuan IS NULL THEN NULL
           ELSE CAST(ROUND(product_pay_gmv_yuan * 100) AS INTEGER) END,
      product_pay_roi, product_net_pay_count,
      CASE WHEN product_net_pay_gmv_yuan IS NULL THEN NULL
           ELSE CAST(ROUND(product_net_pay_gmv_yuan * 100) AS INTEGER) END,
      product_net_pay_roi, detail_raw_json
    FROM promote_order_snapshots_v3
    ORDER BY captured_at DESC;

    DROP TABLE promote_order_snapshots_v3;
    DROP TABLE promote_orders_v3;

    CREATE INDEX promote_order_snapshots_latest
      ON promote_order_snapshots(
        account_id, promotion_id, captured_at DESC
      );
    INSERT INTO app_meta (key, value)
    VALUES ('promote_snapshot_schema', 'v4')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

function statusLabel(status: number): string {
  return (
    {
      0: "未知",
      1: "待支付",
      2: "加热中",
      3: "已完成",
      4: "已取消",
      5: "审核中",
      6: "审核未通过",
      7: "视频已删除",
      8: "订单已结束－主动取消",
      9: "结算中",
      10: "延迟开始",
      11: "已暂停",
    } as Record<number, string>
  )[status] ?? `未知状态（${status}）`;
}

export function savePromoteCapture(
  result: PromoteCapturePersistenceInput,
): void {
  if (result.orders.length === 0) return;
  const runId = randomUUID();
  db().exec("BEGIN IMMEDIATE");
  try {
    db().prepare(`
      INSERT INTO promote_capture_runs (
        id, account_id, captured_at, status, order_count,
        request_count, error_message, created_at
      ) VALUES (?, ?, ?, 'completed', ?, ?, NULL, ?)
    `).run(
      runId,
      result.accountId,
      result.capturedAt,
      result.orders.length,
      result.requestCount,
      new Date().toISOString(),
    );
    for (const order of result.orders) {
      const parsed = parsePromoteDetail(order.orderDetail);
      upsertPromoteOrder(
        result.accountId,
        order.promotionId,
        order.capturedAt,
        parsed,
      );
      insertPromoteSnapshot(
        runId,
        result.accountId,
        order.promotionId,
        order.capturedAt,
        order.orderDetail,
        parsed,
      );
    }
    db().prepare(`
      UPDATE promote_order_snapshots
      SET detail_raw_json = NULL
      WHERE detail_raw_json IS NOT NULL
        AND julianday(captured_at) < julianday('now', '-14 days')
    `).run();
    db().exec("COMMIT");
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}

export function hasCompletedPromoteCaptureSince(
  accountId: string,
  capturedAtInclusive: string,
): boolean {
  return Boolean(
    db().prepare(`
      SELECT 1 FROM promote_capture_runs
      WHERE account_id = ? AND status = 'completed' AND captured_at >= ?
      LIMIT 1
    `).get(accountId, capturedAtInclusive),
  );
}

export function listTrackedPromotionIds(accountId: string): string[] {
  const rows = db().prepare(`
    SELECT promotion_id
    FROM promote_orders
    WHERE account_id = ? AND status IN (1, 2, 5, 9, 10, 11)
  `).all(accountId) as Array<{ promotion_id: string }>;
  return rows.map((row) => row.promotion_id);
}

export function getDuringInvestmentState(
  accountId: string,
  promotionId?: string,
): DuringInvestmentState {
  const latestRun = db().prepare(`
    SELECT captured_at, error_message FROM promote_capture_runs
    WHERE account_id = ? ORDER BY captured_at DESC LIMIT 1
  `).get(accountId) as
    | { captured_at: string; error_message: string | null }
    | undefined;
  const rows = db().prepare(`
    SELECT
      s.*,
      o.order_name,
      o.status AS order_current_status,
      o.export_status,
      o.video_export_id,
      o.video_global_export_id,
      o.video_title,
      o.video_cover_url,
      o.video_published_at,
      o.has_shopping_cart,
      o.product_name,
      o.cps_product_id,
      o.shop_product_id,
      o.target,
      o.duration_sec,
      o.promotion_type,
      o.pricing_method,
      o.billing_method,
      o.budget_wecoin_tenths,
      o.commission_rate,
      o.create_at,
      o.estimated_start_at,
      o.actual_start_at,
      o.estimated_end_at,
      o.actual_end_at
    FROM promote_order_snapshots s
    JOIN promote_orders o
      ON o.account_id = s.account_id
      AND o.promotion_id = s.promotion_id
    JOIN (
      SELECT promotion_id, MAX(captured_at) captured_at
      FROM promote_order_snapshots WHERE account_id = ?
      GROUP BY promotion_id
    ) latest
      ON latest.promotion_id = s.promotion_id
      AND latest.captured_at = s.captured_at
    WHERE s.account_id = ?
    ORDER BY CASE WHEN o.status IN (2, 5, 10, 11) THEN 0 ELSE 1 END,
      s.captured_at DESC
  `).all(accountId, accountId) as Array<Record<string, unknown>>;
  const selected =
    rows.find((row) => row.promotion_id === promotionId) ?? rows[0];
  const candidates = rows.map((row) => {
    const spentTenths = numeric(row.spent_wecoin_tenths);
    const budgetTenths = numeric(row.budget_wecoin_tenths);
    const spendYuan = spentTenths === null ? null : spentTenths / 100;
    const budgetYuan = budgetTenths === null ? null : budgetTenths / 100;
    const netGmvFen = numeric(row.product_net_pay_gmv_fen);
    const netGmvYuan = netGmvFen === null ? null : netGmvFen / 100;
    const rate = numeric(row.commission_rate);
    const commission =
      netGmvYuan === null || rate === null ? null : netGmvYuan * rate;
    const currentStatus = Number(
      row.order_current_status ?? row.status ?? 0,
    );
    const exposureCount = numeric(row.exposure_count);
    return {
      promotionId: String(row.promotion_id),
      orderName: String(row.order_name),
      videoTitle: String(row.video_title),
      status: currentStatus,
      statusLabel: statusLabel(currentStatus),
      capturedAt: String(row.captured_at),
      productName: textValue(row.product_name),
      spendYuan,
      budgetYuan,
      budgetRate:
        spendYuan === null || !budgetYuan ? null : spendYuan / budgetYuan,
      productClickPv: numeric(row.product_click_pv),
      productPayCount: numeric(row.product_pay_count),
      netGmvYuan,
      estimatedNetCommissionYuan: commission,
      netProfitYuan:
        commission === null || spendYuan === null ? null : commission - spendYuan,
      commissionRoi:
        commission === null || !spendYuan ? null : commission / spendYuan,
      costPerThousandExposureYuan:
        spendYuan === null || !exposureCount
          ? null
          : (spendYuan / exposureCount) * 1_000,
    };
  });
  const timelineRows = selected
    ? (db().prepare(`
        SELECT *
        FROM promote_order_snapshot_deltas
        WHERE account_id = ? AND promotion_id = ?
        ORDER BY captured_at
      `).all(accountId, String(selected.promotion_id)) as Array<
        Record<string, unknown>
      >)
    : [];
  const commissionRate = selected ? numeric(selected.commission_rate) : null;
  return {
    accountId,
    lastCapturedAt: latestRun?.captured_at ?? null,
    lastError: latestRun?.error_message ?? null,
    candidates,
    current: selected ? normalizePromoteSnapshot(selected) : null,
    timeline: timelineRows.map((row) =>
      normalizePromoteTimelinePoint(row, commissionRate),
    ),
  };
}

function normalizePromoteTimelinePoint(
  row: Record<string, unknown>,
  commissionRate: number | null,
): DuringOrderTimelinePoint {
  const yuanFromWecoinTenths = (value: unknown): number | null => {
    const raw = numeric(value);
    return raw === null ? null : raw / 100;
  };
  const yuanFromFen = (value: unknown): number | null => {
    const raw = numeric(value);
    return raw === null ? null : raw / 100;
  };
  const spendYuan = yuanFromWecoinTenths(row.spent_wecoin_tenths);
  const netGmvYuan = yuanFromFen(row.product_net_pay_gmv_fen);
  const estimatedNetCommissionYuan =
    netGmvYuan === null || commissionRate === null
      ? null
      : netGmvYuan * commissionRate;
  const hasRegression = numeric(row.has_counter_regression) === 1;
  const delta = (value: unknown, divisor = 1): number | null => {
    if (hasRegression) return null;
    const parsed = numeric(value);
    return parsed === null ? null : parsed / divisor;
  };
  return {
    capturedAt: String(row.captured_at),
    status: Number(row.status ?? 0),
    statusLabel: statusLabel(Number(row.status ?? 0)),
    intervalSeconds: numeric(row.interval_seconds),
    cumulative: {
      spendYuan,
      exposureCount: numeric(row.exposure_count),
      productClickPv: numeric(row.product_click_pv),
      productPayCount: numeric(row.product_pay_count),
      productNetPayCount: numeric(row.product_net_pay_count),
      netGmvYuan,
      estimatedNetCommissionYuan,
      netProfitYuan:
        spendYuan === null || estimatedNetCommissionYuan === null
          ? null
          : estimatedNetCommissionYuan - spendYuan,
    },
    delta: {
      spendYuan: delta(row.delta_spent_wecoin_tenths, 100),
      exposureCount: delta(row.delta_exposure_count),
      productClickPv: delta(row.delta_product_click_pv),
      productPayCount: delta(row.delta_product_pay_count),
      productNetPayCount: delta(row.delta_product_net_pay_count),
      netGmvYuan: delta(row.delta_product_net_pay_gmv_fen, 100),
    },
    quality: hasRegression
      ? "counter_regression"
      : row.capture_quality === "partial"
        ? "partial"
        : "complete",
  };
}

function normalizePromoteSnapshot(
  row: Record<string, unknown>,
): DuringOrderCurrentSnapshot {
  const status = Number(row.status ?? 0);
  const toWecoin = (value: unknown): number | null => {
    const raw = numeric(value);
    return raw === null ? null : raw / 10;
  };
  const fenToYuan = (value: unknown): number | null => {
    const raw = numeric(value);
    return raw === null ? null : raw / 100;
  };
  const spentWecoin = toWecoin(row.spent_wecoin_tenths);
  const spendYuan = spentWecoin === null ? null : spentWecoin / 10;
  const netGmvYuan = fenToYuan(row.product_net_pay_gmv_fen);
  const commissionRate = numeric(row.commission_rate);
  const estimatedNetCommissionYuan =
    netGmvYuan === null || commissionRate === null
      ? null
      : netGmvYuan * commissionRate;
  const exposureCount = numeric(row.exposure_count);
  const productClickPv = numeric(row.product_click_pv);
  return {
    accountId: String(row.account_id),
    promotionId: String(row.promotion_id),
    capturedAt: String(row.captured_at),
    orderName: String(row.order_name ?? ""),
    status,
    statusLabel: statusLabel(status),
    exportStatus: numeric(row.export_status),
    video: {
      exportId: textValue(row.video_export_id),
      globalExportId: textValue(row.video_global_export_id),
      title: String(row.video_title ?? ""),
      coverUrl: textValue(row.video_cover_url),
      publishedAt: textValue(row.video_published_at),
      hasShoppingCart:
        numeric(row.has_shopping_cart) === null
          ? null
          : Boolean(numeric(row.has_shopping_cart)),
    },
    product: {
      name: textValue(row.product_name),
      cpsProductId: textValue(row.cps_product_id),
      shopProductId: textValue(row.shop_product_id),
    },
    configuration: {
      target: numeric(row.target),
      targetLabel:
        numeric(row.target) === 7
          ? "商品点击数"
          : `目标 ${numeric(row.target) ?? "—"}`,
      durationSec: numeric(row.duration_sec),
      promotionType: numeric(row.promotion_type),
      promotionTypeLabel:
        numeric(row.promotion_type) === 1 ? "短视频加热" : "其他",
      pricingMethod: numeric(row.pricing_method),
      pricingMethodLabel:
        numeric(row.pricing_method) === 1 ? "放量加热" : "其他",
      billingMethod: numeric(row.billing_method),
      billingMethodLabel:
        numeric(row.billing_method) === 0 ? "预先扣费" : "其他",
      createAt: textValue(row.create_at),
      estimatedStartAt: textValue(row.estimated_start_at),
      actualStartAt: textValue(row.actual_start_at),
      estimatedEndAt: textValue(row.estimated_end_at),
      actualEndAt: textValue(row.actual_end_at),
    },
    funds: {
      budgetWecoin: toWecoin(row.budget_wecoin_tenths),
      spentWecoin,
      paidWecoin: toWecoin(row.paid_wecoin_tenths),
      refundedWecoin: toWecoin(row.refunded_wecoin_tenths),
    },
    effects: {
      exposureCount,
      likeCount: numeric(row.like_count),
      commentCount: numeric(row.comment_count),
      favoriteCount: numeric(row.favorite_count),
      forwardCount: numeric(row.forward_count),
      videoFollowCount: numeric(row.video_follow_count),
      bizFollowCount: numeric(row.biz_follow_count),
      productClickPv,
      productClickUv: numeric(row.product_click_uv),
      productOrderCount: numeric(row.product_order_count),
      productPlaceorderCount: numeric(row.product_placeorder_count),
      productPlaceorderGmvYuan: fenToYuan(
        row.product_placeorder_gmv_fen,
      ),
      productPayCount: numeric(row.product_pay_count),
      productPayGmvYuan: fenToYuan(row.product_pay_gmv_fen),
      productPayRoi: numeric(row.product_pay_roi),
      productNetPayCount: numeric(row.product_net_pay_count),
      productNetPayGmvYuan: netGmvYuan,
      productNetPayRoi: numeric(row.product_net_pay_roi),
    },
    calculated: {
      wecoinPerYuan: 10,
      spendYuan,
      netGmvYuan,
      commissionRate,
      estimatedNetCommissionYuan,
      netProfitYuan:
        estimatedNetCommissionYuan === null || spendYuan === null
          ? null
          : estimatedNetCommissionYuan - spendYuan,
      commissionRoi:
        estimatedNetCommissionYuan === null || !spendYuan
          ? null
          : estimatedNetCommissionYuan / spendYuan,
      costPerThousandExposureYuan:
        spendYuan === null || !exposureCount
          ? null
          : (spendYuan / exposureCount) * 1_000,
      costPerProductClickYuan:
        spendYuan === null || !productClickPv
          ? null
          : spendYuan / productClickPv,
    },
  };
}

export function closeDatabase(): void {
  database?.close();
  database = null;
}
