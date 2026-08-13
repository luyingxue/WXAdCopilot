# 视频号助手(creator)· 接口目录

> 所有业务接口均为 `POST`,域名 `channels.weixin.qq.com`,返回 JSON,顶层结构 `{errCode, errMsg, data}`(`errCode=0` 为成功)。
> 通用请求字段:`timestamp, _log_finder_uin, _log_finder_id, rawKeyBuff, pluginSessionId, scene, reqScene`(账号标识 + 会话 + 防重放)。
> 响应 HTTP 状态多为 `201`(业务成功),非 REST 语义,以 `errCode` 为准。

---

## 1. post_list -- 视频列表(核心)

- **平台:** creator
- **触发页面:** 内容管理 / 视频列表
- **触发动作:** 进入页面 / 刷新 / 翻页
- **方法:** POST
- **URL 模式:** `/micro/content/cgi-bin/mmfinderassistant-bin/post/post_list?_aid&_rid&_pageUrl`
- **用途:** 获取账号视频列表及单视频累计互动统计
- **请求参数:** `pageSize, currentPage, userpageType, stickyOrder, timestamp, rawKeyBuff, _log_finder_uin, _log_finder_id, pluginSessionId, scene, reqScene`
- **分页方式:** 页码(`currentPage/pageSize`)+ 游标(`rawKeyBuff` 请求 / `lastBuff`+`continueFlag` 响应)双轨
- **返回实体:** 视频(post),数组 `data.list[]`;含 `totalCount`
- **顶层响应结构:** `{errCode, errMsg, data:{list[], totalCount, lastBuff, continueFlag, bindInfo[]}}`
- **服务端时间字段:** 未显式返回(需以本地采集时间为快照时间)
- **历史范围:** 全部已发布视频(`totalCount=1082`);翻页可遍历
- **更新延迟:** 已验证 `readCount` 等为活累计计数器,刷新/随时间增长(P0-06 周期快照机制可行)
- **响应样本：** 仅保存在本地私有研究目录，不进入公开仓库。
- **稳定性判断:** 可生产使用(待口径核对与限频测试)
- **备注:** 单视频即含 `readCount/likeCount/commentCount/forwardCount/favCount/followCount/fullPlayRate/avgPlayTimeSec`;最新 1-2 条计数可能为 0

## 2. new_post_total_data -- 账号级时段聚合统计

- **URL:** `/cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data`
- **请求参数:** `startTs, endTs, interval, ...`
- **用途:** 账号在指定时段的浏览/点赞/评论/转发/收藏/关注 **聚合** 统计,按 tabType(内容类型)、fansType 拆分
- **返回实体:** 账号统计聚合(非单视频)
- **顶层结构:** `{data:{dataByTabtype[], dataByFanstype[], totalData:{browse,like,comment,forward,fav,follow,...}}}`
- **备注:** `totalData.*` 为 `[值, ...]` 数组(按 interval 多点)。**账号级,不可当单视频用**

## 3. auth_data -- 账号 / 认证信息

- **URL:** `/cgi-bin/mmfinderassistant-bin/auth/auth_data`
- **用途:** 账号主体、视频号资料、认证信息、功能开关
- **返回实体:** 账号
- **关键字段:** `finderUser.finderUsername/uniqId/nickname/feedsCount/fansCount`、`userAttr.username`、`authInfo.*`、`proxyUid`、`txvideoOpenId`
- **备注:** 账号 ID 候选来源

## 4. fans_trend -- 关注者趋势

- **URL:** `/cgi-bin/mmfinderassistant-bin/statistic/fans_trend`
- **请求参数:** `startTs, endTs, interval, ...`
- **用途:** 时段内新增/流失/净增/总粉丝,按 tabType(主页等)拆分
- **顶层结构:** `{data:{add[], reduce[], netAdd[], total[], fansDataByTabtype[]}}`

## 5. get_finder_ec_info_for_opening_page -- 店铺 / 橱窗信息

- **URL:** `/cgi-bin/mmfinderassistant-bin/shop/get_finder_ec_info_for_opening_page`
- **用途:** 视频号绑定的店铺/橱窗信息
- **关键字段:** `shopInfo.appid/shopName/shopType`、`talentItem.talentAppid`、`windowName`、`isWxShop`

## 6. mp_finder_window_init -- 窗口初始化

- **URL:** `/cgi-bin/mmfinderassistant-bin/auth/mp_finder_window_init`
- **关键字段:** `finderUsername`、`shopItem.appid/nickname`、`talentItem.talentAppid`

## 7. get_collection_list -- 合集列表

- **URL:** `/micro/content/cgi-bin/mmfinderassistant-bin/collection/get_collection_list`
- **请求参数:** `pageNum, pageSize, collectionScene, collectionBusinessType`
- **用途:** 视频合集(本账号为空)

## 8. 辅助 / 埋点(不用于业务分析)

