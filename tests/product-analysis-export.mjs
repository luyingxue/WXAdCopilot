import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { exportProductAnalysisToExcel } from "../dist-electron/main/infrastructure/export/product-analysis-excel.js";

const directory = await mkdtemp(path.join(tmpdir(), "wxad-product-export-"));
const filePath =
  process.env.WXAD_PRODUCT_EXPORT_PATH ??
  path.join(directory, "product-analysis.xlsx");

try {
  await exportProductAnalysisToExcel(filePath, {
    accountId: "test-account",
    lastSyncedAt: "2026-08-05T00:00:00.000Z",
    businessLastSyncedAt: "2026-08-05T00:10:00.000Z",
    products: [
      {
        productId: "product-1",
        outProductId: "out-product-1",
        title: "测试商品全称",
        shortTitle: "测试商品",
        shopName: "测试店铺",
        commissionRate: 0.4,
        promotionStatus: "active",
        rawJson: "{}",
        syncedAt: "2026-08-05T00:00:00.000Z",
        cartVideoCount: 3,
        transactingVideoCount: 2,
        totalViewsCount: 10000,
        totalProductClickCount: 500,
        totalPaidOrderCount: 20,
        totalPaidGmvYuan: 2000,
        totalRefundGmvYuan: 100,
        netGmvYuan: 1900,
        estimatedNetCommissionYuan: 760,
        netCommissionPerThousandViews: 76,
        viewClickRate: 0.05,
        clickConversionRate: 0.04,
        videoConversionRate: 2 / 3,
        latestVideoPublishTime: "2026-08-04T12:00:00.000Z",
      },
    ],
  });
  const bytes = await readFile(filePath);
  if (bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error("Product analysis export is not a valid XLSX container");
  }
  console.log("Product analysis export test passed", { bytes: bytes.length });
} finally {
  await rm(directory, { recursive: true, force: true });
}
