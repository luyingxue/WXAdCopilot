import writeXlsxFile from "write-excel-file/node";
import type { CellObject, SheetData } from "write-excel-file/node";
import type { ProductMaintenanceState } from "../../../shared/types.js";

const HEADERS = [
  "商品ID",
  "外部商品ID",
  "商品名称",
  "商品短标题",
  "商家/店铺",
  "佣金比例",
  "推广状态",
  "挂车视频数",
  "有成交视频数",
  "视频成交率",
  "累计观看",
  "累计商品点击",
  "观看点击率",
  "累计成交订单",
  "点击成交率",
  "累计成交金额",
  "累计退款金额",
  "累计净成交金额",
  "估算累计净佣金",
  "千次观看净佣金",
  "最近挂车视频发布时间",
  "商品资料更新时间",
  "经营数据更新时间",
] as const;

function numberCell(value: number | null, format = "#,##0"): CellObject {
  return {
    value: value === null ? undefined : value,
    type: Number,
    format,
    align: "right",
  };
}

function dateCell(value: string | null): CellObject {
  return {
    value: value ? new Date(value) : undefined,
    type: Date,
    format: "yyyy-mm-dd hh:mm:ss",
  };
}

export async function exportProductAnalysisToExcel(
  filePath: string,
  state: ProductMaintenanceState,
): Promise<void> {
  const header: CellObject[] = HEADERS.map((value) => ({
    value,
    type: String,
    fontWeight: "bold",
    backgroundColor: "#176B55",
    textColor: "#FFFFFF",
    align: "center",
    wrap: true,
  }));
  const rows: SheetData = [
    header,
    ...state.products.map((product): CellObject[] => [
      { value: product.productId, type: String },
      { value: product.outProductId ?? "", type: String },
      { value: product.title, type: String, wrap: true },
      { value: product.shortTitle, type: String, wrap: true },
      { value: product.shopName, type: String, wrap: true },
      numberCell(product.commissionRate, "0.00%"),
      {
        value:
          product.promotionStatus === "active"
            ? "推广中"
            : product.promotionStatus === "ended"
              ? "已结束"
              : "未知",
        type: String,
      },
      numberCell(product.cartVideoCount),
      numberCell(product.transactingVideoCount),
      numberCell(product.videoConversionRate, "0.00%"),
      numberCell(product.totalViewsCount),
      numberCell(product.totalProductClickCount),
      numberCell(product.viewClickRate, "0.00%"),
      numberCell(product.totalPaidOrderCount),
      numberCell(product.clickConversionRate, "0.00%"),
      numberCell(product.totalPaidGmvYuan, '"¥"#,##0.00'),
      numberCell(product.totalRefundGmvYuan, '"¥"#,##0.00'),
      numberCell(product.netGmvYuan, '"¥"#,##0.00'),
      numberCell(product.estimatedNetCommissionYuan, '"¥"#,##0.00'),
      numberCell(product.netCommissionPerThousandViews, '"¥"#,##0.00'),
      dateCell(product.latestVideoPublishTime),
      dateCell(product.syncedAt),
      dateCell(state.businessLastSyncedAt),
    ]),
  ];
  const notes: SheetData = [
    [
      {
        value: "商品经营分析口径说明",
        type: String,
        fontWeight: "bold",
        backgroundColor: "#176B55",
        textColor: "#FFFFFF",
      },
      { value: "定义", type: String, fontWeight: "bold" },
    ],
    [
      { value: "数据范围", type: String, fontWeight: "bold" },
      {
        value: "本账号已入库的全部历史挂车视频；每条视频只取当前最新累计值。",
        type: String,
        wrap: true,
      },
    ],
    [
      { value: "累计净成交金额", type: String, fontWeight: "bold" },
      { value: "累计成交金额－累计退款金额", type: String },
    ],
    [
      { value: "估算累计净佣金", type: String, fontWeight: "bold" },
      {
        value: "累计净成交金额 × 当前佣金比例；并非官方最终结算佣金。",
        type: String,
        wrap: true,
      },
    ],
    [
      { value: "千次观看净佣金", type: String, fontWeight: "bold" },
      { value: "估算累计净佣金 ÷ 累计观看 × 1000", type: String },
    ],
    [
      { value: "视频成交率", type: String, fontWeight: "bold" },
      { value: "有成交视频数 ÷ 挂车视频数", type: String },
    ],
    [
      { value: "经营数据更新时间", type: String, fontWeight: "bold" },
      { value: state.businessLastSyncedAt ?? "尚未完整刷新", type: String },
    ],
  ];
  const output = await writeXlsxFile([
    {
      data: rows,
      sheet: "商品经营分析",
      columns: HEADERS.map((_, index) => ({
        width:
          index === 2 ? 42
          : index === 3 || index === 4 ? 26
          : index === 0 || index === 1 ? 22
          : index >= 20 ? 20
          : 15,
      })),
      stickyRowsCount: 1,
      stickyColumnsCount: 5,
      showGridLines: false,
    },
    {
      data: notes,
      sheet: "口径说明",
      columns: [{ width: 24 }, { width: 70 }],
      showGridLines: false,
    },
  ]);
  await output.toFile(filePath);
}
