# 数据接口能力清单

**用途：** 逐个记录投流系统所需接口的实测能力，作为采集实现、数据建模和
后续算法迭代的事实依据。

**记录原则：**

- 只记录已经实际请求并核验的数据，不把页面展示或推测当作接口能力。
- 区分当前时点快照、历史范围聚合和静态信息。
- 保留接口原始字段；分析阶段是否使用某字段不影响采集阶段保存。
- 每讨论并验证一个接口，再追加一个独立章节。

认证域、Session 持久化、页面隔离和平台异常规则见
[微信平台外部依赖契约](./weixin-platform-dependency-contract.md)。

---

## 1. Creator `statistic/post_list`

### 1.1 流程职责

投前状态机的第一步：

1. 发现指定发布时间范围内的新视频；
2. 建立视频身份映射；
3. 获取视频当前内容指标；
4. 形成该视频的第一张内容快照；
5. 新视频进入“等待罗盘确认”状态。

正式链路不再依赖 Creator `post/post_list` 判断挂车。挂车与商品信息由下一步
罗盘单视频详情确认。

### 1.2 接口

```text
POST /micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list
```

核心业务参数：

```text
startTime   发布时间范围起点，Unix 秒
endTime     发布时间范围终点，Unix 秒
pageSize    单页数量
currentPage 当前页
sort        排序字段
order       排序方向
```

请求还需要当前账号登录上下文提供的公共身份参数。

### 1.3 调用方式

已确认的正式方式：

```text
复用账号已登录的 Creator 浏览器容器
→ 不打开“数据中心/单篇视频”页面
→ 在已登录网页上下文中直接 fetch 接口
→ 读取结构化 JSON
```

不需要：

- 渲染目标业务页面；
- 自动点击“单篇视频”；
- 截图或读取页面文字；
- 等待并截获页面自己发出的请求。

认证边界实测：

- 已登录网页上下文内直接 `fetch`：成功；
- 完全脱离浏览器的独立 HTTP 请求：返回 `300330 request failed`。

因此接口采集依赖登录容器，但不依赖具体页面。

### 1.4 返回的视频身份与静态信息

- `exportId`：Creator 与罗盘之间的跨平台视频主键；
- `objectId`：数字字符串，在单视频详情接口中作为 `feedId`；
- `createTime`：发布时间；
- `desc.description`：完整标题；
- `desc.shortTitle`：短标题；
- `desc.mediaType`：媒体类型；
- `desc.media[0].videoPlayLen`：视频时长；
- 视频宽度、高度；
- 文件大小、码率；
- 视频状态、可见范围和权限标记。

首次发现时应保存：

```text
exportId
feedId = objectId
createTime
标题与媒体静态信息
```

### 1.5 返回的当前内容指标

- `readCount`：播放；
- `yesterdayReadCount`：昨日播放；
- `likeCount`：推荐；
- `favCount`：喜欢；
- `commentCount`：评论；
- `forwardCount`：普通转发；
- `forwardSnsCount`：朋友圈转发；
- `forwardAllChatCount`：聊天转发；
- `forwardAggregationCount`：转发聚合；
- `followCount`：新增关注；
- `ringsetCount`：设为铃声；
- `statusrefCount`：设为状态；
- `snscoverCount`：设为朋友圈封面；
- `fullPlayRate`：完播率；
- `avgPlayTimeSec`：平均观看时长；
- `fastFlipRate`：快划率。

这些字段在每次请求时代表接口当时返回的当前值，可带
`capturedAt` 保存为内容快照。

### 1.6 时间范围与单视频定位

最近 24 小时发现：

```text
startTime = 当前时间 - 24小时
endTime   = 当前时间
```

精确更新已知视频：

```text
startTime = createTime
endTime   = createTime + 1秒
```

进一步多样本实测发现，接口的 `endTime` 并不按秒严格截断，而会覆盖该自然日
剩余时间。因此：

- 如果目标是当天最新一条，通常只返回目标视频；
- 如果目标之前发布，当天在它之后发布的视频也会一起返回；
- 实测当天第 1、2、3 条（按新到旧）分别返回 1、2、3 条；
- 系统必须从返回数组中按 `exportId` 选择目标，不能直接取第一条；
- 时间窗口只是缩小候选集，不是服务端严格的单视频查询条件。

推荐的正式更新方式：

```text
按目标视频的发布自然日查询 00:00:00～23:59:59
→ 一次取得当天全部视频
→ 在内存中按 exportId 匹配所有待更新视频
```

实测 2026-07-26 当天共返回 4 条，耗时 649ms；4 个目标的 `exportId` 与
`feedId` 均全部匹配。该方式可用一次请求批量更新同一天的所有观察池视频。

### 1.7 稳定性实测

