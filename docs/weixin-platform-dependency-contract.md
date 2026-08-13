# 微信平台外部依赖契约

**版本：** 1.0  
**最后实测：** 2026-07-27  
**适用范围：** 微信小店带货助手、电商罗盘、视频号加热平台

## 1. 文档定位

三个官方平台均为 WXAdCopilot 无法控制的外部依赖。本文件只记录真实环境中
已经复现的行为，以及系统必须遵守的适配边界。观察结果不等于微信公开、永久
保证的 API 契约；平台页面、认证和接口发生变化时，应先更新本文件和对应
Platform Gateway，再调整上层业务。

事实分为三类：

- **已实测**：在真实账号和当前 Electron/Chromium 环境中重复验证；
- **系统约束**：为避免冲突，WXAdCopilot 必须遵守；
- **待持续回归**：平台可能随时改变，不能写死为永久规则。

## 2. 平台与身份域

| 平台 | 官方入口 | 身份域 | 已实测关系 |
|---|---|---|---|
| 微信小店带货助手 | `https://store.weixin.qq.com/talent/` | Store | Store 身份入口 |
| 电商罗盘 | `https://store.weixin.qq.com/compass/` | Store | 与带货助手共享同一微信小店身份 |
| 视频号加热平台 | `https://channels.weixin.qq.com/promote/pages/platform/` | Promote | 与 Store 隔离 |

系统约束：

1. 每个业务账号固定拥有一个 Store 容器和一个 Promote 容器。
2. Talent 与 Compass 共享 Store Session，但各自使用独立可见页面。
3. Promote 使用独立 Session，不复制 Store Cookie。
4. 不同业务账号不得共享 Session、页面或隐藏执行器。
5. 视频号助手已退出当前运行链路，不得作为投前采集或登录中转依赖。

## 3. 登录与持久化规则

### 3.1 Store（带货助手与电商罗盘）

已实测：

- 带货助手可以直接建立 Store 登录态。
- 同一微信身份下，从带货助手进入电商罗盘可以建立有效罗盘授权。
- 在部分真实登录过程中，直接对罗盘扫码会出现扫码后立即失效；通过带货助手
  进入罗盘后可以正常使用。
- Talent 与 Compass 共享认证，但页面运行上下文不能共享；任一采集任务不得
  导航用户正在浏览的页面。
- Store 的关键凭据包含 Chromium 默认不跨进程恢复的 Session Cookie，仅依赖
  `persist:` 分区会在应用重启后丢失登录。
- 2026-07-27 实测：加密冷启动日志恢复 10 个缺失 Session Cookie 后，
  带货助手和电商罗盘均保持在线。
- 2026-07-31 官方罗盘前端已采用账号状态仓库：
  `getLoginAccountList → getBizSession → account-info`。当前账号写入
  `compass_account_session_<openid>`，业务会话写入
  `compass_account_store_<openid>`；旧的
  `FeedHomeListFilter.selectedAccount` 不再作为登录事实源。

系统约束：

- Store 使用 `persist:wxad_v3_<accountId>_store`。
- Electron Session 是运行时唯一事实源。
- 会话日志只能读取完整 Session Cookie 快照，并由系统安全存储加密。
- 冷启动时只补充 Session 中不存在的 Cookie；禁止先清空再恢复、覆盖现有值、
  按名称去重、修改 Domain/HostOnly 语义或在运行中循环反写。
- Store 会话每30分钟执行一次轻量续期：直接读取登录账号列表，按已选择的达人
  `bizId` 请求新的业务会话，并要求官方写入兼容 Cookie。失败只记录并提示，
  禁止调用官方前端的自动 `logout` 分支。
- 所有会话请求设置12秒硬超时；保活任务与罗盘采集通过 Store 任务队列串行。
- 重置 Store 身份必须同时关闭 Talent/Compass 页面、清除 Store Session 和
  对应加密日志；不得影响 Promote。

### 3.2 Promote（加热平台）

已实测：

- Promote 与 Store 不是同一身份域。
- 有效扫码流程会产生 `promotewebsessionid`，随后进入
  `/promote/pages/platform/`。
- 曾观察到扫码成功后官方接口返回 `returnCode: -330` 并跳回登录页；这属于
  官方会话未被接受，不能通过复制或改写 Cookie 修复。
- Cookie 被错误改写 Domain/HostOnly 或覆盖 Secure Cookie 时，会出现
  “登录已过期”及秒退。
- 2026-07-27 当前账号重启后无需扫码即可自动登录；加密日志中没有 Promote
  Session Cookie，说明本次恢复来自官方自身的持久凭据。

系统约束：

- Promote 使用 `persist:wxad_v3_<accountId>_promote`。
- 不从 Store 导入任何 Cookie、LocalStorage 或 Token。
- 不规范化、合并或主动延长 `promotewebsessionid`。
- 重置 Promote 只能清除 Promote 容器，不得关闭带货助手、罗盘或中断罗盘采集。

### 3.3 登录状态检查

已确认“新建隐藏页面并访问官网”不是无副作用的健康检查：页面导航可能触发
认证刷新、重定向或改变官方状态。

因此：

