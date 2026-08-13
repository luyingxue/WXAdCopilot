import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  Account,
  BrowserState,
  Platform,
  ProductMaintenanceState,
  DuringInvestmentState,
  SnapshotMachinesState,
  CartVideoAnalysisState,
  TrafficCurveAnalysis,
  VideoSyncState,
} from "../electron/shared/types";
import { TrafficCurveDashboard } from "./traffic-curve-dashboard";
import { DuringOrderSnapshotPanel } from "./during-order-snapshot";
import {
  calculatePreinvestCommerce,
  decidePreinvestCandidate,
} from "./preinvest-metrics";

const PLATFORM_LABELS: Record<Platform, string> = {
  commerce: "微信小店带货助手",
  compass: "电商罗盘",
  promote: "加热平台",
};

const STATUS_LABELS: Record<Account["status"], string> = {
  online: "在线",
  partial: "部分离线",
  offline: "离线",
  checking: "检测中",
  unknown: "未检测",
};

export function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>("commerce");
  const [mode, setMode] =
    useState<"browser" | "preinvest" | "during" | "maintenance" | "about">(
      "browser",
    );
  const [browserState, setBrowserState] = useState<BrowserState | null>(null);
  const [videoSyncState, setVideoSyncState] =
    useState<VideoSyncState | null>(null);
  const [trafficAnalysis, setTrafficAnalysis] =
    useState<TrafficCurveAnalysis | null>(null);
  const [detailTrafficAnalysis, setDetailTrafficAnalysis] =
    useState<TrafficCurveAnalysis | null>(null);
  const [analysisTargetId, setAnalysisTargetId] = useState<string | undefined>();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [productState, setProductState] =
    useState<ProductMaintenanceState | null>(null);
  const [refreshingProducts, setRefreshingProducts] = useState(false);
  const [refreshingProductBusiness, setRefreshingProductBusiness] =
    useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [maintenanceTab, setMaintenanceTab] =
    useState<"products" | "cart-videos">("products");
  const [cartVideoState, setCartVideoState] =
    useState<CartVideoAnalysisState | null>(null);
  const [refreshingCartVideos, setRefreshingCartVideos] = useState(false);
  const [exportingCartVideos, setExportingCartVideos] = useState(false);
  const [duringState, setDuringState] =
    useState<DuringInvestmentState | null>(null);
  const [discoveringDuringOrders, setDiscoveringDuringOrders] = useState(false);
  const [snapshotMachines, setSnapshotMachines] =
    useState<SnapshotMachinesState | null>(null);
  const [accountMenu, setAccountMenu] = useState<{
    account: Account;
    x: number;
    y: number;
  } | null>(null);
  const [duringPromotionId, setDuringPromotionId] = useState<
    string | undefined
  >();
  const browserHost = useRef<HTMLDivElement>(null);
  const detailAnalysisRequest = useRef(0);

  const loadAccounts = useCallback(async () => {
    const next = await window.wxad.accounts.list();
    setAccounts(next);
    setActiveAccountId((current) => current ?? next[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadAccounts().catch((reason) => setError(String(reason)));
    return window.wxad.browser.onState(setBrowserState);
  }, [loadAccounts]);

  useEffect(() => {
    if (!activeAccountId) {
      setSnapshotMachines(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const state =
          await window.wxad.snapshotMachines.getState(activeAccountId);
        if (active) setSnapshotMachines(state);
      } catch (reason) {
        if (active) setError(String(reason));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeAccountId]);

  useEffect(() => {
    if (!accountMenu) return;
    const close = () => setAccountMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [accountMenu]);

  useEffect(() => {
    if (
      !activeAccountId ||
      showAccountForm ||
      editingAccount ||
      mode !== "browser"
    ) {
      window.wxad.browser.hide();
      return;
    }
    window.wxad.browser
      .show(activeAccountId, activePlatform)
      .catch((reason) => setError(String(reason)));
  }, [
    activeAccountId,
    activePlatform,
    showAccountForm,
    editingAccount,
    mode,
  ]);

  useEffect(() => {
    if (!activeAccountId || mode !== "preinvest") return;
    let active = true;
    const loadLatestSnapshot = async () => {
      try {
        const [state, analysis] = await Promise.all([
          window.wxad.preinvest.getSyncState(activeAccountId),
          window.wxad.preinvest.getTrafficAnalysis(activeAccountId, undefined),
        ]);
        if (active) {
          setVideoSyncState(state);
          setTrafficAnalysis(analysis);
        }
      } catch (reason) {
        if (active) setError(String(reason));
      }
    };
    void loadLatestSnapshot();
    const timer = window.setInterval(() => {
      void loadLatestSnapshot();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeAccountId, mode]);

  const openPreinvestAnalysis = useCallback(
    async (exportId: string) => {
      if (!activeAccountId) return;
      const requestId = detailAnalysisRequest.current + 1;
      detailAnalysisRequest.current = requestId;
      setAnalysisTargetId(exportId);
      setDetailTrafficAnalysis(null);
      setAnalysisOpen(true);
      try {
        const analysis = await window.wxad.preinvest.getTrafficAnalysis(
          activeAccountId,
          exportId,
        );
        if (detailAnalysisRequest.current === requestId) {
          setDetailTrafficAnalysis(analysis);
        }
      } catch (reason) {
        if (detailAnalysisRequest.current === requestId) {
          setError(String(reason));
        }
      }
    },
    [activeAccountId],
  );

  useEffect(() => {
    if (!analysisOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAnalysisOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [analysisOpen]);

  useEffect(() => {
    if (!activeAccountId || mode !== "maintenance") return;
    if (maintenanceTab === "products") {
      window.wxad.products
        .getState(activeAccountId)
        .then(setProductState)
        .catch((reason) => setError(String(reason)));
    } else {
      window.wxad.cartVideoAnalysis
        .getState(activeAccountId)
        .then(setCartVideoState)
        .catch((reason) => setError(String(reason)));
    }
  }, [activeAccountId, maintenanceTab, mode]);

  useEffect(() => {
    if (!activeAccountId || mode !== "during") return;
    let active = true;
    const load = async () => {
      try {
        const state = await window.wxad.during.getCurrent(
          activeAccountId,
          duringPromotionId,
        );
        if (active) setDuringState(state);
      } catch (reason) {
        if (active) setError(String(reason));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeAccountId, duringPromotionId, mode]);

  useLayoutEffect(() => {
    const element = browserHost.current;
    if (!element) return;
    const updateBounds = () => {
      const rect = element.getBoundingClientRect();
      window.wxad.browser.setBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(element);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  const refreshAll = async () => {
    setChecking(true);
    setError(null);
    try {
      setAccounts((current) =>
        current.map((account) => ({ ...account, status: "checking" })),
      );
      setAccounts(await window.wxad.health.checkAll());
    } catch (reason) {
      setError(String(reason));
      await loadAccounts();
    } finally {
      setChecking(false);
    }
  };

  const createAccount = async (name: string, groupName: string) => {
    const account = await window.wxad.accounts.create({ name, groupName });
    await loadAccounts();
    setActiveAccountId(account.id);
    setActivePlatform("commerce");
    setShowAccountForm(false);
  };

  const activeAccount = accounts.find(
    (account) => account.id === activeAccountId,
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>WXAdCopilot</strong>
            <small>视频号量化投流助手</small>
          </div>
        </div>
        <nav className="primary-nav">
          <button
            className={mode === "browser" ? "active" : ""}
            onClick={() => setMode("browser")}
          >
            官网浏览
          </button>
          <button
            className={mode === "preinvest" ? "active" : ""}
            onClick={() => setMode("preinvest")}
          >
            投前分析
          </button>
          <button
            className={mode === "during" ? "active" : ""}
            onClick={() => {
              setDuringPromotionId(undefined);
              setDuringState(null);
              setMode("during");
            }}
          >
            投中监控
          </button>
          <button
            className={mode === "about" ? "active" : ""}
            onClick={() => setMode("about")}
          >
            关于
          </button>
          <button
            className={mode === "maintenance" ? "active" : ""}
            onClick={() => setMode("maintenance")}
          >
            系统数据维护
          </button>
        </nav>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-actions">
            <button className="primary" onClick={() => setShowAccountForm(true)}>
              ＋ 添加账号
            </button>
            <button
              className="icon-button"
              onClick={refreshAll}
              disabled={checking || accounts.length === 0}
              title="一键刷新全部登录状态"
            >
              {checking ? "…" : "↻"}
            </button>
          </div>
          <div className="account-heading">
            <span>账号列表</span>
            <span>{accounts.length}</span>
          </div>
          <div className="account-list">
            {accounts.length === 0 && (
              <div className="empty-list">添加第一个运营账号开始使用</div>
            )}
            {accounts.map((account) => (
              <button
                key={account.id}
                className={`account-card ${
                  account.id === activeAccountId ? "active" : ""
                }`}
                onClick={() => setActiveAccountId(account.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setActiveAccountId(account.id);
                  setAccountMenu({
                    account,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <span className="account-avatar">
                  {account.name.slice(0, 1)}
                </span>
                <span className="account-copy">
                  <strong>{account.name}</strong>
                  <small>{account.groupName || "未分组"}</small>
                </span>
                <span className={`status ${account.status}`}>
                  <i />
                  {STATUS_LABELS[account.status]}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {accountMenu && (
          <div
            className="account-context-menu"
            style={{ left: accountMenu.x, top: accountMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditingAccount(accountMenu.account);
                setAccountMenu(null);
              }}
            >
              编辑账号
            </button>
            <button
              className="danger"
              onClick={async () => {
                const target = accountMenu.account;
                setAccountMenu(null);
                const confirmed = window.confirm(
                  `确定删除账号“${target.name}”吗？这会同时清除该账号的本地登录态。`,
                );
                if (!confirmed) return;
                await window.wxad.accounts.delete(target.id);
                const next = await window.wxad.accounts.list();
                setAccounts(next);
                setActiveAccountId(next[0]?.id ?? null);
              }}
            >
              删除账号
            </button>
          </div>
        )}

        <main className="main-panel">
          <div className="account-tabs">
            <div className="account-banner-identity">
              <strong>{activeAccount?.name ?? "请选择账号"}</strong>
            </div>
            {activeAccount && snapshotMachines && (
              <div className="snapshot-machine-strip">
                <SnapshotMachineBadge
                  label="投前快照"
                  machine={snapshotMachines.preinvest}
                />
                <SnapshotMachineBadge
                  label="投中快照"
                  machine={snapshotMachines.during}
                />
              </div>
            )}
          </div>

          <div className="module-stage">
            <section
              className={`browser-surface ${
                mode === "browser" ? "active" : "inactive"
              }`}
            >
              <div className="platform-tabs">
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((platform) => (
                  <button
                    key={platform}
                    className={platform === activePlatform ? "active" : ""}
                    onClick={() => setActivePlatform(platform)}
                    disabled={!activeAccount}
                  >
                    {PLATFORM_LABELS[platform]}
                    {activeAccount && (
                      <i
                        className={
                          activeAccount.platforms[platform].status === "online"
                            ? "online"
                            : activeAccount.platforms[platform].status ===
                                "offline"
                              ? "offline"
                              : "unknown"
                        }
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="browser-toolbar">
                <button
                  onClick={() => window.wxad.browser.navigate("back")}
                  disabled={!browserState?.canGoBack}
                >
                  ←
                </button>
                <button
                  onClick={() => window.wxad.browser.navigate("forward")}
                  disabled={!browserState?.canGoForward}
                >
                  →
                </button>
                <button onClick={() => window.wxad.browser.navigate("reload")}>
                  ↻
                </button>
                <button onClick={() => window.wxad.browser.navigate("home")}>
                  ⌂
                </button>
                <div className="address">
                  {browserState?.loading && <span className="spinner" />}
                  <span>{browserState?.url || "打开官方后台后显示网址"}</span>
                </div>
              </div>

              <div className="browser-host" ref={browserHost}>
                {!activeAccount && (
                  <div className="browser-placeholder">
                    <span>W</span>
                    <h2>添加一个账号，开始浏览官方后台</h2>
                    <p>每个账号都会使用完全隔离且持久化的登录环境。</p>
                  </div>
                )}
              </div>
            </section>

            {mode === "preinvest" && (
              <section className="preinvest-panel">
                <div className="preinvest-heading">
                  <div>
                    <span className="eyebrow">投前快照</span>
                    <h1>流量曲线分析</h1>
                    <p>只读分析本地快照机保存的真实数据。</p>
                  </div>
                </div>

              <div className="sync-summary">
                <div>
                  <small>近14天视频</small>
                  <strong>{videoSyncState?.videos.length ?? 0}</strong>
                </div>
                <div>
                  <small>已挂车</small>
                  <strong>
                    {videoSyncState?.videos.filter(
                      (video) => video.commerceStatus === "cart",
                    ).length ?? 0}
                  </strong>
                </div>
                <div>
                  <small>未挂车</small>
                  <strong>
                    {videoSyncState?.videos.filter(
                      (video) => video.commerceStatus === "no_cart",
                    ).length ?? 0}
                  </strong>
                </div>
                <div>
                  <small>快照机</small>
                  <strong>
                    {videoSyncState?.lastError
                      ? "最近执行失败"
                      : videoSyncState?.lastSyncedAt
                        ? "自动运行中"
                        : "等待首次快照"}
                  </strong>
                </div>
                <div>
                  <small>最后更新</small>
                  <strong className="date-value">
                    {videoSyncState?.lastSyncedAt
                      ? new Date(videoSyncState.lastSyncedAt).toLocaleString()
                      : "尚未同步"}
                  </strong>
                </div>
              </div>

              {videoSyncState?.lastError && (
                <div className="inline-error">{videoSyncState.lastError}</div>
              )}

              <PreinvestDataTable
                videos={videoSyncState?.videos ?? []}
                analysis={trafficAnalysis}
                onAnalyze={(exportId) => void openPreinvestAnalysis(exportId)}
              />
              </section>
            )}
            {mode === "maintenance" && (
              <section className="maintenance-workspace">
                <div className="maintenance-tabs">
                  <button
                    className={maintenanceTab === "products" ? "active" : ""}
                    onClick={() => setMaintenanceTab("products")}
                  >
                    商品数据库
                  </button>
                  <button
                    className={
                      maintenanceTab === "cart-videos" ? "active" : ""
                    }
                    onClick={() => setMaintenanceTab("cart-videos")}
                  >
                    带货视频分析
                  </button>
                </div>
                {maintenanceTab === "products" && (
                  <ProductDatabasePanel
                    state={productState}
                    refreshing={refreshingProducts}
                    refreshingBusiness={refreshingProductBusiness}
                    exporting={exportingProducts}
                    disabled={!activeAccountId}
                    onRefresh={async () => {
                      if (!activeAccountId) return;
                      setRefreshingProducts(true);
                      setError(null);
                      try {
                        setProductState(
                          await window.wxad.products.refresh(activeAccountId),
                        );
                      } catch (reason) {
                        setError(String(reason));
                      } finally {
                        setRefreshingProducts(false);
                      }
                    }}
                    onRefreshBusiness={async () => {
                      if (!activeAccountId) return;
                      setRefreshingProductBusiness(true);
                      setError(null);
                      try {
                        setProductState(
                          await window.wxad.products.refreshBusinessData(
                            activeAccountId,
                          ),
                        );
                      } catch (reason) {
                        setError(String(reason));
                      } finally {
                        setRefreshingProductBusiness(false);
                      }
                    }}
                    onExport={async () => {
                      if (!activeAccountId) return;
                      setExportingProducts(true);
                      setError(null);
                      try {
                        await window.wxad.products.exportExcel(activeAccountId);
                      } catch (reason) {
                        setError(String(reason));
                      } finally {
                        setExportingProducts(false);
                      }
                    }}
                  />
                )}
                {maintenanceTab === "cart-videos" && (
                  <CartVideoAnalysisPanel
                    state={cartVideoState}
                    refreshing={refreshingCartVideos}
                    exporting={exportingCartVideos}
                    disabled={!activeAccountId}
                    onRefresh={async () => {
                      if (!activeAccountId) return;
                      setRefreshingCartVideos(true);
                      setError(null);
                      try {
                        setCartVideoState(
                          await window.wxad.cartVideoAnalysis.refresh(
                            activeAccountId,
                          ),
                        );
                      } catch (reason) {
                        setError(String(reason));
                      } finally {
                        setRefreshingCartVideos(false);
                      }
                    }}
                    onExport={async () => {
                      if (!activeAccountId) return;
                      setExportingCartVideos(true);
                      setError(null);
                      try {
                        await window.wxad.cartVideoAnalysis.exportExcel(
                          activeAccountId,
                        );
                      } catch (reason) {
                        setError(String(reason));
                      } finally {
                        setExportingCartVideos(false);
                      }
                    }}
                  />
                )}
              </section>
            )}
            {mode === "during" && (
              <DuringOrderSnapshotPanel
                state={duringState}
                selectedPromotionId={duringPromotionId}
                onSelect={(promotionId) => {
                  setDuringPromotionId(promotionId);
                  setDuringState(null);
                }}
                onBack={() => {
                  setDuringPromotionId(undefined);
                  setDuringState(null);
                }}
                discovering={discoveringDuringOrders}
                onDiscoverNow={async () => {
                  if (!activeAccountId) return;
                  setDiscoveringDuringOrders(true);
                  setError(null);
                  try {
                    const state = await window.wxad.during.discoverNow(
                      activeAccountId,
                    );
                    setDuringState(state);
                    setSnapshotMachines(
                      await window.wxad.snapshotMachines.getState(
                        activeAccountId,
                      ),
                    );
                  } catch (reason) {
                    setError(String(reason));
                  } finally {
                    setDiscoveringDuringOrders(false);
                  }
                }}
              />
            )}
            {mode === "about" && <AboutPanel />}
          </div>
        </main>
      </div>

      {showAccountForm && (
        <AccountForm
          title="添加运营账号"
          onCancel={() => setShowAccountForm(false)}
          onSubmit={createAccount}
        />
      )}
      {editingAccount && (
        <AccountForm
          title="编辑运营账号"
          initialName={editingAccount.name}
          initialGroupName={editingAccount.groupName}
          onCancel={() => setEditingAccount(null)}
          onSubmit={async (name, groupName) => {
            await window.wxad.accounts.update(editingAccount.id, {
              name,
              groupName,
            });
            await loadAccounts();
            setEditingAccount(null);
          }}
        />
      )}
      {analysisOpen && (
        <div
          className="analysis-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAnalysisOpen(false);
          }}
        >
          <section className="analysis-modal" role="dialog" aria-modal="true" aria-label="视频分析">
            <div className="analysis-modal-toolbar">
              <div>
                <span className="eyebrow">单视频分析</span>
                <strong>自然流生命周期对比</strong>
              </div>
              <button
                type="button"
                aria-label="关闭分析窗口"
                onClick={() => setAnalysisOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="analysis-modal-body">
              <TrafficCurveDashboard
                analysis={detailTrafficAnalysis}
                video={(videoSyncState?.videos ?? []).find(
                  (item) => item.exportId === analysisTargetId,
                ) ?? null}
              />
            </div>
          </section>
        </div>
      )}
      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  );
}

function AboutPanel() {
  return (
    <section className="about-panel">
      <div className="about-hero">
        <span className="about-logo">W</span>
        <div>
          <span className="eyebrow">关于项目</span>
          <h1>WXAdCopilot</h1>
          <p>本地优先的视频号带货投流量化分析与智能盯盘工具。</p>
        </div>
        <span className="about-version">v0.2.0</span>
      </div>

      <div className="about-grid">
        <article className="about-card about-card-feature">
          <span className="about-card-index">01</span>
          <div>
            <h2>投前分析</h2>
            <p>持续保存视频数据快照，通过生命周期曲线与净佣金指标辅助发现值得测试投放的视频。</p>
          </div>
          <span className="about-status done">已完成初版</span>
        </article>
        <article className="about-card about-card-feature">
          <span className="about-card-index">02</span>
          <div>
            <h2>投中监控</h2>
            <p>高频跟踪订单消耗、成交与收益变化，为投手提供实时盯盘数据和止损依据。</p>
          </div>
          <span className="about-status done">已完成初版</span>
        </article>
        <article className="about-card about-card-feature muted">
          <span className="about-card-index">03</span>
          <div>
            <h2>投后复盘</h2>
            <p>订单结算、策略归因和历史模型校正尚在规划中，当前版本不包含该功能。</p>
          </div>
          <span className="about-status planned">规划中</span>
        </article>
      </div>

      <div className="about-lower-grid">
        <article className="about-card">
          <span className="eyebrow">数据与隐私</span>
          <h2>数据留在自己的电脑</h2>
          <p>
            账号、登录态、业务数据和分析快照默认只保存在本机。软件不会随安装包分发任何开发者账号或数据库。
          </p>
        </article>
        <article className="about-card">
          <span className="eyebrow">开放协作</span>
          <h2>项目源代码</h2>
          <p>欢迎查看代码、提交问题并参与改进。</p>
          <a
            className="about-contact-link"
            href="https://github.com/luyingxue/WXAdCopilot"
            target="_blank"
            rel="noreferrer"
          >
            github.com/luyingxue/WXAdCopilot
          </a>
        </article>
        <article className="about-card about-contact-card">
          <span className="eyebrow">商业合作</span>
          <h2>需要开发其他系统？</h2>
          <p>
            如果你需要数据分析、业务自动化或桌面管理系统，欢迎联系作者交流或定制开发。
          </p>
          <a
            className="about-contact-link emphasis"
            href="mailto:support@zwill.org"
          >
            support@zwill.org
          </a>
        </article>
      </div>

      <footer className="about-footer">
        <span>WXAdCopilot</span>
        <span>让投流判断建立在持续、可复盘的数据之上。</span>
      </footer>
    </section>
  );
}

function formatSnapshotTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function SnapshotMachineBadge({
  label,
  machine,
}: {
  label: string;
  machine: SnapshotMachinesState["preinvest"];
}) {
  return (
    <div className={`snapshot-machine-badge ${machine.state}`}>
      <span className="snapshot-machine-title">
        <i />
        <strong>{label}</strong>
        <small>{machine.message}</small>
      </span>
      <span>
        <small>最近</small>
        <b>{formatSnapshotTime(machine.lastRefreshedAt)}</b>
      </span>
      <span>
        <small>下次</small>
        <b>{formatSnapshotTime(machine.nextRefreshAt)}</b>
      </span>
    </div>
  );
}

function CartVideoAnalysisPanel({
  state,
  refreshing,
  exporting,
  disabled,
  onRefresh,
  onExport,
}: {
  state: CartVideoAnalysisState | null;
  refreshing: boolean;
  exporting: boolean;
  disabled: boolean;
  onRefresh: () => Promise<void>;
  onExport: () => Promise<void>;
}) {
  return (
    <section className="cart-video-analysis-panel">
      <div className="product-database-heading">
        <div>
          <span className="eyebrow">系统数据维护</span>
          <h1>带货视频分析</h1>
          <p>
            手工读取账号全部历史视频的当前累计数据，只保留确认挂车的视频，不生成时序快照。
          </p>
        </div>
        <div className="maintenance-heading-actions">
          <button
            className="secondary-action"
            disabled={disabled || exporting || !(state?.videos.length)}
            onClick={() => void onExport()}
          >
            {exporting ? "正在导出…" : "导出 Excel"}
          </button>
          <button
            className="product-refresh-button"
            disabled={disabled || refreshing}
            onClick={() => void onRefresh()}
          >
            {refreshing ? "正在刷新全部视频…" : "手工刷新"}
          </button>
        </div>
      </div>
      <div className="product-summary cart-video-summary">
        <div>
          <small>已挂车视频</small>
          <strong>{state?.videos.length ?? 0}</strong>
        </div>
        <div>
          <small>扫描视频</small>
          <strong>{state?.scannedCount ?? 0}</strong>
        </div>
        <div>
          <small>本次请求</small>
          <strong>{state?.requestCount ?? 0}</strong>
        </div>
        <div>
          <small>详情请求</small>
          <strong>{state?.detailRequestCount ?? 0}</strong>
        </div>
        <div>
          <small>最后更新</small>
          <strong>
            {state?.lastSyncedAt
              ? new Date(state.lastSyncedAt).toLocaleString()
              : "尚未刷新"}
          </strong>
        </div>
      </div>
      {state?.lastError && <div className="inline-error">{state.lastError}</div>}
      <LegacyPreinvestDataTable videos={state?.videos ?? []} />
    </section>
  );
}

function ProductDatabasePanel({
  state,
  refreshing,
  refreshingBusiness,
  exporting,
  disabled,
  onRefresh,
  onRefreshBusiness,
  onExport,
}: {
  state: ProductMaintenanceState | null;
  refreshing: boolean;
  refreshingBusiness: boolean;
  exporting: boolean;
  disabled: boolean;
  onRefresh: () => Promise<void>;
  onRefreshBusiness: () => Promise<void>;
  onExport: () => Promise<void>;
}) {
  const products = state?.products ?? [];
  const totalCartVideos = products.reduce(
    (sum, product) => sum + product.cartVideoCount,
    0,
  );
  const totalNetGmv = products.reduce(
    (sum, product) => sum + product.netGmvYuan,
    0,
  );
  const totalEstimatedCommission = products.reduce(
    (sum, product) => sum + (product.estimatedNetCommissionYuan ?? 0),
    0,
  );
  const busy = refreshing || refreshingBusiness || exporting;
  const money = (value: number | null) =>
    value === null
      ? "—"
      : `¥${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
  const percent = (value: number | null) =>
    value === null ? "—" : `${(value * 100).toFixed(2)}%`;
  return (
    <section className="product-database-panel">
      <div className="product-database-heading">
        <div>
          <span className="eyebrow">系统数据维护</span>
          <h1>商品数据库</h1>
          <p>
            汇总全部历史挂车视频的当前经营结果，作为选品、内容效率和佣金分析依据。
          </p>
        </div>
        <div className="maintenance-heading-actions">
          <button
            className="secondary-action"
            disabled={disabled || busy || products.length === 0}
            onClick={() => void onExport()}
          >
            {exporting ? "正在导出…" : "导出 Excel"}
          </button>
          <button
            className="secondary-action"
            disabled={disabled || busy}
            onClick={() => void onRefreshBusiness()}
          >
            {refreshingBusiness ? "正在刷新经营数据…" : "刷新经营数据"}
          </button>
          <button
            className="product-refresh-button"
            disabled={disabled || busy}
            onClick={() => void onRefresh()}
          >
            {refreshing ? "正在刷新商品资料…" : "刷新商品资料"}
          </button>
        </div>
      </div>
      <div className="product-summary">
        <div>
          <small>商品总数</small>
          <strong>{products.length}</strong>
        </div>
        <div>
          <small>推广中</small>
          <strong>
            {state?.products.filter((item) => item.promotionStatus === "active")
              .length ?? 0}
          </strong>
        </div>
        <div>
          <small>历史挂车视频</small>
          <strong>{totalCartVideos.toLocaleString()}</strong>
        </div>
        <div>
          <small>佣金比例覆盖</small>
          <strong>
            {products.filter((product) => product.commissionRate !== null).length}
            /{products.length}
          </strong>
        </div>
        <div>
          <small>累计净成交</small>
          <strong>{money(totalNetGmv)}</strong>
        </div>
        <div>
          <small>估算净佣金（已覆盖）</small>
          <strong>{money(totalEstimatedCommission)}</strong>
        </div>
        <div>
          <small>经营数据更新</small>
          <strong>
            {state?.businessLastSyncedAt
              ? new Date(state.businessLastSyncedAt).toLocaleString()
              : "尚未刷新"}
          </strong>
        </div>
      </div>
      <div className="product-table-wrap">
        <table className="product-table">
          <thead>
            <tr>
              <th colSpan={7}>商品资料</th>
              <th colSpan={4}>内容覆盖</th>
              <th colSpan={4}>转化效率</th>
              <th colSpan={5}>经营结果</th>
              <th colSpan={3}>数据时间</th>
            </tr>
            <tr>
              <th>商品ID</th><th>外部商品ID</th><th>商品名称</th>
              <th>商品短标题</th><th>商家/店铺</th><th>佣金比例</th><th>推广状态</th>
              <th>挂车视频</th><th>有成交视频</th><th>视频成交率</th><th>累计观看</th>
              <th>商品点击</th><th>观看点击率</th><th>成交订单</th><th>点击成交率</th>
              <th>成交金额</th><th>退款金额</th><th>净成交金额</th>
              <th>估算净佣金</th><th>千次观看净佣金</th>
              <th>最近挂车发布</th><th>商品资料更新</th><th>经营数据更新</th>
            </tr>
          </thead>
          <tbody>
            {(state?.products ?? []).map((product) => (
              <tr key={product.productId}>
                <td className="mono">{product.productId}</td>
                <td className="mono">{product.outProductId ?? "—"}</td>
                <td className="product-name-cell" title={product.title}>
                  {product.title || "—"}
                </td>
                <td>{product.shortTitle || "—"}</td>
                <td>{product.shopName || "—"}</td>
                <td>
                  {product.commissionRate === null
                    ? "待获取"
                    : `${(product.commissionRate * 100).toFixed(1)}%`}
                </td>
                <td>
                  {product.promotionStatus === "active"
                    ? "推广中"
                    : product.promotionStatus === "ended"
                      ? "已结束"
                      : "未知"}
                </td>
                <td>{product.cartVideoCount.toLocaleString()}</td>
                <td>{product.transactingVideoCount.toLocaleString()}</td>
                <td>{percent(product.videoConversionRate)}</td>
                <td>{product.totalViewsCount.toLocaleString()}</td>
                <td>{product.totalProductClickCount.toLocaleString()}</td>
                <td>{percent(product.viewClickRate)}</td>
                <td>{product.totalPaidOrderCount.toLocaleString()}</td>
                <td>{percent(product.clickConversionRate)}</td>
                <td>{money(product.totalPaidGmvYuan)}</td>
                <td>{money(product.totalRefundGmvYuan)}</td>
                <td>{money(product.netGmvYuan)}</td>
                <td>{money(product.estimatedNetCommissionYuan)}</td>
                <td>{money(product.netCommissionPerThousandViews)}</td>
                <td>
                  {product.latestVideoPublishTime
                    ? new Date(product.latestVideoPublishTime).toLocaleString()
                    : "—"}
                </td>
                <td>{new Date(product.syncedAt).toLocaleString()}</td>
                <td>
                  {state?.businessLastSyncedAt
                    ? new Date(state.businessLastSyncedAt).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state?.products.length && (
          <div className="empty-videos">
            当前账号尚无商品数据，点击右上角“刷新商品资料”。
          </div>
        )}
      </div>
    </section>
  );
}

function PreinvestDataTable({
  videos,
  analysis,
  onAnalyze,
}: {
  videos: VideoSyncState["videos"];
  analysis: TrafficCurveAnalysis | null;
  onAnalyze: (exportId: string) => void;
}) {
  const curveById = new Map(
    (analysis?.candidates ?? []).map((candidate) => [
      candidate.exportId,
      candidate,
    ]),
  );
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - 13);
  const cutoff = cutoffDate.getTime();
  const rows = videos
    .filter(
      (video) =>
        video.commerceStatus === "cart" &&
        new Date(video.publishTime).getTime() >= cutoff,
    )
    .map((video) => {
      const curve = curveById.get(video.exportId);
      const commerce = calculatePreinvestCommerce(video);
      return {
        video,
        curve,
        commerce,
        decision: decidePreinvestCandidate(video, curve, commerce),
      };
    })
    .sort((a, b) => {
      const rank = { test: 0, observe: 1, insufficient: 2, reject: 3 };
      return (
        rank[a.decision.state] - rank[b.decision.state] ||
        (b.curve?.currentPercentile ?? -1) -
          (a.curve?.currentPercentile ?? -1)
      );
    });
  const money = (value: number | null) =>
    value === null ? "—" : `¥${value.toFixed(2)}`;
  const thousandViewCommissionP75 =
    analysis?.commerceBaseline.thousandViewNetCommissionYuan?.p75 ?? null;
  const trendLabel = {
    accelerating: "加速",
    stable: "稳定",
    decelerating: "衰减",
    insufficient: "待观察",
  };
  return (
    <div className="preinvest-decision-list">
      <div className="preinvest-list-note">
        <span>近14天挂车视频</span>
        <strong>{rows.length}</strong>
        <p>按投前建议和生命周期位置排序，点击任意视频查看完整依据。</p>
      </div>
      <div className="preinvest-decision-table-wrap">
        <table className="preinvest-decision-table">
          <thead>
            <tr>
              <th>视频与商品</th>
              <th>发布时长</th>
              <th>播放</th>
              <th>同阶段</th>
              <th>近2小时流速</th>
              <th>当前总净佣金</th>
              <th>近2小时净佣金</th>
              <th>基线倍数</th>
              <th>趋势</th>
              <th>千次观看净佣金</th>
              <th>投前判断</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ video, curve, commerce, decision }) => {
              const ageHours =
                (Date.now() - new Date(video.publishTime).getTime()) /
                3_600_000;
              return (
                <tr
                  key={video.exportId}
                  tabIndex={0}
                  onClick={() => onAnalyze(video.exportId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onAnalyze(video.exportId);
                    }
                  }}
                >
                  <td className="preinvest-video-cell" title={video.title}>
                    <strong>{video.title || "无标题视频"}</strong>
                    <span>{video.productName ?? "商品名称待同步"}</span>
                    <small>{new Date(video.publishTime).toLocaleString()}</small>
                  </td>
                  <td>
                    {ageHours < 48
                      ? `${ageHours.toFixed(1)}小时`
                      : `${Math.floor(ageHours / 24)}天`}
                  </td>
                  <td>{video.viewsCount.toLocaleString()}</td>
                  <td>
                    {curve?.currentPercentile === null ||
                    curve?.currentPercentile === undefined
                      ? "—"
                      : `P${Math.round(curve.currentPercentile)}`}
                  </td>
                  <td>
                    {curve?.recentSlopePerHour === null ||
                    curve?.recentSlopePerHour === undefined
                      ? "—"
                      : `${Math.round(curve.recentSlopePerHour).toLocaleString()}/时`}
                  </td>
                  <td className="commission-value">
                    {money(commerce.estimatedNetCommissionYuan)}
                  </td>
                  <td className="commission-value">
                    {curve?.recentNetCommissionYuan === null ||
                    curve?.recentNetCommissionYuan === undefined
                      ? "—"
                      : `¥${curve.recentNetCommissionYuan.toFixed(2)}`}
                  </td>
                  <td>
                    {curve?.slopeVsBaseline === null ||
                    curve?.slopeVsBaseline === undefined
                      ? "—"
                      : `${curve.slopeVsBaseline.toFixed(1)}倍`}
                  </td>
                  <td className={`trend-${curve?.trend ?? "insufficient"}`}>
                    {trendLabel[curve?.trend ?? "insufficient"]}
                  </td>
                  <td
                    className={`commission-value ${
                      thousandViewCommissionP75 !== null &&
                      commerce.thousandViewNetCommissionYuan !== null &&
                      commerce.thousandViewNetCommissionYuan >
                        thousandViewCommissionP75
                        ? "commission-above-p75"
                        : ""
                    }`}
                  >
                    <span>
                      {money(commerce.thousandViewNetCommissionYuan)}
                    </span>
                    {thousandViewCommissionP75 !== null &&
                      commerce.thousandViewNetCommissionYuan !== null &&
                      commerce.thousandViewNetCommissionYuan >
                        thousandViewCommissionP75 && (
                        <em>超过 P75</em>
                      )}
                    <small
                      className={`confidence-${commerce.sampleConfidence}`}
                    >
                      {commerce.sampleConfidence === "ready"
                        ? "样本可信"
                        : commerce.sampleConfidence === "low"
                          ? "低样本，谨慎"
                          : "样本不足"}
                    </small>
                  </td>
                  <td>
                    <span className={`preinvest-decision ${decision.state}`}>
                      {decision.label}
                    </span>
                    <small className="decision-reason">{decision.reason}</small>
                  </td>
                  <td className="preinvest-row-arrow">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-videos">近14天尚无可分析的挂车视频。</div>
        )}
      </div>
    </div>
  );
}

function LegacyPreinvestDataTable({
  videos,
  onAnalyze,
}: {
  videos: VideoSyncState["videos"];
  onAnalyze?: (exportId: string) => void;
}) {
  const percent = (value: number | null, digits = 1) =>
    value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
  return (
    <div className="snapshot-table-wrap">
      <table className="snapshot-table">
        <thead>
          <tr className="group-header">
            <th colSpan={10} className="basic-group">基础信息</th>
            <th colSpan={8} className="interaction-group">互动信息</th>
            <th colSpan={18} className="commerce-group">带货信息</th>
          </tr>
          <tr>
            <th>exportId</th>
            <th>feedId</th>
            <th>视频</th>
            <th>发布时间</th>
            <th>累计播放</th>
            <th>累计观看</th>
            <th>平均观看</th>
            <th>累计完播</th>
            <th>完播率</th>
            <th>流量来源</th>
            <th>爱心赞</th>
            <th>拇指赞</th>
            <th>评论</th>
            <th>转发</th>
            <th>关注</th>
            <th>互动总数</th>
            <th>互动率</th>
            <th>关注率</th>
            <th>挂车状态</th>
            <th>商品ID</th>
            <th>商品名称</th>
            <th>佣金比例</th>
            <th>累计曝光</th>
            <th>累计点击</th>
            <th>点击率</th>
            <th>累计成交</th>
            <th>GPM</th>
            <th>成交订单</th>
            <th>点击成交率</th>
            <th>累计退款</th>
            <th>退款订单</th>
            <th>订单退款率</th>
            <th>净成交额</th>
            <th>预估净佣金</th>
            <th>千次观看净佣金</th>
            <th>千次点击净佣金</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => {
            const interactions =
              video.likesCount +
              video.favoritesCount +
              video.commentsCount +
              video.forwardsCount;
            const isCart = video.commerceStatus === "cart";
            const clickRate =
              isCart &&
              video.productExposeCount !== null &&
              video.productExposeCount > 0 &&
              video.productClickCount !== null
                ? video.productClickCount / video.productExposeCount
                : null;
            const conversionRate =
              isCart &&
              video.productClickCount !== null &&
              video.productClickCount > 0 &&
              video.paidOrderCount !== null
                ? video.paidOrderCount / video.productClickCount
                : null;
            const refundRate =
              isCart &&
              video.paidOrderCount !== null &&
              video.paidOrderCount > 0 &&
              video.refundOrderCount !== null
                ? video.refundOrderCount / video.paidOrderCount
                : null;
            const netGmvYuan = isCart
              ? (video.paidGmvYuan ?? 0) - (video.refundGmvYuan ?? 0)
              : null;
            const estimatedNetCommissionYuan =
              netGmvYuan === null || video.commissionRate === null
                ? null
                : netGmvYuan * video.commissionRate;
            const thousandViewNetCommissionYuan =
              estimatedNetCommissionYuan === null || video.viewsCount === 0
                ? null
                : (estimatedNetCommissionYuan / video.viewsCount) * 1000;
            const thousandClickNetCommissionYuan =
              estimatedNetCommissionYuan === null ||
              (video.productClickCount ?? 0) === 0
                ? null
                : (estimatedNetCommissionYuan / video.productClickCount!) *
                  1000;
            const traffic = video.trafficSources
              ? Object.entries(video.trafficSources)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => `${name} ${count}`)
                  .join(" / ")
              : "—";
            return (
              <tr
                key={video.exportId}
                className={onAnalyze ? "analyzable-row" : undefined}
                tabIndex={onAnalyze ? 0 : undefined}
                title={onAnalyze ? "点击查看该视频的生命周期分析" : undefined}
                onClick={() => onAnalyze?.(video.exportId)}
                onKeyDown={(event) => {
                  if (
                    onAnalyze &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onAnalyze(video.exportId);
                  }
                }}
              >
                <td className="mono" title={video.exportId}>{video.exportId}</td>
                <td className="mono">{video.feedId ?? "—"}</td>
                <td className="snapshot-title" title={video.title}>
                  <span>{video.title || "无标题视频"}</span>
                  {onAnalyze && <small>查看分析</small>}
                </td>
                <td>{new Date(video.publishTime).toLocaleString()}</td>
                <td>{video.viewsCount.toLocaleString()}</td>
                <td>
                  {video.totalWatchTimeSec === null
                    ? "—"
                    : `${video.totalWatchTimeSec.toLocaleString()}s`}
                </td>
                <td>
                  {video.averageWatchTimeSec === null
                    ? "—"
                    : `${video.averageWatchTimeSec.toFixed(1)}s`}
                </td>
                <td>{video.fullWatchCount?.toLocaleString() ?? "—"}</td>
                <td>{percent(video.completionRate)}</td>
                <td className="traffic-cell" title={traffic}>{traffic}</td>
                <td>{video.likesCount.toLocaleString()}</td>
                <td>{video.favoritesCount.toLocaleString()}</td>
                <td>{video.commentsCount.toLocaleString()}</td>
                <td>{video.forwardsCount.toLocaleString()}</td>
                <td>{video.followsCount.toLocaleString()}</td>
                <td>{interactions.toLocaleString()}</td>
                <td>
                  {percent(
                    video.viewsCount === 0
                      ? null
                      : interactions / video.viewsCount,
                  )}
                </td>
                <td>
                  {percent(
                    video.viewsCount === 0
                      ? null
                      : video.followsCount / video.viewsCount,
                    2,
                  )}
                </td>
                <td className={`cart-status ${video.commerceStatus}`}>
                  {video.commerceStatus === "cart"
                    ? "已挂车"
                    : video.commerceStatus === "no_cart"
                      ? "未挂车"
                      : "待确认"}
                </td>
                <td className="mono">{isCart ? video.productId : "—"}</td>
                <td title={video.productName ?? ""}>
                  {isCart ? video.productName ?? "—" : "—"}
                </td>
                <td>
                  {isCart
                    ? video.commissionRate === null
                      ? video.commissionDataStatus === "product_not_found"
                        ? "商品已不在橱窗"
                        : "官方未提供"
                      : `${(video.commissionRate * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td>
                  {isCart
                    ? (video.productExposeCount ?? 0).toLocaleString()
                    : "—"}
                </td>
                <td>
                  {isCart
                    ? (video.productClickCount ?? 0).toLocaleString()
                    : "—"}
                </td>
                <td>{percent(clickRate, 2)}</td>
                <td>
                  {isCart ? `¥${(video.paidGmvYuan ?? 0).toFixed(2)}` : "—"}
                </td>
                <td>
                  {isCart && video.gpmPerThousandViews !== null
                    ? `¥${video.gpmPerThousandViews.toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  {isCart
                    ? (video.paidOrderCount ?? 0).toLocaleString()
                    : "—"}
                </td>
                <td>{percent(conversionRate, 2)}</td>
                <td>
                  {isCart ? `¥${(video.refundGmvYuan ?? 0).toFixed(2)}` : "—"}
                </td>
                <td>
                  {isCart
                    ? (video.refundOrderCount ?? 0).toLocaleString()
                    : "—"}
                </td>
                <td>{percent(refundRate, 2)}</td>
                <td>
                  {isCart
                    ? `¥${(netGmvYuan ?? 0).toFixed(2)}`
                    : "—"}
                </td>
                <td>
                  {estimatedNetCommissionYuan === null
                    ? "—"
                    : `¥${estimatedNetCommissionYuan.toFixed(2)}`}
                </td>
                <td>
                  {thousandViewNetCommissionYuan === null
                    ? "—"
                    : `¥${thousandViewNetCommissionYuan.toFixed(2)}`}
                </td>
                <td>
                  {thousandClickNetCommissionYuan === null
                    ? "—"
                    : `¥${thousandClickNetCommissionYuan.toFixed(2)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!videos.length && (
        <div className="empty-videos">快照机尚未保存该账号的数据。</div>
      )}
    </div>
  );
}

function AccountForm({
  title,
  initialName = "",
  initialGroupName = "",
  onCancel,
  onSubmit,
}: {
  title: string;
  initialName?: string;
  initialGroupName?: string;
  onCancel: () => void;
  onSubmit: (name: string, groupName: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [groupName, setGroupName] = useState(initialGroupName);
  const [saving, setSaving] = useState(false);

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          setSaving(true);
          await onSubmit(name, groupName);
        }}
      >
        <h2>{title}</h2>
        <p>账号使用独立且持久化的浏览器登录环境。</p>
        <label>
          账号名称
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：主账号"
          />
        </label>
        <label>
          分组
          <input
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="例如：教育类账号"
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary" disabled={!name.trim() || saving}>
            {saving ? "正在保存…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