- 最近 24 小时查询连续执行 3 次，均返回 `errCode=0`；
- 同一批数据单次耗时约 0.7～1.3 秒；
- 多样本均可在缩小后的候选集中按 `exportId` 准确匹配目标视频。

### 1.8 分页能力实测

测试账号当前共 274 条视频：

| 请求 `pageSize` | 实际返回 | 耗时 |
|---:|---:|---:|
| 10 | 10 | 1.32 秒 |
| 50 | 50 | 0.93 秒 |
| 100 | 100 | 1.87 秒 |
| 200 | 200 | 1.81 秒 |
| 300 | 274 | 1.73 秒 |
| 500 | 274 | 2.15 秒 |
| 1,000 | 274 | 2.09 秒 |
| 10,000 | 274 | 1.91 秒 |

结论：

- `pageSize=10000` 请求成功；
- 274 条视频可一次全部返回；
- 当前尚未测出服务端硬上限，只能确认上限不低于该测试数据量；
- 日常发现只查最近 24 小时；建立历史基线时可使用较大时间范围和大分页。

### 1.9 当前结论

该接口可以独立承担：

```text
新视频发现
+ 视频身份建立
+ 第一张内容快照
+ 后续单视频内容快照更新
```

它不能确认挂车与成交信息。下一步由罗盘列表与单视频详情接口按 `exportId`
补充商品与交易快照。

---

## 2. 罗盘接口

### 2.1 统一访问与数据口径规则

本章接口均已验证可以在已登录的罗盘浏览器会话中直接请求，不需要打开、渲染
或点击罗盘业务页面，也不需要等待页面发起请求后再拦截。

实现方式：

```text
复用已登录的罗盘浏览器会话
→ 调用罗盘前端请求客户端
→ 客户端自动注入鉴权头并加密请求
→ 客户端自动解密响应
→ 读取结构化数据
```

完全脱离已登录会话裸发 HTTP 请求会因缺少罗盘鉴权信息而失败。

本系统的数据口径规则：

| 数据口径 | 定义 | 是否进入快照表 | 是否用于计算流速 |
|---|---|---:|---:|
| 当前累计快照 | 从视频发布至采集时点的累计值 | 是 | 是 |
| 时间范围数据 | `startMs` 至 `endMs` 内的聚合或趋势值 | 否 | 否 |
| 静态信息 | 视频发布后不再变化的视频身份信息 | 首次保存 | 否 |
| 当前关系状态 | 当前是否挂车及当前所挂商品 | 是 | 否 |

流速和增量必须由系统对两张“当前累计快照”做差计算，不能使用罗盘的时间范围
聚合值代替。

### 2.2 视频列表 `feed-feedlist-shopfinder-realtime`

#### 接口

```text
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feed-feedlist-shopfinder-realtime
```

#### 输入

```json
{
  "time_query": {
    "dateFormat": 2,
    "dateType": 0,
    "dateRange": 7,
    "startMs": 1784390400000,
    "endMs": 1784995199999
  },
  "accountType": "finder",
  "accountId": "<Finder username>",
  "limit": 100,
  "offset": 0
}
```

| 字段 | 说明 |
|---|---|
| `time_query.startMs` | 查询范围起点，Unix 毫秒 |
| `time_query.endMs` | 查询范围终点，Unix 毫秒 |
| `dateFormat/dateType/dateRange` | 罗盘时间范围类型 |
| `accountType` | 当前账号类型 |
| `accountId` | 视频号账号标识 |
| `limit` | 单页数量 |
| `offset` | 分页偏移 |

#### 输出

视频与身份字段：

| 原始字段 | 含义 | 口径 |
|---|---|---|
| `export_id` | Creator 与罗盘共用的视频主键 | 静态 |
| `feedid_` | 罗盘视频数字标识 | 静态 |
| `create_time` | 发布时间 | 静态 |
| `videoInfo.description` | 视频文案 | 静态 |
| `videoInfo.cover_url` | 封面 | 静态 |
| `videoInfo.thumb_url` | 缩略图 | 静态 |
| `spu_id` | 条件返回的商品相关标识 | 不可作为可靠挂车判定 |

基础与互动字段：

| 原始字段 | 含义 | 口径 |
|---|---|---|
| `read` | 播放量 | 当前累计快照 |
| `average_watch_time` | 平均观看时长 | 当前累计快照 |
| `full_watch_radio` | 完播率 | 当前累计快照 |
| `fav` | 拇指赞 | 当前累计快照 |
| `like` | 爱心赞 | 当前累计快照 |
| `comment` | 评论 | 当前累计快照 |
| `follow` | 关注 | 当前累计快照 |
| `forward` | 转发 | 当前累计快照 |

带货字段：

