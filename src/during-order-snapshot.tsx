import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type {
  DuringInvestmentState,
  DuringOrderCurrentSnapshot,
  DuringOrderTimelinePoint,
} from "../electron/shared/types";

type ChartMode = "money" | "conversion" | "cumulative";

function number(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("zh-CN");
}

function money(value: number | null): string {
  return value === null
    ? "—"
    : `¥${value.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

function percent(value: number | null, digits = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function latestDelta(
  timeline: DuringOrderTimelinePoint[],
  field: keyof DuringOrderTimelinePoint["delta"],
  minutes = 5,
): number | null {
  if (!timeline.length) return null;
  const end = new Date(timeline.at(-1)!.capturedAt).getTime();
  const start = end - minutes * 60_000;
  const values = timeline
    .filter((point) => new Date(point.capturedAt).getTime() > start)
    .map((point) => point.delta[field])
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function Kpi({
  label,
  value,
  change,
  tone,
}: {
  label: string;
  value: string;
  change?: string;
  tone?: "positive" | "negative" | "primary";
}) {
  return (
    <div className={`during-kpi ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {change && <small>{change}</small>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="during-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LifecycleChart({
  timeline,
  mode,
}: {
  timeline: DuringOrderTimelinePoint[];
  mode: ChartMode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const option = useMemo<EChartsOption>(() => {
    const times = timeline.map((point) => point.capturedAt);
    const statusMarks = timeline
      .filter(
        (point, index) =>
          index > 0 && point.status !== timeline[index - 1].status,
      )
      .map((point) => ({
        name: point.statusLabel,
        xAxis: point.capturedAt,
        label: { formatter: point.statusLabel },
      }));
    const eventMarks = {
      symbol: ["none", "none"],
      lineStyle: { color: "#9aa7a2", type: "dashed" as const },
      label: {
        color: "#6b7873",
        fontSize: 10,
        position: "insideEndTop" as const,
      },
      data: statusMarks,
    };
    const seriesByMode: Record<ChartMode, EChartsOption["series"]> = {
      money: [
        {
          name: "累计消耗",
          type: "line",
          smooth: 0.25,
          showSymbol: timeline.length < 20,
          data: timeline.map((point) => point.cumulative.spendYuan),
          lineStyle: { width: 3, color: "#d9822b" },
          itemStyle: { color: "#d9822b" },
          areaStyle: { color: "rgba(217,130,43,.08)" },
          markLine: {
            ...eventMarks,
            data: [
              { name: "盈亏平衡", yAxis: 0, label: { formatter: "盈亏平衡" } },
              ...statusMarks,
            ],
          },
        },
        {
          name: "预估净佣金",
          type: "line",
          smooth: 0.25,
          showSymbol: timeline.length < 20,
          data: timeline.map(
            (point) => point.cumulative.estimatedNetCommissionYuan,
          ),
          lineStyle: { width: 3, color: "#187a59" },
          itemStyle: { color: "#187a59" },
        },
        {
          name: "实时净盈亏",
          type: "line",
          smooth: 0.25,
          showSymbol: timeline.length < 20,
          data: timeline.map((point) => point.cumulative.netProfitYuan),
          lineStyle: { width: 2, color: "#425d91" },
          itemStyle: { color: "#425d91" },
        },
      ],
      conversion: [
        {
          name: "本分钟曝光",
          type: "bar",
          data: timeline.map((point) => point.delta.exposureCount),
          itemStyle: { color: "#bedbd1", borderRadius: [3, 3, 0, 0] },
          markLine: eventMarks,
        },
        {
          name: "本分钟商品点击",
          type: "line",
          yAxisIndex: 1,
          data: timeline.map((point) => point.delta.productClickPv),
          lineStyle: { width: 3, color: "#187a59" },
          itemStyle: { color: "#187a59" },
        },
        {
          name: "本分钟净支付",
          type: "line",
          yAxisIndex: 1,
          data: timeline.map((point) => point.delta.productNetPayCount),
          lineStyle: { width: 2, color: "#d9822b" },
          itemStyle: { color: "#d9822b" },
        },
      ],
      cumulative: [
        {
          name: "累计曝光",
          type: "line",
          smooth: 0.2,
          showSymbol: false,
          data: timeline.map((point) => point.cumulative.exposureCount),
          lineStyle: { width: 3, color: "#66857a" },
          itemStyle: { color: "#66857a" },
          markLine: eventMarks,
        },
        {
          name: "累计商品点击",
          type: "line",
          yAxisIndex: 1,
          smooth: 0.2,
          data: timeline.map((point) => point.cumulative.productClickPv),
          lineStyle: { width: 3, color: "#187a59" },
          itemStyle: { color: "#187a59" },
        },
        {
          name: "累计净支付",
          type: "line",
          yAxisIndex: 1,
          smooth: 0.2,
          data: timeline.map((point) => point.cumulative.productNetPayCount),
          lineStyle: { width: 2, color: "#d9822b" },
          itemStyle: { color: "#d9822b" },
        },
      ],
    };
    return {
      animationDuration: 350,
      grid: { left: 58, right: 58, top: 50, bottom: 54 },
      legend: {
        top: 4,
        right: 8,
        itemWidth: 18,
        itemHeight: 3,
        textStyle: { color: "#66747a" },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "rgba(20,31,39,.96)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        axisPointer: { type: "cross", snap: true },
        valueFormatter: (value) =>
          mode === "money"
            ? money(Number(value))
            : Number(value).toLocaleString("zh-CN"),
      },
      xAxis: {
        type: "category",
        data: times,
        boundaryGap: mode === "conversion",
        axisLabel: {
          color: "#7d898e",
          formatter: (value: string) => shortTime(value),
        },
        axisLine: { lineStyle: { color: "#dfe5e6" } },
        axisTick: { show: false },
      },
      yAxis: [
        {
          type: "value",
          axisLabel: {
            color: "#7d898e",
            formatter: (value: number) =>
              mode === "money" ? `¥${value}` : value.toLocaleString("zh-CN"),
          },
          splitLine: { lineStyle: { color: "#edf1f2" } },
        },
        {
          type: "value",
          show: mode !== "money",
          axisLabel: { color: "#7d898e" },
          splitLine: { show: false },
        },
      ],
      dataZoom:
        timeline.length > 60
          ? [{ type: "inside" }, { type: "slider", height: 18, bottom: 2 }]
          : undefined,
      series: seriesByMode[mode],
    };
  }, [timeline, mode]);

  useEffect(() => {
    if (!element.current) return;
    const chart = echarts.init(element.current);
    chart.setOption(option);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div className="during-lifecycle-chart" ref={element} />;
}

function Funnel({ snapshot }: { snapshot: DuringOrderCurrentSnapshot }) {
  const exposure = snapshot.effects.exposureCount;
  const click = snapshot.effects.productClickPv;
  const pay = snapshot.effects.productPayCount;
  const netPay = snapshot.effects.productNetPayCount;
  const steps = [
    { label: "加热曝光", value: exposure },
    { label: "商品点击", value: click },
    { label: "支付", value: pay },
    { label: "净支付", value: netPay },
  ];
  return (
    <div className="during-funnel">
      {steps.map((step, index) => {
        const previous = index ? steps[index - 1].value : null;
        const rate =
          previous && step.value !== null ? step.value / previous : null;
        return (
          <div className="during-funnel-step" key={step.label}>
            {index > 0 && <span className="funnel-rate">{percent(rate, 2)} →</span>}
            <div>
              <small>{step.label}</small>
              <strong>{number(step.value)}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Snapshot({
  snapshot,
  timeline,
}: {
  snapshot: DuringOrderCurrentSnapshot;
  timeline: DuringOrderTimelinePoint[];
}) {
  const [chartMode, setChartMode] = useState<ChartMode>("money");
  const [windowMinutes, setWindowMinutes] = useState<15 | 60 | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const visibleTimeline = useMemo(() => {
    if (!windowMinutes || !timeline.length) return timeline;
    const end = new Date(timeline.at(-1)!.capturedAt).getTime();
    return timeline.filter(
      (point) =>
        new Date(point.capturedAt).getTime() >=
        end - windowMinutes * 60_000,
    );
  }, [timeline, windowMinutes]);
  const fiveMinuteSpend = latestDelta(timeline, "spendYuan");
  const fiveMinuteClicks = latestDelta(timeline, "productClickPv");
  const profit = snapshot.calculated.netProfitYuan;
  const budgetRate =
    snapshot.funds.spentWecoin !== null && snapshot.funds.budgetWecoin
      ? snapshot.funds.spentWecoin / snapshot.funds.budgetWecoin
      : null;
  const clickRate =
    snapshot.effects.exposureCount && snapshot.effects.productClickPv !== null
      ? snapshot.effects.productClickPv / snapshot.effects.exposureCount
      : null;
  const clickToPayRate =
    snapshot.effects.productClickPv && snapshot.effects.productPayCount !== null
      ? snapshot.effects.productPayCount / snapshot.effects.productClickPv
      : null;
  const isActive = [1, 2, 5, 9, 10, 11].includes(snapshot.status);
  const freshnessSeconds = Math.max(
    0,
    Math.round((clock - new Date(snapshot.capturedAt).getTime()) / 1_000),
  );
  const isStale = isActive && freshnessSeconds > 120;
  const freshnessLabel = isActive
    ? isStale
      ? `数据已中断 ${Math.floor(freshnessSeconds / 60)} 分钟`
      : freshnessSeconds < 60
        ? `${freshnessSeconds} 秒前更新`
        : `${Math.floor(freshnessSeconds / 60)} 分钟前更新`
    : "订单已结束 · 历史盘面";
  const signals = [
    isStale
      ? { tone: "critical", text: "实时数据已过期，暂停生成智能建议" }
      : null,
    snapshot.calculated.spendYuan &&
    snapshot.effects.productClickPv &&
    !snapshot.effects.productPayCount
      ? {
          tone: "warning",
          text: `已产生 ${number(snapshot.effects.productClickPv)} 次商品点击，尚无支付`,
        }
      : null,
    profit !== null && profit < 0
      ? { tone: "warning", text: `当前累计亏损 ${money(Math.abs(profit))}` }
      : null,
    !isActive
      ? { tone: "neutral", text: `订单最终状态：${snapshot.statusLabel}` }
      : null,
  ].filter(Boolean) as Array<{ tone: string; text: string }>;

  return (
    <>
      <div className={`during-watch-strip ${isStale ? "stale" : ""}`}>
        <div>
          <span className={`during-live-dot ${isStale ? "stale" : ""}`} />
          <strong>{snapshot.statusLabel}</strong>
          <small>{freshnessLabel}</small>
        </div>
        <div className="during-watch-strip-metrics">
          <span>当前盈亏 <b>{money(profit)}</b></span>
          <span>近5分钟消耗 <b>{money(fiveMinuteSpend)}</b></span>
          <span>智能建议 <b>待接入</b></span>
        </div>
        <button disabled>执行建议</button>
      </div>

      <div className="during-order-hero">
        {snapshot.video.coverUrl && (
          <img src={snapshot.video.coverUrl} alt="" referrerPolicy="no-referrer" />
        )}
        <div className="during-hero-copy">
          <div className="during-status-line">
            <span className={`during-status status-${snapshot.status}`}>
              {snapshot.statusLabel}
            </span>
            <span>订单号 {snapshot.promotionId}</span>
            <span>最近快照 {date(snapshot.capturedAt)}</span>
          </div>
          <h2>{snapshot.orderName || "未命名订单"}</h2>
          <p>{snapshot.video.title || "视频标题未返回"}</p>
          <div className="during-budget-progress">
            <span style={{ width: `${Math.min(100, (budgetRate ?? 0) * 100)}%` }} />
          </div>
          <small>
            预算消耗 {percent(budgetRate)} · 已采集 {timeline.length} 个时间点
          </small>
        </div>
      </div>

      <div className="during-command-deck">
        <section className="during-intelligence-card">
          <div className="during-intelligence-head">
            <div>
              <span className="during-ai-mark">AI</span>
              <div>
                <small>智能盯盘建议</small>
                <h2>等待决策引擎接入</h2>
              </div>
            </div>
            <span className="during-ai-state">规划中</span>
          </div>
          <p>
            后续每次分钟快照完成后，系统将在这里重新判断订单应当继续、观察、
            调整或止损，并说明判断依据。
          </p>
          <div className="during-intelligence-slots">
            <div>
              <small>当前建议</small>
              <strong>—</strong>
            </div>
            <div>
              <small>判断置信度</small>
              <strong>—</strong>
            </div>
            <div>
              <small>下次评估</small>
              <strong>下个快照完成后</strong>
            </div>
          </div>
          <div className="during-reason-placeholder">
            <span>判断依据</span>
            <p>消耗速度、点击增长、成交效率和实时盈亏将共同形成建议。</p>
          </div>
          <div className="during-market-signals">
            {signals.map((signal) => (
              <span className={signal.tone} key={signal.text}>
                <i />
                {signal.text}
              </span>
            ))}
          </div>
        </section>

        <aside className="during-action-card">
          <div>
            <small>负责人操作台</small>
            <h3>等待人工决策</h3>
            <p>自动操作尚未接入，当前按钮仅展示未来操作位置。</p>
          </div>
          <div className="during-action-buttons">
            <button disabled className="recommended">执行智能建议</button>
            <button disabled>调整预算</button>
            <button disabled>暂停观察</button>
            <button disabled className="danger">停止投放</button>
          </div>
          <span className="during-action-safety">所有自动操作均需负责人确认</span>
        </aside>
      </div>

      <div className="during-evidence-heading">
        <div>
          <span>实时盘面</span>
          <h2>当前经营状态</h2>
        </div>
        <small>以下数据是智能判断和负责人决策的共同依据</small>
      </div>

      <div className="during-kpi-grid">
        <Kpi
          label="实时净盈亏"
          value={money(profit)}
          change="净佣金减投放成本"
          tone={profit !== null && profit >= 0 ? "positive" : "negative"}
        />
        <Kpi
          label="累计消耗"
          value={money(snapshot.calculated.spendYuan)}
          change={`近5分钟 ${money(fiveMinuteSpend)}`}
          tone="primary"
        />
        <Kpi
          label="预估净佣金"
          value={money(snapshot.calculated.estimatedNetCommissionYuan)}
          change={`佣金比例 ${
            snapshot.calculated.commissionRate === null
              ? "未匹配"
              : percent(snapshot.calculated.commissionRate, 2)
          }`}
        />
        <Kpi
          label="商品点击"
          value={number(snapshot.effects.productClickPv)}
          change={`近5分钟 +${number(fiveMinuteClicks)}`}
        />
        <Kpi
          label="佣金 ROI"
          value={
            snapshot.calculated.commissionRoi === null
              ? "—"
              : snapshot.calculated.commissionRoi.toFixed(2)
          }
          change="净佣金 ÷ 投放成本"
        />
      </div>

      <section className="during-section during-chart-section">
        <div className="during-section-title">
          <div>
              <h3>订单生命周期</h3>
              <span>观察资金、效率和结果如何随时间演化</span>
          </div>
          <div className="during-chart-tabs">
            {(
              [
                ["money", "资金与盈亏"],
                ["conversion", "分钟转化"],
                ["cumulative", "累计效果"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={chartMode === value ? "active" : ""}
                onClick={() => setChartMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="during-time-window">
          <span>观察窗口</span>
          {(
            [
              [15, "近15分钟"],
              [60, "近1小时"],
              [null, "完整周期"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              className={windowMinutes === value ? "active" : ""}
              onClick={() => setWindowMinutes(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {visibleTimeline.length > 1 ? (
          <LifecycleChart timeline={visibleTimeline} mode={chartMode} />
        ) : (
          <div className="during-chart-empty">至少需要两个快照才能形成趋势图。</div>
        )}
      </section>

      <div className="during-two-column">
        <section className="during-section">
          <div className="during-section-title">
            <div>
              <h3>累计转化漏斗</h3>
              <span>{snapshot.product.name ?? "商品名称未返回"}</span>
            </div>
          </div>
          <Funnel snapshot={snapshot} />
          <div className="during-inline-metrics">
            <span>点击率 <b>{percent(clickRate, 2)}</b></span>
            <span>点击支付转化 <b>{percent(clickToPayRate, 2)}</b></span>
            <span>单次点击成本 <b>{money(snapshot.calculated.costPerProductClickYuan)}</b></span>
          </div>
        </section>

        <section className="during-section during-profit-card">
          <div className="during-section-title">
            <div>
              <h3>经营结果</h3>
              <span>当前实时估算，投后按实际结算校正</span>
            </div>
          </div>
          <dl className="during-result-list">
            <Field label="归因净支付金额" value={money(snapshot.calculated.netGmvYuan)} />
            <Field label="预估净佣金" value={money(snapshot.calculated.estimatedNetCommissionYuan)} />
            <Field label="折算投放成本" value={money(snapshot.calculated.spendYuan)} />
            <Field label="实时净盈亏" value={money(snapshot.calculated.netProfitYuan)} />
            <Field label="已退款微信豆" value={number(snapshot.funds.refundedWecoin)} />
            <Field label="平台净支付 ROI" value={number(snapshot.effects.productNetPayRoi)} />
          </dl>
        </section>
      </div>

      <details className="during-business-details">
        <summary>订单配置与时间</summary>
        <dl className="during-config-grid">
          <Field label="优先提升目标" value={snapshot.configuration.targetLabel} />
          <Field label="出价方式" value={snapshot.configuration.pricingMethodLabel} />
          <Field label="扣费方式" value={snapshot.configuration.billingMethodLabel} />
          <Field
            label="加热时长"
            value={
              snapshot.configuration.durationSec === null
                ? "—"
                : `${snapshot.configuration.durationSec / 3600} 小时`
            }
          />
          <Field label="下单时间" value={date(snapshot.configuration.createAt)} />
          <Field label="实际开始" value={date(snapshot.configuration.actualStartAt)} />
          <Field label="预计结束" value={date(snapshot.configuration.estimatedEndAt)} />
          <Field label="实际结束" value={date(snapshot.configuration.actualEndAt)} />
        </dl>
      </details>

      <details className="during-business-details">
        <summary>分钟业务明细（{timeline.length}）</summary>
        <div className="during-minute-table-wrap">
          <table className="during-minute-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>间隔</th>
                <th>本段消耗</th>
                <th>新增曝光</th>
                <th>新增点击</th>
                <th>新增支付</th>
                <th>累计净支付</th>
                <th>累计盈亏</th>
              </tr>
            </thead>
            <tbody>
              {[...timeline].reverse().map((point) => (
                <tr key={point.capturedAt} className={`quality-${point.quality}`}>
                  <td>{date(point.capturedAt)}</td>
                  <td>
                    {point.intervalSeconds === null
                      ? "首条"
                      : `${Math.round(point.intervalSeconds / 60)}分钟`}
                  </td>
                  <td>{money(point.delta.spendYuan)}</td>
                  <td>{number(point.delta.exposureCount)}</td>
                  <td>{number(point.delta.productClickPv)}</td>
                  <td>{number(point.delta.productPayCount)}</td>
                  <td>{money(point.cumulative.netGmvYuan)}</td>
                  <td>{money(point.cumulative.netProfitYuan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function OrderList({
  state,
  onSelect,
  onDiscoverNow,
  discovering,
}: {
  state: DuringInvestmentState;
  onSelect: (promotionId: string) => void;
  onDiscoverNow: () => void;
  discovering: boolean;
}) {
  const activeStatuses = [1, 2, 5, 9, 10, 11];
  const activeCount = state.candidates.filter((order) =>
    activeStatuses.includes(order.status),
  ).length;
  return (
    <section className="during-order-list-page">
      <div className="during-list-summary">
        <div>
          <span className="eyebrow">投中监控</span>
          <h1>投放订单</h1>
          <p>从当前状态和经营结果中选择需要盯盘的订单。</p>
        </div>
        <div className="during-list-counts">
          <span><b>{activeCount}</b> 进行中</span>
          <span><b>{state.candidates.length}</b> 全部订单</span>
          <button onClick={onDiscoverNow} disabled={discovering}>
            {discovering ? "正在发现…" : "立即发现新订单"}
          </button>
        </div>
      </div>
      {state.lastError && (
        <div className="during-error">
          最近一次自动采集异常，列表仍展示最后一次成功快照。
        </div>
      )}
      <div className="during-order-table-wrap">
        <table className="during-order-table">
          <thead>
            <tr>
              <th>订单与视频</th>
              <th>状态</th>
              <th>消耗 / 预算</th>
              <th title="累计消耗 ÷ 累计加热曝光 × 1000">
                折算千次观看成本
              </th>
              <th>商品点击</th>
              <th>支付</th>
              <th>净支付金额</th>
              <th>实时净盈亏</th>
              <th>佣金 ROI</th>
              <th>最后快照</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.candidates.map((order) => (
              <tr
                key={order.promotionId}
                tabIndex={0}
                onClick={() => onSelect(order.promotionId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelect(order.promotionId);
                }}
              >
                <td className="during-order-identity">
                  <strong>{order.orderName || "未命名订单"}</strong>
                  <span>{order.videoTitle || "视频标题未返回"}</span>
                  <small>{order.productName ?? "商品名称未返回"}</small>
                </td>
                <td>
                  <span className={`during-status status-${order.status}`}>
                    {order.statusLabel}
                  </span>
                </td>
                <td>
                  <strong>{money(order.spendYuan)}</strong>
                  <small>
                    {money(order.budgetYuan)} · {percent(order.budgetRate)}
                  </small>
                </td>
                <td>
                  <strong>{money(order.costPerThousandExposureYuan)}</strong>
                  <small>每千次加热曝光</small>
                </td>
                <td>{number(order.productClickPv)}</td>
                <td>{number(order.productPayCount)}</td>
                <td>{money(order.netGmvYuan)}</td>
                <td
                  className={
                    order.netProfitYuan !== null && order.netProfitYuan < 0
                      ? "negative-value"
                      : "positive-value"
                  }
                >
                  {money(order.netProfitYuan)}
                </td>
                <td>
                  {order.commissionRoi === null
                    ? "—"
                    : order.commissionRoi.toFixed(2)}
                </td>
                <td>{date(order.capturedAt)}</td>
                <td className="during-row-arrow">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DuringOrderSnapshotPanel({
  state,
  selectedPromotionId,
  onSelect,
  onBack,
  onDiscoverNow,
  discovering,
}: {
  state: DuringInvestmentState | null;
  selectedPromotionId?: string;
  onSelect: (promotionId: string) => void;
  onBack: () => void;
  onDiscoverNow: () => void;
  discovering: boolean;
}) {
  if (!state) return <div className="during-empty">正在读取订单生命周期…</div>;
  if (!state.current) {
    return (
      <div className="during-empty">
        <h2>尚无订单记录</h2>
        <p>加热平台登录后，快照机会自动发现并持续跟踪订单。</p>
        <button onClick={onDiscoverNow} disabled={discovering}>
          {discovering ? "正在发现新订单…" : "立即发现新订单"}
        </button>
      </div>
    );
  }
  if (!selectedPromotionId) {
    return (
      <OrderList
        state={state}
        onSelect={onSelect}
        onDiscoverNow={onDiscoverNow}
        discovering={discovering}
      />
    );
  }
  return (
    <section className="during-panel">
      <div className="during-page-heading">
        <div>
          <button className="during-back-button" onClick={onBack}>
            ← 返回订单列表
          </button>
          <span className="eyebrow">投中监控</span>
          <h1>智能盯盘驾驶舱</h1>
          <p>实时判断订单状态，并为下一步操作提供依据</p>
        </div>
        {state.candidates.length > 1 && (
          <label>
            当前订单
            <select
              value={state.current.promotionId}
              onChange={(event) => onSelect(event.target.value)}
            >
              {state.candidates.map((candidate) => (
                <option key={candidate.promotionId} value={candidate.promotionId}>
                  {candidate.statusLabel} · {candidate.orderName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {state.lastError && (
        <div className="during-error">
          自动采集暂时异常，当前展示最后一次成功数据。
        </div>
      )}
      <Snapshot snapshot={state.current} timeline={state.timeline} />
    </section>
  );
}
