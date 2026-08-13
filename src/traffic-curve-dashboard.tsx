import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type {
  TrafficCurveAnalysis,
  TrafficMetricDistribution,
  TrafficReferencePoint,
  VideoSummary,
} from "../electron/shared/types";
import {
  calculatePreinvestCommerce,
  decidePreinvestCandidate,
} from "./preinvest-metrics";

type TooltipParameter = {
  seriesName: string;
  value: [number, number];
  color: string;
};

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("zh-CN");
}

function formatAge(hours: number): string {
  if (hours >= 24) {
    const days = hours / 24;
    return Number.isInteger(days)
      ? `${days}天`
      : `${days.toFixed(1)}天`;
  }
  return Number.isInteger(hours) ? `${hours}小时` : `${hours.toFixed(1)}小时`;
}

function formatMoment(publishTime: string, ageHours: number): string {
  const date = new Date(new Date(publishTime).getTime() + ageHours * 3_600_000);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function nearestReference(
  points: TrafficReferencePoint[],
  ageHours: number,
): TrafficReferencePoint | undefined {
  return [...points]
    .reverse()
    .find((point) => point.ageHours <= ageHours + 0.01);
}

function percentileLabel(analysis: TrafficCurveAnalysis): string {
  const current = analysis.currentCurve.at(-1);
  const reference = current
    ? nearestReference(analysis.referenceCurve, current.ageHours)
    : undefined;
  if (!current || !reference || analysis.currentPercentile === null) return "—";
  if (current.viewsCount > reference.p75 && reference.p90 === null) {
    return "> P75";
  }
  return `P${Math.round(analysis.currentPercentile)}`;
}

function metricPercentile(
  value: number | null,
  baseline: TrafficMetricDistribution | null,
): number | null {
  if (value === null || !baseline) return null;
  if (value <= baseline.p25) {
    return baseline.p25 <= 0 ? 25 : Math.max(1, (value / baseline.p25) * 25);
  }
  if (value <= baseline.p50) {
    return 25 + ((value - baseline.p25) /
      Math.max(Number.EPSILON, baseline.p50 - baseline.p25)) * 25;
  }
  if (value <= baseline.p75) {
    return 50 + ((value - baseline.p50) /
      Math.max(Number.EPSILON, baseline.p75 - baseline.p50)) * 25;
  }
  return Math.min(99, 75 + ((value / Math.max(Number.EPSILON, baseline.p75)) - 1) * 25);
}

function CommerceBenchmarkChart({
  metrics,
  baselines,
  clicks,
}: {
  metrics: {
    viewClickRate: number | null;
    thousandViewNetCommissionYuan: number | null;
    thousandClickNetCommissionYuan: number | null;
  };
  baselines: TrafficCurveAnalysis["commerceBaseline"];
  clicks: number;
}) {
  const chartElement = useRef<HTMLDivElement>(null);
  const option = useMemo<EChartsOption>(() => {
    const rows = [
      {
        title: "观看点击率",
        value: metrics.viewClickRate,
        baseline: baselines.viewClickRate,
        format: (value: number) => `${(value * 100).toFixed(2)}%`,
        confidence: "按观看量判断",
      },
      {
        title: "千次观看净佣金",
        value: metrics.thousandViewNetCommissionYuan,
        baseline: baselines.thousandViewNetCommissionYuan,
        format: (value: number) => `¥${value.toFixed(2)}`,
        confidence: "综合商业效率",
      },
      {
        title: "千次点击净佣金",
        value: metrics.thousandClickNetCommissionYuan,
        baseline: baselines.thousandClickNetCommissionYuan,
        format: (value: number) => `¥${value.toFixed(2)}`,
        confidence: clicks >= 30 ? `点击${clicks} · 可信` : `点击${clicks} · 低样本`,
      },
    ];
    const grid = rows.map((_, index) => ({
      left: 160,
      right: 205,
      top: 34 + index * 90,
      height: 42,
    }));
    const xAxis = rows.map((row, index) => {
      const baseline = row.baseline;
      const iqr = baseline ? Math.max(0, baseline.p75 - baseline.p25) : 0;
      const lower = baseline ? Math.max(0, baseline.p25 - iqr * 1.5) : 0;
      const upper = baseline ? baseline.p75 + iqr * 1.5 : 1;
      const maximum = Math.max(upper, row.value ?? 0, Number.EPSILON);
      return {
        type: "value" as const,
        gridIndex: index,
        min: lower,
        max: maximum * 1.08,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      };
    });
    const yAxis = rows.map((row, index) => ({
      type: "category" as const,
      gridIndex: index,
      data: [row.title],
      axisLabel: {
        color: "#384c44",
        fontSize: 12,
        fontWeight: 600,
        margin: 18,
      },
      axisLine: { show: false },
      axisTick: { show: false },
    }));
    const series = rows.flatMap((row, index) => {
      if (!row.baseline) return [];
      const iqr = Math.max(0, row.baseline.p75 - row.baseline.p25);
      const lower = Math.max(0, row.baseline.p25 - iqr * 1.5);
      const upper = row.baseline.p75 + iqr * 1.5;
      const percentile = metricPercentile(row.value, row.baseline);
      return [
        {
          name: `${row.title}历史分布`,
          type: "boxplot" as const,
          xAxisIndex: index,
          yAxisIndex: index,
          data: [[lower, row.baseline.p25, row.baseline.p50, row.baseline.p75, upper]],
          itemStyle: {
            color: "#dcece6",
            borderColor: "#66857a",
            borderWidth: 1.5,
          },
          tooltip: {
            formatter: () =>
              `<div class="commerce-chart-tooltip">
                <strong>${row.title} · 近30天基准</strong>
                <span>P25　${row.format(row.baseline!.p25)}</span>
                <span>P50　${row.format(row.baseline!.p50)}</span>
                <span>P75　${row.format(row.baseline!.p75)}</span>
                <small>有效样本 ${row.baseline!.sampleCount} 条</small>
              </div>`,
          },
        },
        ...(row.value === null
          ? []
          : [{
              name: `${row.title}当前视频`,
              type: "scatter" as const,
              xAxisIndex: index,
              yAxisIndex: index,
              data: [[row.value, row.title]],
              symbolSize: 16,
              itemStyle: {
                color: "#0d8059",
                borderColor: "#fff",
                borderWidth: 3,
                shadowColor: "rgba(13, 128, 89, 0.25)",
                shadowBlur: 8,
              },
              label: {
                show: true,
                position: "right" as const,
                distance: 12,
                formatter: `${row.format(row.value)}  ·  ${
                  percentile === null ? "—" : `P${Math.round(percentile)}`
                }\n${row.confidence}`,
                color: "#31483f",
                fontSize: 11,
                lineHeight: 17,
              },
              tooltip: {
                formatter: () =>
                  `<div class="commerce-chart-tooltip">
                    <strong>${row.title} · 当前视频</strong>
                    <b>${row.format(row.value!)}</b>
                    <span>历史位置 ${
                      percentile === null ? "—" : `P${Math.round(percentile)}`
                    }</span>
                    <small>${row.confidence}</small>
                  </div>`,
              },
            }]),
      ];
    });
    return {
      animationDuration: 450,
      grid,
      xAxis,
      yAxis,
      series,
      tooltip: {
        trigger: "item",
        confine: true,
        backgroundColor: "rgba(20, 31, 39, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#eef5f2" },
      },
      graphic: rows.flatMap((row, index) =>
          row.baseline
            ? []
            : [{
                type: "text",
                left: 165,
                top: 48 + index * 90,
                style: {
                  text: "有效样本不足，暂未形成 P25 / P50 / P75",
                  fill: "#8a9691",
                  fontSize: 11,
                },
              }],
        ),
    };
  }, [baselines, clicks, metrics]);

  useEffect(() => {
    const element = chartElement.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return (
    <div
      ref={chartElement}
      className="commerce-boxplot"
      role="img"
      aria-label="商业效率近30天分布与当前视频对比"
    />
  );
}

function CurveChart({
  analysis,
  commerceValue,
  commerceBaseline,
  commerceConfidence,
}: {
  analysis: TrafficCurveAnalysis;
  commerceValue: number | null;
  commerceBaseline: TrafficMetricDistribution | null;
  commerceConfidence: string;
}) {
  const chartElement = useRef<HTMLDivElement>(null);
  const option = useMemo<EChartsOption>(() => {
    const reference = analysis.referenceCurve;
    const current = analysis.currentCurve;
    const p25 = reference.map((point) => [point.ageHours, point.p25]);
    const band = reference.map((point) => [
      point.ageHours,
      Math.max(0, point.p75 - point.p25),
    ]);
    const p50 = reference.map((point) => [point.ageHours, point.p50]);
    const p90 = reference
      .filter((point) => point.p90 !== null)
      .map((point) => [point.ageHours, point.p90!]);
    const currentData = current.map((point) => [
      point.ageHours,
      point.viewsCount,
    ]);
    const netCommissionData = analysis.netCommissionCurve.map((point) => [
      point.ageHours,
      point.netCommissionYuan,
    ]);
    const latest = current.at(-1);
    const axisMaximum = Math.max(
      1,
      Math.min(
        14 * 24,
        analysis.target?.currentAgeHours ?? latest?.ageHours ?? 24,
      ),
    );
    const axisInterval =
      axisMaximum <= 12
        ? 2
        : axisMaximum <= 24
          ? 3
          : axisMaximum <= 48
            ? 6
            : axisMaximum <= 72
              ? 12
              : axisMaximum <= 7 * 24
                ? 24
                : 48;
    const lifecycleMarkers = [
      { hour: 12, label: "12h 初筛" },
      { hour: 24, label: "24h 决策" },
      { hour: 48, label: "48h" },
      { hour: 72, label: "3天" },
      { hour: 7 * 24, label: "7天" },
      { hour: 14 * 24, label: "14天" },
    ]
      .filter((marker) => marker.hour < axisMaximum - 0.05)
      .map((marker) => ({
        xAxis: marker.hour,
        label: { formatter: marker.label },
      }));
    const commerceIqr = commerceBaseline
      ? Math.max(0, commerceBaseline.p75 - commerceBaseline.p25)
      : 0;
    const commerceLower = commerceBaseline
      ? Math.max(0, commerceBaseline.p25 - commerceIqr * 1.5)
      : 0;
    const commerceUpper = commerceBaseline
      ? commerceBaseline.p75 + commerceIqr * 1.5
      : 1;
    const commerceMaximum =
      Math.max(commerceUpper, commerceValue ?? 0, Number.EPSILON) * 1.08;
    const commercePercentile = metricPercentile(
      commerceValue,
      commerceBaseline,
    );

    return {
      animationDuration: 450,
      color: ["#17805b", "#66857a", "#c5963d"],
      grid: [
        { left: 68, right: 108, top: 48, height: 330 },
        { left: 180, right: 225, top: 440, height: 52 },
      ],
      legend: {
        top: 4,
        itemWidth: 20,
        itemHeight: 3,
        itemGap: 24,
        textStyle: { color: "#64727a", fontSize: 12 },
        selectedMode: true,
        data: [
          "当前视频",
          "P50 中位线",
          "P25～P75 常见区间",
          ...(p90.length ? ["P90 优秀线"] : []),
          ...(netCommissionData.length ? ["累计净佣金"] : []),
        ],
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "rgba(20, 31, 39, 0.96)",
        borderWidth: 0,
        padding: 0,
        textStyle: { color: "#eef5f2" },
        axisPointer: {
          type: "cross",
          snap: true,
          lineStyle: { color: "#7b9188", type: "dashed" },
          crossStyle: { color: "#7b9188", type: "dashed" },
          label: {
            color: "#fff",
            backgroundColor: "#344b42",
            formatter: (parameter) =>
              parameter.axisDimension === "x"
                ? formatAge(Number(parameter.value))
                : formatNumber(Number(parameter.value)),
          },
        },
        formatter: (rawParameters: unknown) => {
          const parameters = rawParameters as TooltipParameter[];
          if (
            parameters.some((item) =>
              item.seriesName.includes("千次观看净佣金"),
            )
          ) {
            return `<div class="commerce-chart-tooltip">
              <strong>千次观看净佣金</strong>
              <b>${commerceValue === null ? "—" : `¥${commerceValue.toFixed(2)}`}</b>
              ${
                commerceBaseline
                  ? `<span>P25　¥${commerceBaseline.p25.toFixed(2)}</span>
                     <span>P50　¥${commerceBaseline.p50.toFixed(2)}</span>
                     <span>P75　¥${commerceBaseline.p75.toFixed(2)}</span>
                     <small>当前 ${
                       commercePercentile === null
                         ? "—"
                         : `P${Math.round(commercePercentile)}`
                     } · ${commerceConfidence} · 基准${commerceBaseline.sampleCount}条</small>`
                  : "<small>商业基准样本不足</small>"
              }
            </div>`;
          }
          const visible = parameters.filter(
            (item) => item.seriesName !== "区间下界",
          );
          const age = Number(visible[0]?.value?.[0] ?? 0);
          const currentPoint = current.find(
            (point) => Math.abs(point.ageHours - age) < 0.01,
          );
          const netCommissionPoint = analysis.netCommissionCurve.find(
            (point) => Math.abs(point.ageHours - age) < 0.01,
          );
          const currentIndex = current.findIndex(
            (point) => Math.abs(point.ageHours - age) < 0.01,
          );
          const previous =
            currentIndex > 0 ? current[currentIndex - 1] : undefined;
          const referencePoint = nearestReference(reference, age);
          const versusMedian =
            currentPoint && referencePoint && referencePoint.p50 > 0
              ? ((currentPoint.viewsCount / referencePoint.p50 - 1) * 100)
              : null;
          const rows = [
            currentPoint
              ? ["当前累计", formatNumber(currentPoint.viewsCount), "#43d19e"]
              : null,
            currentPoint
              ? [
                  "最近半小时",
                  previous
                    ? `+${formatNumber(currentPoint.viewsCount - previous.viewsCount)}`
                    : "首个快照",
                  "#43d19e",
                ]
              : null,
            netCommissionPoint
              ? [
                  "累计净佣金",
                  `¥${netCommissionPoint.netCommissionYuan.toFixed(2)}`,
                  "#c47b28",
                ]
              : null,
            referencePoint
              ? ["P25", formatNumber(referencePoint.p25), "#b8c7c1"]
              : null,
            referencePoint
              ? ["P50", formatNumber(referencePoint.p50), "#8eaaa0"]
              : null,
            referencePoint
              ? ["P75", formatNumber(referencePoint.p75), "#b8c7c1"]
              : null,
            referencePoint?.p90 !== null && referencePoint?.p90 !== undefined
              ? ["P90", formatNumber(referencePoint.p90), "#d9b35d"]
              : null,
          ].filter(Boolean) as string[][];
          return `
            <div class="curve-tooltip">
              <div class="curve-tooltip-head">
                <strong>发布后 ${formatAge(age)}</strong>
                <span>${formatMoment(analysis.target!.publishTime, age)}</span>
              </div>
              <div class="curve-tooltip-rows">
                ${rows
                  .map(
                    ([label, value, color]) => `
                      <div>
                        <span><i style="background:${color}"></i>${label}</span>
                        <b>${value}</b>
                      </div>`,
                  )
                  .join("")}
              </div>
              ${
                versusMedian === null
                  ? ""
                  : `<div class="curve-tooltip-foot">
                      较同阶段P50
                      <strong class="${versusMedian >= 0 ? "positive" : "negative"}">
                        ${versusMedian >= 0 ? "+" : ""}${versusMedian.toFixed(1)}%
                      </strong>
                      <span>有效样本 ${referencePoint?.sampleCount ?? 0} 条</span>
                    </div>`
              }
            </div>`;
        },
      },
      xAxis: [
        {
          type: "value",
          gridIndex: 0,
          min: 0,
          max: axisMaximum,
          interval: axisInterval,
          name: "发布后时间",
          nameLocation: "middle",
          nameGap: 34,
          nameTextStyle: { color: "#8a969c", fontSize: 11 },
          axisLabel: {
            color: "#7c898f",
            formatter: (value: number) =>
              value >= 24
                ? `${Number((value / 24).toFixed(1))}天`
                : `${Number(value.toFixed(1))}h`,
          },
          axisLine: { lineStyle: { color: "#d9e0e3" } },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        {
          type: "value",
          gridIndex: 1,
          min: commerceLower,
          max: commerceMaximum,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          min: 0,
          name: "累计播放",
          nameTextStyle: { color: "#8a969c", fontSize: 11 },
          axisLabel: {
            color: "#7c898f",
            formatter: (value: number) => formatNumber(value),
          },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: "#e8edef" } },
        },
        {
          type: "value",
          gridIndex: 0,
          min: 0,
          position: "right",
          name: "净佣金（元）",
          nameTextStyle: { color: "#a26524", fontSize: 11 },
          axisLabel: {
            color: "#a26524",
            formatter: (value: number) => `¥${Number(value.toFixed(2))}`,
          },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        {
          type: "category",
          gridIndex: 1,
          data: ["千次观看净佣金"],
          axisLabel: {
            color: "#384c44",
            fontSize: 12,
            fontWeight: 600,
            margin: 18,
          },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      series: [
        {
          name: "区间下界",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          stack: "reference-band",
          data: p25,
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          emphasis: { disabled: true },
          tooltip: { show: false },
          silent: true,
        },
        {
          name: "P25～P75 常见区间",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          stack: "reference-band",
          data: band,
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { color: "#dcece6", opacity: 0.72 },
          emphasis: { disabled: true },
          tooltip: { show: false },
          silent: true,
        },
        {
          name: "P50 中位线",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: p50,
          symbol: "none",
          smooth: 0.18,
          lineStyle: { color: "#66857a", width: 2 },
        },
        ...(p90.length
          ? [{
              name: "P90 优秀线",
              type: "line" as const,
              xAxisIndex: 0,
              yAxisIndex: 0,
              data: p90,
              symbol: "none",
              smooth: 0.18,
              lineStyle: { color: "#c5963d", width: 1.5, type: "dashed" as const },
            }]
          : []),
        {
          name: "当前视频",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: currentData,
          symbol: "circle",
          showSymbol: false,
          smooth: 0.12,
          connectNulls: false,
          lineStyle: { color: "#17805b", width: 4 },
          itemStyle: { color: "#17805b", borderColor: "#fff", borderWidth: 2 },
          endLabel: {
            show: Boolean(latest),
            formatter: () => latest ? `当前  ${formatNumber(latest.viewsCount)}` : "",
            color: "#126c4c",
            fontWeight: 700,
            backgroundColor: "#e6f5ef",
            borderRadius: 5,
            padding: [4, 7],
            distance: 8,
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#a9b5ba", width: 1, type: "dashed" },
            label: {
              color: "#718087",
              backgroundColor: "#f5f7f8",
              borderRadius: 4,
              padding: [3, 5],
            },
            data: lifecycleMarkers,
          },
        },
        {
          name: "累计净佣金",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 1,
          data: netCommissionData,
          symbol: "circle",
          showSymbol: false,
          connectNulls: false,
          smooth: 0.12,
          lineStyle: { color: "#c47b28", width: 2.5 },
          itemStyle: { color: "#c47b28" },
          endLabel: {
            show: netCommissionData.length > 0,
            formatter: () => {
              const value = analysis.netCommissionCurve.at(-1);
              return value
                ? `净佣金  ¥${value.netCommissionYuan.toFixed(2)}`
                : "";
            },
            color: "#955f22",
            fontWeight: 700,
            backgroundColor: "#fff3df",
            borderRadius: 5,
            padding: [4, 7],
            distance: 8,
          },
        },
        ...(commerceBaseline
          ? [
              {
                name: "千次观看净佣金历史分布",
                type: "boxplot" as const,
                xAxisIndex: 1,
                yAxisIndex: 2,
                data: [[
                  commerceLower,
                  commerceBaseline.p25,
                  commerceBaseline.p50,
                  commerceBaseline.p75,
                  commerceUpper,
                ]],
                itemStyle: {
                  color: "#dcece6",
                  borderColor: "#66857a",
                  borderWidth: 1.5,
                },
                tooltip: {
                  formatter: () =>
                    `<div class="commerce-chart-tooltip">
                      <strong>千次观看净佣金 · 近30天</strong>
                      <span>P25　¥${commerceBaseline.p25.toFixed(2)}</span>
                      <span>P50　¥${commerceBaseline.p50.toFixed(2)}</span>
                      <span>P75　¥${commerceBaseline.p75.toFixed(2)}</span>
                      <small>有效样本 ${commerceBaseline.sampleCount} 条</small>
                    </div>`,
                },
              },
              ...(commerceValue === null
                ? []
                : [{
                    name: "当前千次观看净佣金",
                    type: "scatter" as const,
                    xAxisIndex: 1,
                    yAxisIndex: 2,
                    data: [[commerceValue, "千次观看净佣金"]],
                    symbolSize: 17,
                    itemStyle: {
                      color: "#0d8059",
                      borderColor: "#fff",
                      borderWidth: 3,
                    },
                    label: {
                      show: true,
                      position: "right" as const,
                      distance: 12,
                      formatter: `¥${commerceValue.toFixed(2)} · ${
                        commercePercentile === null
                          ? "—"
                          : `P${Math.round(commercePercentile)}`
                      }\n${commerceConfidence}`,
                      color: "#31483f",
                      fontSize: 11,
                      lineHeight: 17,
                    },
                  }]),
            ]
          : []),
      ],
      graphic: commerceBaseline
        ? []
        : [{
            type: "text",
            left: 185,
            top: 455,
            style: {
              text: "有效样本不足，暂未形成商业基准",
              fill: "#8a9691",
              fontSize: 11,
            },
          }],
    };
  }, [analysis, commerceBaseline, commerceConfidence, commerceValue]);

  useEffect(() => {
    const element = chartElement.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: "canvas" });
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return (
    <div
      ref={chartElement}
      className="curve-echart combined-decision-chart"
      role="img"
      aria-label="累计播放生命周期曲线"
    />
  );
}

export function TrafficCurveDashboard({
  analysis,
  video,
}: {
  analysis: TrafficCurveAnalysis | null;
  video: VideoSummary | null;
}) {
  if (!analysis) {
    return <section className="curve-card">正在读取本地曲线数据…</section>;
  }
  const current = analysis.currentCurve.at(-1);
  const reference = current
    ? nearestReference(analysis.referenceCurve, current.ageHours)
    : undefined;
  const aboveP75WithoutP90 =
    Boolean(current && reference) &&
    current!.viewsCount > reference!.p75 &&
    reference!.p90 === null;
  const confidenceLabel =
    analysis.confidence === "ready"
      ? "可用"
      : analysis.confidence === "trial"
        ? "试算"
        : "不足";
  const commerce = video ? calculatePreinvestCommerce(video) : null;
  const decision =
    video && commerce
      ? decidePreinvestCandidate(video, analysis.target ?? undefined, commerce)
      : null;
  const displayMoney = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : `¥${value.toFixed(2)}`;
  const displayPercent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : `${(value * 100).toFixed(2)}%`;
  const clickConfidence =
    commerce?.sampleConfidence === "ready"
      ? "可信"
      : commerce?.sampleConfidence === "low"
        ? "低样本"
        : "样本不足";
  return (
    <section className="curve-card preinvest-cockpit">
      <header className="preinvest-detail-header">
        <div>
          <span className="eyebrow">投前分析详情</span>
          <h2 title={analysis.target?.title}>
            {analysis.target?.title || "当前候选视频"}
          </h2>
          <p>
            {analysis.target
              ? `${new Date(analysis.target.publishTime).toLocaleString()} · ${
                  analysis.target.commerceStatus === "cart"
                    ? "已挂车"
                    : analysis.target.commerceStatus === "no_cart"
                      ? "未挂车"
                      : "挂车状态待确认"
                }`
              : "等待视频数据"}
          </p>
        </div>
        <div className="detail-freshness">
          <small>基准版本</small>
          <strong>
            {analysis.baselineGeneratedAt
              ? new Intl.DateTimeFormat("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date(analysis.baselineGeneratedAt))
              : "尚未形成"}
          </strong>
          <span>近{analysis.baselineWindowDays}天 · 每日更新</span>
        </div>
      </header>

      {video && commerce && (
        <section className={`preinvest-verdict ${decision?.state ?? "insufficient"}`}>
          <div className="preinvest-verdict-main">
            <span>当前投前判断</span>
            <strong>{decision?.label}</strong>
            <p>{decision?.reason}</p>
          </div>
          <div className="preinvest-verdict-facts">
            <div><small>流量位置</small><strong>{percentileLabel(analysis)}</strong></div>
            <div>
              <small>最近2小时流速</small>
              <strong>
                {analysis.recentSlopePerHour === null
                  ? "—"
                  : `${Math.round(analysis.recentSlopePerHour)}/小时`}
              </strong>
            </div>
            <div><small>判断置信度</small><strong>{confidenceLabel}</strong></div>
          </div>
        </section>
      )}

      <section className="preinvest-curve-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">流量能力</span>
            <h3>累计播放生命周期</h3>
            <p>当前视频与账号近30天同阶段视频比较</p>
          </div>
          <div className="baseline-summary">
            <span>基线 {analysis.baselineVideoCount} 条</span>
            <span>
              {analysis.baselineMode === "cart"
                ? "挂车视频"
                : analysis.baselineMode === "no_cart"
                  ? "未挂车视频"
                  : "样本不足"}
            </span>
          </div>
        </div>
        <div className={`curve-summary ${analysis.confidence}`}>
          {aboveP75WithoutP90
            ? `当前高于历史P75；P90因样本不足暂不计算。`
            : analysis.summary}
        </div>
        {analysis.target && analysis.currentCurve.length > 0 ? (
          <>
            <CurveChart
              analysis={analysis}
              commerceValue={
                commerce?.thousandViewNetCommissionYuan ?? null
              }
              commerceBaseline={
                analysis.commerceBaseline.thousandViewNetCommissionYuan
              }
              commerceConfidence={
                commerce?.sampleConfidence === "ready"
                  ? "样本可信"
                  : commerce?.sampleConfidence === "low"
                    ? "低样本"
                    : "样本不足"
              }
            />
            <div className="curve-help">
              <span><i />P25～P75表示历史同阶段中间50%的视频</span>
              <span>移动鼠标查看每个半小时的明细，点击图例可隐藏曲线</span>
            </div>
          </>
        ) : (
          <div className="curve-empty">当前视频还没有足够的快照数据</div>
        )}
      </section>

      {video && commerce && (
        <section className="preinvest-commerce-detail cockpit-commerce">
          <div className="preinvest-commerce-heading">
            <div>
              <span className="eyebrow">商业结果</span>
              <h2>观看到净佣金</h2>
              <p>核心商业基准已经合并到上方决策图。</p>
            </div>
            <span className={`sample-badge ${commerce.sampleConfidence}`}>
              点击 {video.productClickCount ?? 0} · {clickConfidence}
            </span>
          </div>

          <div className="compact-commerce-funnel">
            <div>
              <small>观看</small><strong>{video.viewsCount.toLocaleString()}</strong>
            </div>
            <i>→</i>
            <div>
              <small>商品点击</small><strong>{video.productClickCount?.toLocaleString() ?? "—"}</strong>
            </div>
            <i>→</i>
            <div>
              <small>成交订单</small><strong>{video.paidOrderCount?.toLocaleString() ?? "—"}</strong>
            </div>
            <i>→</i>
            <div className="highlight">
              <small>预估净佣金</small><strong>{displayMoney(commerce.estimatedNetCommissionYuan)}</strong>
            </div>
          </div>

          <details className="preinvest-raw-details">
            <summary>查看原始数据与计算口径</summary>
            <div className="preinvest-raw-grid">
              <div><small>商品</small><strong>{video.productName || "—"}</strong></div>
              <div><small>佣金比例</small><strong>{video.commissionRate === null ? "—" : `${(video.commissionRate * 100).toFixed(1)}%`}</strong></div>
              <div><small>成交金额</small><strong>{displayMoney(video.paidGmvYuan)}</strong></div>
              <div><small>退款金额</small><strong>{displayMoney(video.refundGmvYuan)}</strong></div>
              <div><small>净成交额</small><strong>{displayMoney(commerce.netGmvYuan)}</strong></div>
              <div><small>观看点击率</small><strong>{displayPercent(commerce.viewClickRate)}</strong></div>
              <div><small>千次点击净佣金</small><strong>{displayMoney(commerce.thousandClickNetCommissionYuan)}</strong></div>
              <div><small>点击成交率</small><strong>{video.productClickCount && video.paidOrderCount !== null ? displayPercent(video.paidOrderCount / video.productClickCount) : "—"}</strong></div>
            </div>
            <p>净佣金＝（成交金额－退款金额）×佣金比例；千次观看净佣金＝观看点击率×千次点击净佣金。</p>
          </details>
        </section>
      )}
    </section>
  );
}