```text
product_view_cnt
product_click_cnt
product_click_uv
create_gmv
create_order_cnt
create_product_cnt
create_uv
pay_gmv
pay_order_cnt
pay_product_cnt
pay_uv
pay_gmv_per_uv
pay_gmv_per_1k_watch_pv
click_to_pay_cnt_ratio
pay_refund_gmv
pay_refund_order_cnt
pay_refund_product_cnt
pay_refund_uv
pay_refund_order_ratio
```

实测确认，`time_query` 对视频列表首先起“按发布时间筛选视频”的作用。它不
会把基础与互动指标截断为该日期范围内的增量：

- 同一条视频查询“发布当日”和“发布日至 7 月 25 日”，播放及全部互动值一致；
- 查询范围不包含该视频的发布日期时，该视频不会出现在列表中；
- 随机抽取 6 条视频，将 List 的
  `read/like/fav/comment/forward/follow` 与同一时点
  `getFeedDetailInfo.feed.totalDetailData` 对照，6 条全部完全一致；
- `average_watch_time` 等于详情累计 `watchTime / read`；
- `full_watch_radio` 等于详情累计 `fullWatch / read`。

因此，List 的基础与互动字段是**采集时点的当前累计快照**，可以写入快照表并
用于计算流速。

List 的挂车字段也不能单独用于判定。实测抽取 15 条视频时，List 的 `spu_id`
全部缺失；逐条调用 `getFeedDetailInfo` 后，其中 11 条返回有效
`product.productId`，4 条没有商品。说明 `spu_id` 缺失既可能是挂车视频，也
可能是非挂车视频，List 没有提供可依赖的“待刷新”或“未挂车”状态枚举。

List 的带货数值不能沿用互动字段的累计口径结论。同一视频的 List 商品曝光为 116，而同一
时点 `getFeedDetailInfo.pay.accProductExposeCnt` 为 209。带货字段受罗盘范围
口径影响，**不是可靠的当前累计快照**。没有业务值的字段还可能不返回，必须
区分“缺失”和 `0`。

#### 分页能力实测

2026-07-26 使用匿名测试账号查询罗盘可用的最近 90 天，接口返回
`total=73`。不同 `limit` 的实测结果：

| 请求 `limit` | `total` | 实际返回 | 有效唯一 `export_id` | 耗时 |
|---:|---:|---:|---:|---:|
| 10 | 73 | 10 | 10 | 1.27 秒 |
| 50 | 73 | 50 | 50 | 1.22 秒 |
| 100 | 73 | 73 | 73 | 1.26 秒 |
| 200 | 73 | 73 | 73 | 1.15 秒 |
| 300 | 73 | 74* | 73 | 1.09 秒 |
| 500 | 73 | 73 | 73 | 1.04 秒 |
| 1,000 | 73 | 73 | 73 | 1.40 秒 |
| 10,000 | 73 | 73 | 73 | 1.12 秒 |

\* `limit=300` 首次测试偶发多返回一条没有 `export_id` 的异常行；随后连续
重试 3 次均正常返回 73 条。说明不能只相信数组长度，必须校验视频主键。

`limit=10` 的 `offset` 分页实测：

| `offset` | 返回数量 | 有效唯一 `export_id` |
|---:|---:|---:|
| 0～60，每次 +10 | 每页 10 | 每页 10 |
| 70 | 3 | 3 |
| 73 | 0 | 0 |
| 80 | 0 | 0 |

将 `offset=0,10,...,70` 的结果合并后，共得到 73 个 `export_id`，去重后仍为
73，未发现跨页重复或漏项。

结论与实现约束：

- 已确认接口接受 `limit=10000`，但测试集只有 73 条，不能据此宣称服务端硬
  上限达到 10000；
- 正式采集使用 `limit=100` 并按 `offset += 100` 分页，兼顾稳定性与请求量；
- 以响应 `total` 判断是否结束，同时允许最后一页少于 `limit`；
- 每行必须存在合法 `export_id` 才可入库；
- 跨页结果按 `export_id` 去重；
- `total`、返回数组长度和有效主键数量不一致时记录告警日志。

#### 系统用途

纳入：

- 批量发现视频；
- 建立 `export_id`、`feedid_` 映射；
- 建立新视频的“挂车状态待确认”任务。

不纳入：

- List 返回的带货数值不写入累计快照；
- 不使用 List 带货数值计算交易增量或流速。

纳入累计快照：

- List 返回的播放、平均观看、完播率和全部互动累计值；
- 每次采集记录 `capturedAt`，由相邻快照计算播放与互动流速。

2026-07-26 使用匿名测试账号查询最近 7 天，约 1.0 秒返回 8 条视频。

### 2.3 单视频累计详情 `getFeedDetailInfo`

#### 接口

```text
POST /shop-faas/mmecnodecompasscommon/feed/getFeedDetailInfo
```

#### 输入

```json
{
  "id": "export/UzFfBgAA..."
}
```