- 刷新登录状态只读取已存在身份容器的 URL、状态机和必要 Cookie 名称；
- 不创建检查页面、不主动导航、不扫码、不调用登录接口；
- 未打开过页面时返回“未知”，不能武断显示离线；
- 罗盘数据能力以真实 List 请求成功为最终证据，页面在线只代表初步可用；
- 日志只记录 Cookie 名称，不记录值、Token 或完整请求头。

## 4. 页面与执行器规则

- 可见官网页用于用户浏览和官方操作。
- 隐藏执行器只由所属身份容器创建，共享该容器完整 Session。
- 每个平台页面和每个采集执行器拥有独立 `WebContentsView`。
- 切换模块只改变原生可见性，不把页面压缩为 `0×0`，不复用页面做采集。
- 同账号、同身份域任务串行；Store 与 Promote 可独立运行。
- 执行器失败只关闭自己，不销毁身份容器或可见官网页。
- 白名单域名之外的跳转不得继承账号 Session。

## 5. 罗盘投前数据接口

正式投前链路目前只依赖两个已实测接口。详细字段见
[数据接口能力清单](./data-interface-capabilities.md)。

### 5.1 List

```text
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/
     feed-feedlist-shopfinder-realtime
```

已实测：

- 在已登录 Store Session 的独立隐藏执行器中，进入罗盘运行上下文后可以直接
  调用官方前端请求客户端；不需要点击页面或截获页面请求。
- 需要从罗盘 `sessionStorage` 读取当前 `selectedAccount`，不能写死账号。
- `accountType` 随当前账号上下文提供，当前实测为 `finder`。
- `limit=100` 可正常返回；超过 100 条时按 `offset` 分页。
- 返回“指定发布时间范围内的视频列表”，指标是请求时点的当前累计快照，
  不是该时间段内的新增量。
- 接口结束时间不能传未来时刻，否则曾实测返回错误码 `882`。
- 2026-07-27 实测近 7 天范围返回 `total=11`、有效记录 11 条；建设阶段扩大
  到近14天后返回 `total=24`、有效记录24条；同月范围曾返回46条。

范围语义：

- 快照机“近14天”是今天 00:00 向前13个自然日到当前时刻；
- “本月”是当月 1 日 00:00 到当前时刻；
- 不使用“本周”自然周，因为每周一会退化成只有当天数据。

### 5.2 Detail

```text
POST /shop-faas/mmecnodecompasscommon/feed/getFeedDetailInfo
```

已实测：

- 输入 `id = exportId`，逐条返回该视频当前累计详情；
- 提供视频累计互动、观看和带货快照；
- `product.productId` 非空可判定为挂车；
- 详情中的成交、退款、商品点击等为当前累计值，可由本系统保存多个时点并计算
  流速与差值；
- 已确定为 `no_cart` 的视频无需重复请求 Detail，因为视频发布后平台不支持
  增删挂车商品。

请求数：

```text
List 分页请求数 + 本次需要请求 Detail 的视频数
```

已知 `no_cart` 的视频跳过 Detail。数据库中的挂车状态属于静态采集知识；
累计指标仍以每次真实响应为准。

## 6. 异常归属与处理

| 现象 | 优先归属 | 系统处理 |
|---|---|---|
| 三个平台同时白屏 | 视图生命周期或共享页面错误 | 检查 Workspace，不改 Cookie |
| Store 与 Promote 同时掉线 | 跨身份域污染或错误的全局清理 | 阻止发布，检查容器边界 |
| 扫码后立即“登录已过期” | 官方拒绝会话或 Cookie 语义被改变 | 保留证据，不循环扫码或修补 Cookie |
| 页面可用但状态显示离线 | 健康判定误报 | 不导航，调整只读判定 |
| 罗盘 List 数量异常 | 时间范围、selectedAccount、分页或响应过滤 | 记录请求范围、`total`、原始条数和有效条数 |
| `Execution context was destroyed` | 执行器导航与请求竞争 | 等待执行器稳定；不得借用可见页面 |

## 7. 变更与回归清单

下列变化视为外部依赖契约变化，必须重新实测并更新文档：

- 官方入口、登录路径或身份域关系改变；
- QR 登录状态码、关键 Cookie 名称或持久性改变；
- 罗盘 `selectedAccount` 的存储位置或结构改变；
- List/Detail 路径、参数、分页上限、响应字段或累计口径改变；
- 官方前端请求客户端模块加载方式改变；
- Electron/Chromium 大版本升级导致 Cookie、Session 或 WebContentsView
  生命周期变化。

每次发布至少回归：

1. Store 登录 → Talent 与 Compass 均可访问；
2. Promote 登录 → 切换 Store 后仍在线；
3. 三个平台切换 → 无白屏、无互相导航；
4. 登录完成 → 退出 → 重启 → 三个平台仍在线；
5. 单独重置 Store → Promote 不受影响；
6. 单独重置 Promote → Talent/Compass 不受影响；
7. 近14天 List 数量与罗盘页面一致；
8. List + Detail 刷新时可见官网页面不白屏、不跳转；
9. 日志不包含 Cookie 值、Token 或完整请求头。
