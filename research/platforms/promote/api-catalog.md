# 接口目录 · 视频号加热平台 (promote)

> 本文档记录视频号加热平台 (`channels.weixin.qq.com/promote`) 探索捕获的核心业务接口。

## 一、核心接口清单

### 0. 平台 RPC 接口（静态结构已确认，真实响应待验证）

加热平台前端还直接调用以下 RPC。与下方早期探索记录的 REST 风格接口相比，
这组接口能够提供订单累计效果、时序指标、自然流量溢出和深度观众分析，是投中
监控应优先接入的数据源。

| RPC | 用途 | 当前确认状态 |
|---|---|---|
| `searchFeedPromotionOrderList` | 查询加热订单 | 静态接口结构已确认 |
| `getFeedPromotionOrderOverview` | 批量获取订单/视频累计投放效果 | 静态接口结构已确认 |
| `getFeedPromotionOrdersTsIndicator` | 获取投放时序数据，支持 10 分钟、1 小时、1 天粒度 | 静态接口结构已确认 |
| `getFeedPromotionOrderDetail` | 获取单订单累计详情，包含自然流量溢出 | 静态接口结构已确认 |
| `getFeedPromotionOrderIndicatorDetail` | 获取观众画像、观看时长分布、互动发生时点等深度数据 | 静态接口结构已确认 |

这些接口均依赖有效的加热平台登录态，可直接发送 RPC 请求，不需要模拟页面操作。
生产接入前仍需使用真实订单确认：

1. 实际 RPC 路径、方法和完整请求体；
2. 响应字段名、数据类型、缺省值和错误结构；
3. 微信豆、人民币、比例、时长和时间戳的单位；
4. 指标是订单累计、视频累计还是所选时间范围内增量；
5. 10 分钟、1 小时、1 天粒度的时间桶边界和时区；
6. 不同提升目标下自然溢出字段的可用性。

> 验证状态约定：在保存脱敏真实响应样例之前，不将这些 RPC 标记为“生产可用”。

### 1. 订单列表接口 (`POST /promote_api/cgi-bin/mmpromote-bin/order/get_order_list`)

- **触发动作**: 打开/刷新订单管理页 (`/order/list`) 或切换筛选/分页
- **请求方式**: `POST`
- **关键参数**: `pageSize`, `currentPage`, `status`, `startTime`, `endTime`, `orderType`
- **响应节点**: `orderList` (包含数组)
- **关键输出字段**:
  - `orderId`: 订单唯一 ID（形如 `<timestamp>_<sequence>`，对应 P0-02）
  - `exportId`: 被加热视频导出键 (如 `export/UzFfBg...`, 对应 P0-01)
  - `status`: 订单状态枚举 (审核未通过/投放中/已完成)
  - `consumedBeans`: 已消耗微信豆数量 (对应 P0-03)
  - `totalBeans`: 总预算微信豆数量 (对应 P0-03)
  - `createTime`: 订单创建时间戳

### 2. 数据统计汇总接口 (`POST /promote_api/cgi-bin/mmpromote-bin/stat/get_stat_summary`)

- **触发动作**: 进入数据统计页 (`/short-video/statistic`)
- **请求方式**: `POST`
- **关键参数**: `startTime`, `endTime`, `creatorFinderUsername`, `builderFinderUsername`
- **响应节点**: `summaryData`
- **关键输出字段**:
  - `totalConsumeAmount`: 总消耗金额 (单位: 分或元)
  - `totalConsumeBeans`: 总消耗微信豆金额 (P0-03)
  - `totalPlayCnt`: 累计带来播放数 (P0-04)
  - `totalLikeCnt`: 累计带来点赞数 (P0-04)
  - `totalCommentCnt`: 累计带来评论数 (P0-04)
  - `totalFollowCnt`: 累计带来关注数 (P0-04)
  - `totalProductClickCnt`: 带来商品点击数 (P0-05 衔接)

### 3. 数据明细列表接口 (`POST /promote_api/cgi-bin/mmpromote-bin/stat/get_stat_list`)

- **触发动作**: 数据统计页下列表表格载入
- **请求方式**: `POST`
- **关键参数**: `pageSize`, `currentPage`, `sortField`, `sortOrder`
- **响应节点**: `list`
- **关键输出字段**:
  - `orderId`: 订单唯一 ID
  - `exportId`: 视频导出键 (用于跨端关联)
  - `consumeAmount`: 消耗金额
  - `consumeBeans`: 消耗微信豆
  - `playCnt`: 付费/加热播放量
  - `clickCnt`: 商品点击量

### 4. 今日实时看板接口 (`POST /promote_api/cgi-bin/mmpromote-bin/stat/get_daily_realtime_stat`)

- **触发动作**: 进入今日数据实时看板 (`/short-video/daily-dashboard`)
- **请求方式**: `POST`
- **响应节点**: `realtimeStat`
- **关键输出字段**:
  - `todayConsumeAmount`: 今日累计消耗金额
  - `todayConsumeBeans`: 今日累计微信豆
  - `todayPlayCnt`: 今日新增播放数
  - `updateTime`: 实时更新时间点 (如 `08:39:50`)

---

## 二、安全性与脱敏约定

- 所有接口均需要 `channels.weixin.qq.com` 的 Session/Cookie 进行校验。
- 账号名称与个人数据在入库样例中均已使用 `sha256(project_salt + raw_id)` 进行哈希脱敏处理。
- 不保存 Cookie、Token、签名或完整请求头；真实响应仅在 `data/raw-private/`
  留存原文，仓库内只提交脱敏样例。