`id` 为视频列表返回的完整 `export_id`。该接口不需要通过发布时间定位视频。

#### 输出：视频静态信息与当前挂车关系

| 路径 | 含义 | 口径 |
|---|---|---|
| `info.exportId` | 视频主键 | 静态 |
| `info.createTime` | 发布时间 | 静态 |
| `info.description` | 视频文案 | 静态 |
| `info.thumbUrl` | 缩略图 | 静态 |
| `info.coverUrl` | 封面 | 静态 |
| `product.productId` | 当前所挂商品 ID；空值表示当前未挂车 | 当前关系状态 |
| `product.title` | 当前所挂商品名称 | 当前关系状态 |
| `product.img` | 当前所挂商品图片 | 当前关系状态 |
| `product.createMs` | 当前商品创建时间 | 商品身份信息 |
| `product.updateMs` | 商品更新时间 | 接口当前值 |

已发现视频发布后可能发生“掉车”，因此挂车状态和视频与商品的关联不是静态信息。
每轮视频快照都必须重新请求本接口，并将 `product.productId` 的最新结果同步更新
到视频表；不能因历史上曾确认挂车或未挂车而跳过。

#### 输出：视频当前累计快照

路径：`feed.totalDetailData`

| 原始字段 | 含义 |
|---|---|
| `read` | 累计播放 |
| `like` | 累计爱心赞 |
| `fav` | 累计拇指赞 |
| `follow` | 累计关注 |
| `comment` | 累计评论 |
| `forward` | 累计转发 |
| `watchTime` | 累计观看时长，秒 |
| `fullWatch` | 累计完播次数 |

路径：`feed.tabDetailData[]`

返回关注、推荐、分享、朋友、PC 微信、订阅号消息、主页和其他等来源的累计
`read/like/fav/follow/comment/forward/watchTime/fullWatch`。该拆分可保存为扩展
快照，但暂不作为投流主判断条件。

#### 输出：带货当前累计快照

路径：`pay`

| 原始字段 | 含义 | 单位 |
|---|---|---|
| `accProductExposeCnt` | 累计商品曝光 | 次 |
| `accProductClickCnt` | 累计商品点击 | 次 |
| `accPayGmv` | 累计成交金额 | 分 |
| `accPayCnt` | 累计成交订单 | 单 |
| `accRefundAmount` | 累计退款金额 | 分 |
| `accRefundCnt` | 累计退款订单 | 单 |
| `accPayGmvPerUv` | 累计客单相关值 | 分，业务定义待核 |

以下增长比例字段也会返回，但比较基期未完全确认，不进入核心快照：

```text
accProductExposeCntIncrRatio
accProductClickCntIncrRatio
accPayGmvIncrRatio
accPayCntIncrRatio
accRefundGmvIncrRatio
accRefundCntIncrRatio
```

#### 系统计算字段

```text
平均观看时长 = watchTime / read
完播率       = fullWatch / read
GPM（元）    = (accPayGmv / 100) / read * 1000
商品点击率   = accProductClickCnt / accProductExposeCnt
点击成交率   = accPayCnt / accProductClickCnt
退款订单率   = accRefundCnt / accPayCnt
```

计算时分母为 `0` 应返回 `null`，不能伪造为 `0%`。

#### 实测

“低处飞行”视频单次直接请求约 0.4～0.5 秒：

```text
累计播放       309
累计商品曝光   209
累计商品点击   3
累计成交金额   7400 分（¥74.00）
累计成交订单   1
累计退款金额   0 分
累计退款订单   0
```

该接口是罗盘侧核心累计快照接口，进入观察池或投中追踪的挂车视频应按
`export_id` 定时请求并记录 `capturedAt`。

### 2.4 商品信息补充 `feed-productinfo-shopfinder`

#### 接口

```text
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feed-productinfo-shopfinder
```

#### 输入

```json
{
  "export_id": "<exportId>",
  "accountType": "talent"
}
```

#### 输出

响应包含 `pay`，已观察到的字段：

```text
acc_pay_gmv
acc_pay_order_cnt
acc_product_click_cnt
acc_pay_refund_gmv
acc_pay_refund_order_cnt
acc_product_view_cnt
pay_gmv_per_1k_watch
```

实测有成交的“低处飞行”视频在该接口中上述字段仍返回空字符串，而
`getFeedDetailInfo` 已正确返回累计成交数据。因此当前不能把该接口作为可靠的
累计快照来源。

#### 系统用途

暂不使用。商品身份取 `getFeedDetailInfo.product`，累计带货数据取
`getFeedDetailInfo.pay`。

### 2.5 单视频数据趋势 `feeddetail-overview`

#### 接口

```text
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feeddetail-overview-shopfinder-realtime
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feeddetail-overview-shopfinder-offline
```

#### 输入