| 接口 | 用途 |
|---|---|
| `helper/hepler_merlin_mmdata` | Merlin 埋点(x58) |
| `report-perf` | 性能上报 |
| `helper/helper_report`、`helper/helper_mmdata` | 通用埋点 |
| `online_heartbeat` | 心跳(GET) |
| `notification/notification_list` | 通知列表 |
| `auth/get_auth_info`、`auth/auth_110_report`、`active-auth/is-in-finder-whitelist` | 鉴权辅助 |
| `vip/get-user-member-service-status` | 会员状态 |
| `component/get_admin_bound_component_list` | 组件 |
| `auth/list_talent_relation_by_bind_uin` | 达人关系 |
| `helper/helper_upload_params` | 上传参数 |
| `/micro/{content|live|eccommerce}/mf-manifest.json` | wujie 微前端清单(GET) |
| `/micro/content/post/list`、`/micro/content/iframe/post-card.html` | 微应用 HTML 壳(GET) |

---

## 9. 数据中心页接口(`/platform/statistic/post`)

> 该页用 wujie 微应用 `finder-helper-statistic` 在 iframe(name="statistic")内渲染。
> **抓取陷阱:** 首次进入/reload 时多 JS 高并发涌入,CDP 响应缓冲被挤爆,`response.body()` 报 `No resource with given identifier found`。**可靠解法:RELOAD 拉起微应用后 SNAP 一次(`page.content()`),再 CLICK/RELOAD 触发目标接口,body 即可稳定读取。** 详见 [../../architecture.md](../../architecture.md) §4.3 与 [collection-guide.md](collection-guide.md) §2。请求拦截(route/CDP Fetch/CDP Network)会卡死微应用,不可用。

### 9.1 new_post_total_data -- 账号级时段统计 + 流量来源拆分

- **URL:** `/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data`
- **请求参数:** `startTs, endTs, interval, ...`
- **用途:** 账号在指定时段的互动统计,**按流量来源(tabType)拆分**
- **返回结构:** `{data:{dataByTabtype[], dataByFanstype[], totalData{}}}`
- **流量来源 tabType/tabTypeName(Doc1 T-14):** 3=关注、4=推荐、6=分享、20=主页、8=朋友♡、16=订阅号消息、15=PC微信、25=看一看、0=其他
- **每来源字段:** `browse, like, comment, forward, fav, follow, ringset, snscover, statusref, forwardAggregation, wecomLinkClick, wecomContactAdd`
- **新增变现字段:** `wecomLinkClick`(企微链接点击)、`wecomContactAdd`(企微联系人添加)
- **totalData:** 账号汇总(按 interval 多点数组)

### 9.2 get-finder-total-statics -- 账号总览

- **URL:** `/cgi-bin/mmfinderassistant-bin/statistic/get-finder-total-statics`
- **用途:** 账号总粉丝数、是否支持挂车
- **字段:** `data.fansNum`(如 26465)、`data.supportPostProduct`(bool)

### 9.3 get-product-statics -- 单商品成交统计

- **URL:** `/cgi-bin/mmfinderassistant-bin/statistic/get-product-statics`
- **请求参数:** `id, idType, recentDays, ...`
- **用途:** 单商品的曝光/点击/订单/GMV(商品级,非视频级)
- **字段:** `data.productStatics[]`:`exposeCnt/exposeIncrPercent`(曝光及环比)、`clickCnt/clickIncrPercent`(点击)、`orderCnt/orderIncrPercent`(订单)、`dealMoney/dealIncrPercent`(成交金额 GMV 及环比)

### 9.4 statistic/post_list -- 单篇视频列表(按日期范围,核心)

- **URL:** `/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list`
- **触发页面:** 数据中心 -> 视频数据分析 ->「单篇视频」tab + 日期筛选
- **请求参数:** `pageSize, currentPage, sort, order, startTime, endTime, ...`
- **用途:** 指定日期范围内**每条视频**的统计(播放/互动/完播率/观看时长),带分页与排序
- **返回结构:** `{data:{list[], totalCount}}`(list 每页 10 条)
- **关键字段:** `exportId`(跨端主键,与内容管理 post_list 同格式)、`readCount/likeCount/commentCount/forwardCount/favCount/followCount`(日期范围内)、`fullPlayRate`(完播率)、`avgPlayTimeSec`(平均观看时长)、`fastFlipRate`、`yesterdayReadCount`、`desc.description`(标题)、`desc.shortTitle`(短标题)、`desc.media[0].videoPlayLen`(时长)
- **与内容管理 `post/post_list` 区别:** 后者是**累计**总统计;本接口是**日期范围**内统计(可算边际/流速)。两者 `exportId` 一致;但 `objectId` 格式不同(本接口为纯数字,内容管理为 `export/...`),故 **`exportId` 才是可靠跨端主键**。

