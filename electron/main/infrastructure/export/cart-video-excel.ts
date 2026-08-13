import writeXlsxFile from "write-excel-file/node";
import type {
  CellObject,
  SheetData,
} from "write-excel-file/node";
import type { VideoSummary } from "../../../shared/types.js";

const HEADERS = [
  "视频ID",
  "Feed ID",
  "视频标题",
  "发布时间",
  "累计播放",
  "累计观看秒数",
  "平均观看秒数",
  "累计完播",
  "完播率",
  "流量来源",
  "爱心赞",
  "拇指赞",
  "评论",
  "转发",
  "关注",
  "互动总数",
  "互动率",
  "关注率",
  "商品ID",
  "商品名称",
  "佣金比例",
  "佣金数据状态",
  "商品曝光",
  "商品点击",
  "观看点击率",
  "成交金额",
  "GPM",
  "成交订单",
  "点击成交率",
  "退款金额",
  "退款订单",
  "订单退款率",
  "净成交额",
  "预估净佣金",
  "千次观看净佣金",
  "千次点击净佣金",
];

function numberCell(
  value: number | null,
  format = "#,##0",
): CellObject {
  return {
    value: value === null ? undefined : value,
    type: Number,
    format,
    align: "right",
  };
}

function rowFor(video: VideoSummary): CellObject[] {
  const interactions =
    video.likesCount +
    video.favoritesCount +
    video.commentsCount +
    video.forwardsCount;
  const interactionRate =
    video.viewsCount > 0 ? interactions / video.viewsCount : null;
  const followRate =
    video.viewsCount > 0 ? video.followsCount / video.viewsCount : null;
  const viewClickRate =
    video.viewsCount > 0 && video.productClickCount !== null
      ? video.productClickCount / video.viewsCount
      : null;
  const conversionRate =
    (video.productClickCount ?? 0) > 0 && video.paidOrderCount !== null
      ? video.paidOrderCount / video.productClickCount!
      : null;
  const refundRate =
    (video.paidOrderCount ?? 0) > 0 && video.refundOrderCount !== null
      ? video.refundOrderCount / video.paidOrderCount!
      : null;
  const netGmv =
    video.paidGmvYuan === null
      ? null
      : video.paidGmvYuan - (video.refundGmvYuan ?? 0);
  const netCommission =
    netGmv === null || video.commissionRate === null
      ? null
      : netGmv * video.commissionRate;
  const thousandViewNetCommission =
    netCommission === null || video.viewsCount === 0
      ? null
      : (netCommission / video.viewsCount) * 1000;
  const thousandClickNetCommission =
    netCommission === null || (video.productClickCount ?? 0) === 0
      ? null
      : (netCommission / video.productClickCount!) * 1000;
  const traffic = video.trafficSources
    ? Object.entries(video.trafficSources)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} ${count}`)
        .join(" / ")
    : "";
  return [
    { value: video.exportId, type: String },
    { value: video.feedId ?? "", type: String },
    { value: video.title, type: String, wrap: true },
    {
      value: new Date(video.publishTime),
      type: Date,
      format: "yyyy-mm-dd hh:mm:ss",
    },
    numberCell(video.viewsCount),
    numberCell(video.totalWatchTimeSec, "#,##0.0"),
    numberCell(video.averageWatchTimeSec, "#,##0.0"),
    numberCell(video.fullWatchCount),
    numberCell(video.completionRate, "0.00%"),
    { value: traffic, type: String, wrap: true },
    numberCell(video.likesCount),
    numberCell(video.favoritesCount),
    numberCell(video.commentsCount),
    numberCell(video.forwardsCount),
    numberCell(video.followsCount),
    numberCell(interactions),
    numberCell(interactionRate, "0.00%"),
    numberCell(followRate, "0.00%"),
    { value: video.productId ?? "", type: String },
    { value: video.productName ?? "", type: String, wrap: true },
    numberCell(video.commissionRate, "0.00%"),
    {
      value:
        video.commissionRate !== null
          ? "已获取"
          : video.commissionDataStatus === "product_not_found"
            ? "商品已不在当前橱窗"
            : "官方未提供佣金比例",
      type: String,
    },
    numberCell(video.productExposeCount),
    numberCell(video.productClickCount),
    numberCell(viewClickRate, "0.00%"),
    numberCell(video.paidGmvYuan, '"¥"#,##0.00'),
    numberCell(video.gpmPerThousandViews, '"¥"#,##0.00'),
    numberCell(video.paidOrderCount),
    numberCell(conversionRate, "0.00%"),
    numberCell(video.refundGmvYuan, '"¥"#,##0.00'),
    numberCell(video.refundOrderCount),
    numberCell(refundRate, "0.00%"),
    numberCell(netGmv, '"¥"#,##0.00'),
    numberCell(netCommission, '"¥"#,##0.00'),
    numberCell(thousandViewNetCommission, '"¥"#,##0.00'),
    numberCell(thousandClickNetCommission, '"¥"#,##0.00'),
  ];
}

export async function exportCartVideosToExcel(
  filePath: string,
  videos: VideoSummary[],
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
  const rows: SheetData = [header, ...videos.map(rowFor)];
  const columns = HEADERS.map((_, index) => ({
    width:
      index === 2 || index === 19
        ? 36
        : index === 0 || index === 1 || index === 18
          ? 24
          : index === 3 || index === 9
            ? 20
            : 14,
  }));
  const output = await writeXlsxFile(rows, {
    columns,
    stickyRowsCount: 1,
    stickyColumnsCount: 3,
    sheet: "带货视频分析",
  });
  await output.toFile(filePath);
}