```json
{
  "time_query": {
    "dateFormat": 2,
    "dateType": 0,
    "dateRange": 7,
    "startMs": 1784390400000,
    "endMs": 1784995199999
  },
  "accountType": "talent",
  "export_id": "<exportId>"
}
```

`realtime` 与 `offline` 由罗盘根据查询日期选择；历史视频使用 `offline`。

#### 输出

`trend[]` 按日返回：

```text
datetime
read
like
fav
follow
comment
forward
product_view_cnt
product_click_cnt
pay_gmv
pay_order_cnt
pay_uv
pay_refund_gmv
```

这是 `startMs` 至 `endMs` 的**时间范围趋势数据**，不是当前累计快照。

#### 系统用途

不采集、不写快照、不参与流速计算。系统通过连续保存
`getFeedDetailInfo` 的累计快照自行计算任意时间段增量。

### 2.6 单视频渠道分析 `feeddetail-channel`

#### 接口

```text
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feeddetail-channel-shopfinder-realtime
POST /shop-faas/mmecnodecompasscommon/common/liner_query/1/feeddetail-channel-shopfinder-offline
```

#### 输入

与 2.5 相同：

```text
time_query
accountType = talent
export_id
```

#### 输出

`list[]` 按关注、推荐、分享、朋友、PC 微信、订阅号消息、主页和其他渠道返回：

```text
feed_channel_
tab_name
read
pay_gmv
pay_gmv_per_1k_watch_pv
trend[]
```

这是指定日期范围内的渠道聚合和趋势数据，**不是当前累计快照**。

#### 系统用途

不采集、不写快照、不参与流速计算。

### 2.7 罗盘接口最终分工

```text
视频 List
→ 负责批量发现和身份映射
→ 负责视频基础与互动当前累计快照
→ 不使用其字段直接判定挂车
→ 不使用其带货范围数据

getFeedDetailInfo
→ 每次快照都逐条调用，以 product.productId 刷新当前挂车/掉车状态
→ 负责商品当前身份信息
→ 负责挂车视频的带货当前累计快照
→ 视频累计字段可与 List 做一致性校验
→ 相邻快照由系统计算增量、流速和转化率

productinfo / overview / channel
→ 能力留档
→ 当前主流程不使用
```

### 2.8 带货助手橱窗商品列表与佣金

#### 页面与接口

```text
页面：GET https://store.weixin.qq.com/talent/channel/window

接口：
POST /shop-faas/mmeckolwindownode/window/getTalentWindowProducts
```

该接口属于带货助手，不属于电商罗盘。响应为明文 JSON，但请求必须经官方
页面客户端补充 `mcn magic`；脱离官方客户端裸 `fetch` 会返回
`200004 mcn magic invalid`。

#### 在售商品输入

```json
{
  "pageSize": 20,
  "offset": 0,
  "productSource": null,
  "reqSource": 1
}
```

2026-07-27 实测当前账号：

```text
totalNum = 59
本页 products = 20
continueFlag = true
lastBuffer = "CBQSAA=="
```

页面另发起已结束推广商品请求：

```json
{
  "productStatus": 2,
  "offset": 0,
  "pageSize": 30,
  "totalNum": 0,
  "curPage": 1
}
```

#### 关键输出

```text
productId                         橱窗内部商品主键
outProductId                      外部 SPU ID；商品详情页 URL 使用此 ID
title / shortTitle                商品名称
minPrice / maxPrice               分，最低价 / 最高价
stock / sales                     库存 / 销量
status / statusWording            推广状态
listingTime                       上架时间，毫秒时间戳字符串
commissionInfo.commissionRate     佣金率，百万分比
commissionInfo.commissionEstimate 预估单笔佣金，分
commissionInfo.boostRatio         加佣比例
commissionInfo.boostEstimate      加佣预估金额，分
continueFlag / lastBuffer         分页控制
totalNum                          商品总数
```

字段换算：

```text
佣金率 = commissionRate / 1,000,000
预估单笔佣金（页面展示） = commissionEstimate / 100
最低展示价 = minPrice / 100
```

#### 真实 ID 与金额校验

“低处飞行”商品实测：

```text
橱窗 productId = <internal-product-id>
罗盘 getFeedDetailInfo product.productId = <internal-product-id>
outProductId = <external-product-id>
commissionRate = 470000 = 47%
commissionEstimate = 2726 = ¥27.26
minPrice = 5800 = ¥58.00
¥58.00 × 47% = ¥27.26
```

因此，视频与商品应直接使用内部 `productId` 关联；不能使用商品详情页 URL
中的 `outProductId` 与罗盘视频数据直接连接。

已结束推广的商品可能返回空 `commissionInfo`。系统应保留最后一次有效佣金
快照，同时将商品标记为已结束推广，不得用空值覆盖历史有效佣金率。