### 9.5 postDetail 页 -- 单视频详情接口（2026-07-26 已实测）

> 页面 URL:`/platform/statistic/postDetail?isImageMode=0`。URL 本身不携带视频ID；
> 必须从「单篇视频」列表点击进入。列表行对象提供 `exportId` 与数字
> `objectId`，其中 `objectId` 在详情接口中作为 `feedId`。

- **`statistic/feed_aggreagate_data_by_tab_type`**
  - 参数:`feedId, startTs, endTs, interval, ...`
  - 用途:单视频按来源(tabType)拆分的播放/互动时序。
  - 响应:`data.feedData[].dataByTabtype[]`，含 `browse/like/comment/forward/
    fav/follow/...` 数组；另含 `dataByFanstype`。
- **`statistic/get_feed_lost_rate`**
  - 参数:`feedId, ...`
  - 用途:单视频观众流失曲线。
  - 响应:`data.items[{sec,rate}]`、`videoLen`、`maxLostRateSec`。
- **`statistic/get-product-statics`**
  - 参数:`id:[exportId], idType:"2", ...`
  - 用途:该视频挂载商品信息；实测返回 `productStatics[]`。

**口径边界:** 详情页顶部的当前累计播放、互动、完播率和平均观看等基础值，
由上一页列表行对象传给详情组件；进入页面时没有再次调用一个“按 feedId
返回全部当前累计值”的接口。真正按 `feedId` 请求的是流失率和来源时序等
深层分析。因此基础累计快照仍应读取 `statistic/post_list`（可用精确发布时间
窗口缩小返回集），深层单视频分析则直接调用上述 `feedId` 接口。

---

## 10. 带货数据页接口(`/platform/statistic/cargo/transcation`,电商罗盘 compass)

> ✅ **加密已破解(JSON.parse hook,2026-07-23 验证通吃)。** 域名 `channels.weixin.qq.com/shop-faas/mmecnodecompasscommon/`,响应加密 `__payload__`(AES/Forge),但 hook 可拿解密明文(见 [../../architecture.md](../../architecture.md) §4.7)。微应用从 `static.wxqcloud.qq.com.cn/mmecnodecompassnodeall/` 加载,在 iframe(`/compass/embed/channels-helper`)内。
> **采集注意:** compass 微应用页 **RELOAD 会崩页**(Target crashed),**SNAP(page.content)也崩**。可靠流程:NAV -> RELOAD(只一次,bootstrap 微应用)-> 等 -> CAPTURE(不 SNAP、不二次 RELOAD)。hook 用**轻量版**(仅 window.__captured__,**不写 localStorage** -- sandbox iframe 写 localStorage 致崩)。

| 接口(POST) | 用途 | 解密状态 |
|---|---|---|
| `transaction-v2/getChart` | 成交分析图表 | ✅ 已解密 |
| `common/liner_query/compass/transaction-overview-finder-offline` | 成交概览(GMV/订单/退款/佣金) | ✅ 已解密 |
| `common/liner_query/compass/transaction-scene-finder-offline` | 成交按场景(直播间/短视频/商品分享) | ✅ 已解密 |
| `common/liner_query/compass/transaction-newold-finder-offline` | 成交按新老客 | ✅ 已解密 |
| `common/liner_query/compass/transaction-follow-finder-offline` | 成交按粉丝/非粉丝 | ✅ 已解密 |
| `common/getMenu`、`getIndustry`、`getLoginAccountList`、`account-info` | 罗盘菜单/行业/账号 | ✅ 已解密 |

> **已解密成交字段（35 指标）**见 [field-dictionary.md](field-dictionary.md) §十。响应样本不进入公开仓库。
> **这是账号级成交(按时段、按场景/新老客/粉丝拆分),非单视频归因。** 单视频成交归因见 commerce feed/list(GPM)+ 详情页(待探索)。
| `shop-faas/mmecnodecompasscommon/common/getLoginAccountList` | 登录账号列表 | 加密,待解 |
| `shop-faas/mmecnodecompasscommon/common/account-info` | 账号信息 | 加密,待解 |
| `shop-faas/mmecnodecompasscommon/common/rp/wcb`、`rp/mm` | 辅助 | 加密,待解 |
| `cube.weixinbridge.com/cube/report/reportbizdata` | 上报 | - |

> **解密方案(待决策):** ① JS hook(`add_init_script` 注入,在 compass JS 解密后、`JSON.parse` 前拦截明文;风险:init script 能否进 compass iframe、compass 是否用 JSON.parse)② 反编译 compass JS 找密钥+算法。详见 [exploration-log.md](../../exploration-log.md)。
> **替代:** creator 端 `statistic/get-product-statics`(明文)已提供商品级 GMV/订单;单视频×商品归因(M-06~M-11)若仅在此则受阻塞,可先试 `store.weixin.qq.com` 是否明文。