`minPrice`、`maxPrice` 与 `commissionEstimate` 仅用于接口能力留档，不进入
本系统的商品业务表。组合商品和多 SKU 商品的实际成交规格、成交价可能不同，
页面按最低价计算的预估单笔佣金不能用于 ROI。

#### 数据口径与系统用途

这是请求时点的**商品当前信息快照**，不是时间范围数据。佣金率可能调整，
必须保存 `captured_at`。

推荐流程：

```text
快照机发现本地缺少挂车商品时，批量分页刷新全部橱窗商品
→ 保存商品身份、全称、短标题、店铺、推广状态和佣金率快照
→ 通过 productId 关联视频快照
→ 投前表只显示当前佣金率
→ 投中按真实成交金额增量、退款金额增量和当时佣金率估算佣金 ROI
→ 投后再用官方结算佣金校正
```

商品数据库另提供“刷新经营数据”：逐条刷新本地全部历史挂车视频的罗盘详情，
再以每条视频的最新累计投影按 `productId` 聚合。该聚合不会累加时序快照，避免
同一视频重复计数。页面和 Excel 提供挂车视频数、有成交视频数、累计观看、点击、
订单、成交金额、退款、净成交、按当前佣金率估算的净佣金及相关转化率。估算净佣金
不是官方最终结算佣金，必须连同经营数据更新时间展示。

#### 已验证的直接请求方式

正式采集不滚动、不点击商品页面，也不截获表格 DOM。隐藏执行器只负责建立
带货助手登录上下文，随后直接分页 POST 本接口。除浏览器 Session 自动携带的
Cookie 外，请求头必须显式带上 Cookie 中同名的 `biz_magic` 与
`talent_magic`；缺少这两个头会返回 `mcn magic invalid`。

2026-07-27 真实账号验证：一次完整刷新得到推广中 59 条、已结束记录 2 条；
按 `productId` 去重后商品表 59 条，其中 57 条含有效佣金率。“低处飞行”
示例商品返回 `commissionRate=470000`，本地换算并关联为
`47.0%`。

---

## 3. 加热平台短视频订单接口

### 3.1 实测范围与统一访问方式

2026-07-28 使用真实挂车短视频订单完成两轮状态实测：

```text
promotionId = <promotion-id>
第一轮：审核中
第二轮：加热中、尚未产生消耗
```

当前已验证5个接口均可由 WXAdCopilot 直接请求：

```text
复用账号的加热平台持久化 Session
→ 在 promote 独立隐藏执行器中建立登录上下文
→ 直接 POST RPC
→ 并行读取结构化 JSON
→ 关闭执行器
```

不需要在用户可见的官网浏览页面中点击、刷新或截获请求。独立执行器与官网浏览
页面隔离，不会造成用户页面白屏或导航冲突。

单订单5个接口并行实测耗时约1.8～2.4秒。所有接口的公共地址为：

```text
POST https://channels.weixin.qq.com/promote/api/web/transfer/
     MmFinderPromotionApiSvr/{method}
```

公共请求字段：

```json
{
  "baseReq": {
    "featureFlag": 26
  }
}
```

### 3.2 订单发现 `searchFeedPromotionOrderList`

#### 输入

```json
{
  "status": 0,
  "createTsMin": "Unix秒字符串",
  "createTsMax": "Unix秒字符串",
  "sortField": 1,
  "sortOrder": 0,
  "page": 1,
  "pageSize": 300
}
```

#### 输出

```text
orderList[]     当前条件下的订单列表
total           总订单数
promotionIds[]  条件返回的订单 ID
```

真实账号查询最近14天，返回：

```text
total = 1
orderList.length = 1
```

#### 数据口径与用途

这是订单当前列表，不是效果历史快照。系统用它：

- 发现新订单；
- 获取 `promotionId`；
- 发现订单状态变化；
- 决定哪些订单需要进入详情采集。

建设期每轮每账号请求一次。页面前端当前使用 `pageSize=300` 分页；更大分页上限
尚未实测。

### 3.3 单订单累计详情 `getFeedPromotionOrderDetail`

#### 输入

```json
{
  "promotionId": "<promotion-id>"
}
```

#### 输出结构

```text
data.order.orderInfo          订单配置、状态、时间和支付
data.order.indicator          整笔订单当前累计效果
data.order.feedMaterialList[] 素材及素材级当前累计效果
data.order.finderObject       主视频及作者信息
```

#### 订单配置与状态字段

已实测返回：

```text
promotionId
orderName
promotionTarget
promotionType
pricingMethod
classification
billingMethod
duration
quota
cost
createTs
estimatedStartts
estimatedEndts
actualStartts
actualEndts
updateTs
orderInfo.status
orderApiExportStatus
suggest.*
estimatedInfo.*
paymentInfo.*
targetUserInfo.*
deviceInfo.*
```

同一业务状态存在两套枚举，必须分别保存：

| 页面状态 | `orderInfo.status` | 内部枚举 | `orderApiExportStatus` | 列表枚举 |
|---|---:|---|---:|---|
| 审核中 | 5 | `kFeedOrderInfoStatus_Auditing` | 2 | `kPromotionExportStatus_Auditing` |
| 加热中 | 2 | `kFeedOrderInfoStatus_Promoting` | 9 | `kPromotionExportStatus_Promoting` |
| 结算中 | 9 | 实测状态名待补 | 12 | 实测状态名待补 |
| 订单已结束－主动取消 | 8 | 实测终态 | 11 | 实测终态 |

真实状态变化：

```text
审核中：
actualStartts = 0
actualEndts = 0
cost = 0

加热中：
actualStartts = 2026-07-28 15:27:06
actualEndts = 0
cost = 0
```

因此“加热中”只说明订单进入运行状态，不代表已经产生消耗。系统必须把
`订单状态=加热中` 与 `投放结果=尚无消耗` 分开表达；刚启动时属于
`WAITING_DATA`，不能立即判定为 `NOT_SPENDING`。

主动取消后的真实终态已于 2026-07-28 验证：

```text
orderInfo.status = 8
orderApiExportStatus = 11
页面文案 = 订单已结束－主动取消
actualEndts 已回填
```

#### 金额单位

真实订单：

```text
orderInfo.quota = "10000"
页面预算 = 1000 微信豆
paymentInfo.paidWecoinAmount = 1000
indicator.payAmount = "10000"
```

`quota`、`indicator.payAmount` 与页面微信豆不是同一显示单位，入库必须保留
原始值，并在规范字段中按已验证换算展示。不得直接混加。

主动取消最终快照：

```text
indicator.cost = 1923       → 实际消耗 192.3 微信豆
indicator.refundAmount=8077 → 退回 807.7 微信豆
paymentInfo.refundWecoinAmount = 0（此时不能作为最终退款口径）
```

最终退款展示必须优先使用 `indicator.refundAmount / 10`；只有该字段缺失时才
回退到 `paymentInfo.refundWecoinAmount`。

#### 当前累计效果字段

订单级 `indicator` 与素材级 `feedMaterialList[].indicator` 均已返回：

```text
cost
androidCost
exposureCount
likeCount
favCount
commentCount
forwardCount
followCount
bizFollowCount
productClickCountPv
productClickCountUv
productOrderCount
productPlaceorderGmv
feedProductPlaceorderPv
feedProductPlaceorderGmv
feedProductPayPv
feedProductPayGmv
feedProductPayRoi
feedProductNetPayPv
feedProductNetPayGmv
feedProductNetPayRoi
feedComponentClickPv
feedComponentClickUv
feedComponentpayUv
feedComponentpayPrice
feedReserveliveUv
refundAmount
```

审核中和刚进入加热中但尚未消耗时，上述字段结构完整、值为0。这种情况应记录为
“有效零值”，不能标记为字段缺失或请求失败。

#### 视频、作者与商品字段

`finderObject` 已实测提供：

```text
exportId
globalExportId
createTime
description
coverUrl
likeCount / favCount / commentCount / forwardCount
flag.hasShoppingCart
shoppingcartJumpinfo
finderComponent
accountInfo
```

本订单同时出现两种商品标识：

```text
商城商品 ID = 10001208057632
CPS/带货商品 ID = 14000804062391
```

它们不是同一个业务键，系统必须分别保存并建立映射，不能统一写入一个
`product_id` 后丢失来源语义。

#### 自然流量溢出

当前前端契约存在以下累计字段：

```text
feedOverflowExposureCount
feedOverflowLikeCount
feedOverflowFavCount
feedOverflowCommentCount
feedOverflowFollowCount
feedOverflowBizFollowCount
feedOverflowForwardCount
```

但本次“商品点击数”订单在审核中和刚开始加热时均**没有返回这些字段**，不是
返回0。仍待验证：

- 首次产生消耗后是否出现；
- 商品点击目标是否支持；
- 是否只有播放/智能加热目标支持；
- 72小时溢出统计的更新和截止口径。

在字段出现前，系统必须记为 `null/未提供`，不得记为0。

### 3.4 批量累计概览 `getFeedPromotionOrderOverview`

#### 输入

```json
{
  "promotionIds": ["<promotion-id>"]
}
```

可选使用 `exportIds` 进一步限定视频。

#### 输出

```text
promotionOrderList[]
promotionExtraIndicatorSum
```

当前实测汇总字段：

```text
quotaCost
wecoinCost
exposureCount
productClickCountPv
productPayCountPv
productPlaceorderGmv
likeCount
favCount
commentCount
forwardCount
followCount
productExposureCount
```

刚开始加热但尚未消耗时，接口成功返回订单，汇总指标均为0。

#### 数据口径与用途

这是所选订单在请求时点的当前累计汇总，与单订单 Detail 存在重复。建设期保留
完整响应，用于：

- 批量刷新多订单；
- 校验 Detail 的订单级与素材级指标；
- 验证 `promotionExtraIndicatorSum` 的真实字段和单位。

官方当前页面按每批150个 `promotionId` 请求；服务端硬上限尚未实测。待积累
非零数据后再决定正式快照主链路使用 Detail、Overview 或两者并存。

### 3.5 官方时序 `getFeedPromotionOrdersTsIndicator`

#### 输入

```json
{
  "promotionIds": ["<promotion-id>"],
  "beginTime": 1785130000,
  "endTime": 1785220000,
  "tsInterval": 1
}
```

`tsInterval`：

```text
1 = 10分钟
2 = 1小时
3 = 1天
```

#### 输出

```text
tsDataInfoList[].sampleTime
tsDataInfoList[].promotionExtraIndicator
```

刚进入加热中且尚未消耗时：

```text
tsDataInfoList = []
```

接口成功但数组为空，表示尚无已形成的时序点，不是请求失败。

#### 数据口径与用途

这是官方指定时间范围和粒度的时序数据，**不是本地当前快照**。系统应单独保存为
`promotion_ts_points`，按 `promotionId + tsInterval + sampleTime` 去重，用于：

- 补回本地离线期间缺失的投中时间点；
- 校验本地相邻累计快照差值；
- 观察官方回填和归因修正。

不能把接口返回时间当成本地 `captured_at`，也不能把范围响应伪装成一次当前快照。
官方页面当前按每批500个 `promotionId` 请求；服务端硬上限尚未实测。

### 3.6 深度效果 `getFeedPromotionOrderIndicatorDetail`

#### 输入

```json
{
  "promotionId": "<promotion-id>"
}
```

#### 输出

```text
materialIndicatorList[]
indicatorDetail.actionDetailinfos[]
indicatorDetail.materialActionDetailinfos[]
indicatorDetail.ageInfo[]
indicatorDetail.genderInfo[]
indicatorDetail.cityInfo[]
indicatorDetail.interestTagInfo[]
indicatorDetail.interestTagInfoV2[]
```

该接口用于观众画像、观看时长分布以及点赞、评论、关注、分享、收藏、商品点击等
行为发生的观看阶段。

审核中和刚开始加热但尚未消耗时，接口请求成功、上述数组均为空。系统应记录为
“尚未产生深度数据”，不得记录为接口失败。

### 3.7 当前投中快照方案（挂车视频）

2026-07-29 按投中详情页实际使用的决策字段完成裁剪。每轮按统一
`captured_at` 保存：

```text
每账号：
1 × searchFeedPromotionOrderList

每笔需跟踪订单：
1 × getFeedPromotionOrderDetail
```

请求数为 `1 + 跟踪订单数`。单账号、单订单每轮为2次请求。两个请求均在账号
隔离的加热平台登录环境内直接发送，不通过模拟点击触发。

当前数据落点：

```text
promote_capture_runs
→ 一轮采集批次和统一 captured_at

promote_orders
→ 每笔订单一行
→ 保存订单配置、视频/商品关联、固定佣金比例和最新状态

promote_order_snapshots
→ 每笔订单每批次一行
→ 拆列保存累计消耗、互动、点击、成交、退款和 ROI
→ 金额按官方最小整数单位保存：微信豆使用十分之一豆，GMV 使用分
→ 以 account_id + promotion_id + captured_at 保证时间点唯一
→ 保存 complete/partial 质量状态及缺失字段清单
→ Detail 原始响应仅保留14天，用于近期调试

promote_order_snapshot_deltas
→ 基于原始快照的只读分析视图
→ 使用真实时间间隔计算相邻快照差值
→ 标记累计计数回退，避免将官方修正误算为负流速
```

已从投中快照机退役：

```text
getFeedPromotionOrderOverview
getFeedPromotionOrdersTsIndicator
getFeedPromotionOrderIndicatorDetail
罗盘单视频 List
罗盘单视频 Detail
```

退役原因：新版投中详情不使用人群画像、官方趋势或视频整体数据；订单配置、
资金消耗、投放互动、商品点击、成交、退款和 ROI 均由 Detail 覆盖。佣金比例
通过订单商品 ID 关联本地商品表，不随分钟快照重复请求罗盘。

数据库已迁移为投中快照 v4 主从结构。订单 List 只负责发现订单，不再重复写入
每条快照。佣金比例在订单首次入库时从本地商品表复制到 `promote_orders`，后续
整笔订单固定使用该比例。净佣金、净盈亏和佣金 ROI 在查询时计算，不落库。
旧库迁移前会自动生成完整 SQLite 备份。
