# 视频号助手(creator)· 字段字典

> 可信度:**高** = 页面标签/数值核对/多采样一致;**中** = 多样例推断,口径待核对;**低** = 仅字段名或单样例支持。
> 字段由本地私有测试数据验证；公开文档仅保留匿名占位值，不分发响应样本。

## 口径核对结论(Doc2 步骤七,2026-07-23)

用屏幕实读 18 条视频 × 5 字段 = 90 项逐项比对:**68 精确吻合 + 22 增长漂移(接口值<屏幕值,差额在抓取后 30-40 分钟自然增长内)+ 0 矛盾**。

| 页面列 | 接口字段 | 口径结论 | 可信度 |
|---|---|---|---|
| 播放 | `readCount` | 累计播放量;屏幕万级四舍五入;随时间增长(活的累计计数器) | **高** |
| 点赞 | `likeCount` | 累计点赞 | **高** |
| 评论 | `commentCount` | 累计评论 | **高** |
| 转发 | `forwardCount` | 累计转发 | **高** |
| 收藏 | `favCount` | 累计收藏 | **高** |
| 发布时间 | `createTime` | unix 秒,与屏幕日期逐位一致 | **高** |
| 标题 | `desc.description` | 视频描述即标题 | **高** |
| 已声明原创 | `originalInfo.isDeclared` | 1=已声明 | **高** |

**列表页不渲染(接口有、页面无,需到"数据中心"核口径):** `followCount`(关注)、`fullPlayRate`(完播率)、`avgPlayTimeSec`(平均观看时长)、`yesterdayReadCount`、`fastFlipRate`。

**数据质量警告:** 本账号反复用相同 hashtag 作标题(如「#老年人#生活#情感#社会现象」多条不同日期)。**标题不可作主键**,跨端映射必须用 `exportId`+`createTime`(印证 Doc1 §2.2 主键优先级)。

---

## 一、视频实体 -- 来自 `post_list` 的 `data.list[]`

| 字段路径 | 类型 | 页面标签 / 语义 | 对应 Doc1 | 单位/样例 | 出现条件 | 可信度 |
|---|---|---|---|---|---|---|
| `objectId` | str | 视频全局 ID | T-02 video_id | `export/UzFfBg...` | 总是 | 高 |
| `exportId` | str | 同 objectId | T-02 | `export/UzFfBg...` | 总是 | 高 |
| `objectNonce` | str | 视频 nonce(次级 ID) | - | `5858811098765822445` | 总是 | 中 |
| `createTime` | int | 发布时间 | T-03 publish_time | unix 秒 | 总是 | 高 |
| `effectiveTime` | int | 生效/定时时间 | - | unix 秒 | 有 | 中 |
| `desc.description` | str | 视频标题/描述 | T-04 title | 文本 | 总是 | 高 |
| `desc.mediaType` | int | 媒体类型 | - | 4=视频 | 总是 | 中 |
| `desc.media[0].videoPlayLen` | int | 视频时长 | T-13 video_duration | 秒,如 306 | 有媒体 | 高 |
| `desc.media[0].width` / `height` | int | 分辨率 | - | 1080/1920 | 有 | 高 |
| `desc.media[0].fileSize` | str | 文件大小 | - | 字节 | 有 | 中 |
| `desc.media[0].bitrate` | int | 码率 | - | 6034 | 有 | 中 |
| `desc.media[0].coverUrl` / `thumbUrl` | str | 封面/缩略图 | - | URL | 有 | 高 |
| `desc.product.productId` | str | 关联商品 ID | M-02 product_id | `<product-id>` | 挂车时 | 高 |
| `desc.product.title` | str | 商品名称 | M-03 product_name | 文本 | 挂车时 | 高 |
| `desc.component.id` / `title` | str | 同商品 ID/名称 | M-02/M-03 | 同上 | 挂车时 | 高 |
| `desc.shortTitle[0].shortTitle` | str | 短标题 | - | 文本 | 有时 | 中 |
| `desc.feedLocation.longitude/latitude` | int | 位置 | - | 0=无 | 有 | 低 |
| `readCount` | int | 累计播放量 | T-05 total_views | 2712316 | 总是 | 高(已核累计) |
| `likeCount` | int | 点赞数 | T-06 likes_thumb | 56095 | 总是 | 高(已核=点赞;拇指/爱心子区分待核) |
| `commentCount` | int | 评论数 | T-08 comments | 4931 | 总是 | 高 |
| `forwardCount` | int | 转发数 | T-09 shares | 136960 | 总是 | 高 |
| `favCount` | int | 收藏数 | - | 63837 | 总是 | 高 |
| `followCount` | int | 视频带来的关注增量 | T-10 new_followers | 25057 | 总是 | 中(口径待核对) |
| `fullPlayRate` | float | 完播率 | T-11 completion_rate | 0.157 | 有统计时 | 中(口径待核对) |
| `avgPlayTimeSec` | float | 平均观看时长 | T-12 avg_watch_time | 秒,96.89 | 有统计时 | 中(口径待核对) |
| `fastFlipRate` | float | 快速划过率 | - | 0.306 | 有时 | 中 |
| `yesterdayReadCount` | int | 昨日播放 | - | 2257 | 有时 | 中 |
| `forwardAggregationCount` | int | 转发聚合数 | - | 136986 | 有 | 中 |
| `forwardSnsCount` | int | 转发到朋友圈 | - | 9078 | 有 | 中 |
| `forwardAllChatCount` | int | 转发到聊天 | - | 127878 | 有 | 中 |
| `snscoverCount` | int | (语义待核) | - | 16 | 有 | 低 |
| `statusrefCount` | int | (语义待核) | - | 10 | 有 | 低 |
| `ringsetCount` | int | (语义待核) | - | 0 | 总是 | 低 |
| `status` | int | 视频状态 | - | 1 | 总是 | 中 |
| `visibleType` | int | 可见性 | - | 1 | 总是 | 中 |
| `handleStatus` | int | 处理状态 | - | 2 | 总是 | 中 |
| `stickyOpStatus` | int | 置顶状态 | - | 0/2 | 总是 | 中 |
| `objectType` | int | 对象类型 | - | 0 | 总是 | 中 |
| `flag` | int | 标志位 | - | 2144 | 总是 | 低 |
| `permissionFlag` | int | 权限标志 | - | 0 | 总是 | 低 |
| `commentClose` | int | 是否关闭评论 | - | 0 | 总是 | 中 |
| `originalInfo.isDeclared` | int | 是否原创声明 | - | 1 | 总是 | 中 |
| `originalInfo.auditOriginalFlag` | int | 原创审核 | - | 1 | 有 | 中 |
| `disableInfo.isDisabled` | bool | 是否被禁 | - | false | 总是 | 中 |
| `canSetOriginalsoundTitle` | bool | 可设原声标题 | - | true | 总是 | 低 |
| `argsInfo.poiCheckSum` | str | POI 校验 | - | md5 | 有 | 低 |
| `commentList` | list | 评论(列表内空) | - | [] | 总是 | 低 |

## 二、列表分页/汇总 -- `post_list` 的 `data`

| 字段路径 | 类型 | 语义 | 样例 | 可信度 |
|---|---|---|---|---|
| `data.totalCount` | int | 视频总数 | 1082 | 高 |
| `data.lastBuff` | str | 下一页游标 | `export/SzFfBg...` | 高 |
| `data.continueFlag` | bool | 是否还有下一页 | true | 高 |
| `data.bindInfo[0].type` | int | 绑定类型 | 3 | 中 |
| `data.bindInfo[0].bizInfo.name` | str | 账号名 | 示例账号 | 中 |

## 三、账号实体 -- `auth_data` 的 `data`

| 字段路径 | 类型 | 语义 | 对应 Doc1 | 可信度 |
|---|---|---|---|---|
| `finderUser.finderUsername` | str | 视频号 username(账号 ID) | T-01 account_id | 高 |
| `finderUser.uniqId` | str | 视频号 uniqId | T-01 | 高 |
| `finderUser.nickname` | str | 视频号名称 | - | 高 |
| `finderUser.feedsCount` | int | 视频数 | - | 高 |
| `finderUser.fansCount` | int | 粉丝数 | - | 高 |
| `finderUser.acctType` / `authIconType` | int | 账号/认证类型 | - | 中 |
| `userAttr.username` | str | 运营者微信号 | - | 高 |
| `userAttr.encryptedUsername` | str | 加密微信号 | - | 中 |
| `authInfo.authProfession` | str | 认证职业 | - | 中 |
| `authInfo.authUserLevel` | int | 认证等级 | - | 中 |
| `authInfo.authTime` / `authExpiretime` | int | 认证时间/过期 | - | 中 |
| `proxyUid` | str | 代理 UID | - | 中 |
| `txvideoOpenId` | str | 视频号 openId | - | 中 |
| `signature` | str | 简介 | - | 高 |

## 四、店铺实体 -- `get_finder_ec_info_for_opening_page`

| 字段路径 | 类型 | 语义 | 可信度 |
|---|---|---|---|
| `shopInfo.appid` | str | 店铺 appid(shop_id) | 高 |
| `shopInfo.shopName` | str | 店铺名称 | 高 |
| `shopInfo.shopType` / `shopAcctType` | int | 店铺类型 | 中 |
| `talentItem.talentAppid` | str | 达人 appid | 中 |
| `windowName` | str | 橱窗名称 | 高 |
| `isWxShop` | int | 是否微信小店 | 高 |

## 五、关注趋势 -- `fans_trend`(账号级,时段)

| 字段路径 | 类型 | 语义 | 可信度 |
|---|---|---|---|
| `data.total[]` | int | 总粉丝(按 interval 多点) | 高 |
| `data.add[]` | int | 新增粉丝 | 高 |
| `data.reduce[]` | int | 流失粉丝 | 高 |
| `data.netAdd[]` | int | 净增粉丝 | 高 |
| `data.fansDataByTabtype[]` | obj | 按 tab(主页等)拆分 | 中 |

## 六、账号级统计 -- `new_post_total_data`(账号级,时段聚合,非单视频)

| 字段路径 | 类型 | 语义 | 可信度 |
|---|---|---|---|
| `data.totalData.browse[]` | str | 账号累计浏览(时段) | 中 |
| `data.totalData.like/comment/forward/fav/follow[]` | str | 账号互动聚合 | 中 |
| `data.dataByTabtype[]` | obj | 按 tabType 拆分 | 中 |
| `data.dataByFanstype[]` | obj | 按 fansType 拆分 | 中 |

## 七、请求侧通用字段(post_data_keys,仅记名不记值)

`pageSize, currentPage, userpageType, stickyOrder, timestamp, rawKeyBuff, pluginSessionId, scene, reqScene, _log_finder_uin, _log_finder_id, startTs, endTs, interval, pageNum, collectionScene, collectionBusinessType, isWxShopRequest`

> `_log_finder_uin` / `_log_finder_id` 为账号标识候选(请求侧),与响应侧 `finderUser.finderUsername` 需做映射核对。

## 八、数据中心(statistic/post)字段

### 流量来源 -- `new_post_total_data` 的 `dataByTabtype[]`(Doc1 T-14)

| tabType | tabTypeName(来源) | data 子字段 |
|---|---|---|
| 3 | 关注 | browse, like, comment, forward, fav, follow, ringset, snscover, statusref, forwardAggregation, wecomLinkClick, wecomContactAdd |
| 4 | 推荐 | 同上 |
| 6 | 分享 | 同上 |
| 20 | 主页 | 同上 |
| 8 | 朋友♡ | 同上 |
| 16 | 订阅号消息 | 同上 |
| 15 | PC微信 | 同上 |
| 25 | 看一看 | 同上 |
| 0 | 其他 | 同上 |

> **T-14 结论:** 账号级、按时段(startTs/endTs/interval)的流量来源拆分可生产使用。**单视频级流量来源**未在本页默认 tab 出现,需点进单视频详情(待探索)。
> **新增变现字段:** `wecomLinkClick`(企微链接点击)、`wecomContactAdd`(企微联系人添加)——账号级转化指标。

### 账号总览 -- `get-finder-total-statics`

| 字段路径 | 类型 | 语义 | 可信度 |
|---|---|---|---|
| `data.fansNum` | str | 账号总粉丝数 | 高 |
| `data.supportPostProduct` | bool | 是否支持挂车 | 高 |

### 单商品成交 -- `get-product-statics` 的 `productStatics[]`

| 字段路径 | 类型 | 语义 | 对应 Doc1 | 可信度 |
|---|---|---|---|---|
| `exposeCnt` | int | 商品曝光数 | M-04 相关(商品级) | 中 |
| `exposeIncrPercent` | float | 曝光环比 | - | 中 |
| `clickCnt` | int | 商品点击数 | M-04 product_clicks(商品级) | 中 |
| `clickIncrPercent` | float | 点击环比 | - | 中 |
| `orderCnt` | int | 订单数 | M-06 order_count(商品级) | 中 |
| `orderIncrPercent` | float | 订单环比 | - | 中 |
| `dealMoney` | 数值 | 成交金额(GMV) | M-07/M-08(商品级) | 中 |
| `dealIncrPercent` | float | 成交环比 | - | 中 |

> 请求参数 `id`+`idType`+`recentDays`:按商品 ID + 近 N 天查询。**注意:这是商品级成交,非单视频归因**;单视频成交归因(M-06~M-11)仍需 commerce 端。

## 九、单篇视频列表 -- `statistic/post_list` 的 `data.list[]`(按日期范围)

> 与「一、视频实体」字段几乎一致,但统计值为**日期范围内**(startTime/endTime),非累计。用于边际/流速分析。

| 字段路径 | 类型 | 语义 | 对应 Doc1 | 可信度 |
|---|---|---|---|---|
| `exportId` | str | 视频主键(`export/UzFfBg...`,与内容管理一致) | T-02 | 高 |
| `objectId` | str | 纯数字 ID(本接口格式与内容管理不同) | - | 中 |
| `createTime` | int | 发布时间(unix) | T-03 | 高 |
| `desc.description` | str | 标题 | T-04 | 高 |
| `desc.shortTitle[0].shortTitle` | str | 短标题 | - | 中 |
| `desc.media[0].videoPlayLen` | int | 时长(秒) | T-13 | 高 |
| `readCount` | int | 日期范围内播放(非累计) | T-05(范围) | 中(口径待核) |
| `likeCount` / `commentCount` / `forwardCount` / `favCount` / `followCount` | int | 日期范围内互动 | T-06/08/09/10(范围) | 中 |
| `fullPlayRate` | float | 完播率 | T-11 | 中(口径待核) |
| `avgPlayTimeSec` | float | 平均观看时长(秒) | T-12 | 中(口径待核) |
| `fastFlipRate` | float | 快速划过率 | - | 中 |
| `yesterdayReadCount` | int | 昨日播放 | - | 中 |
| `forwardAggregationCount` / `forwardSnsCount` / `forwardAllChatCount` | int | 转发细分 | - | 中 |

> 请求参数 `pageSize/currentPage/sort/order/startTime/endTime`:分页 + 排序 + 日期范围。`totalCount` 为范围内视频总数。

## 十、cargo 成交数据(compass,JSON.parse hook 解密,账号级时段)

> 来自 `cargo/transcation` 页的 `liner_query/compass/transaction-*-finder-offline` 系列（加密，已 hook 解密）。**账号级、按时段**，按场景/新老客/粉丝拆分。出于隐私考虑，响应样本不进入公开仓库。
> 顶层:`{code, metaConfig:{viewMap}, logid, total, trend, trendcompare}`。`total` 为汇总值,`trend`/`trendcompare` 为时序+同比环比。每个指标有 `_tb`(同比)、`_ind`(环比/增幅)后缀。

### 核心成交指标(viewMap 35 个,择要)

| 字段(viewMap key) | 语义 | 对应 Doc1 |
|---|---|---|
| `product_click_cnt` / `finder_product_click_cnt` | 商品点击次数 | M-04 product_clicks |
| `click_to_pay_cnt_ratio` / `finder_product_click_order_ratio` | 商品点击-成交率 | - |
| `pay_gmv` / `finder_pay_gmv` | 成交金额(支付 GMV) | M-08 paid_gmv |
| `create_gmv` / `finder_create_gmv` | 下单金额 | M-07 order_gmv |
| `pay_order_cnt` / `finder_pay_order_cnt` | 成交订单数 | M-06 order_count |
| `create_cnt` / `finder_create_order_cnt` | 下单订单数 | - |
| `pay_uv` / `finder_pay_uv` | 成交人数 | - |
| `create_uv` / `finder_create_order_uv` | 下单人数 | - |
| `pay_gmv_per_uv` / `finder_pay_gmv_per_uv` | 客单价 | - |
| `pay_product_id_cnt` / `finder_pay_product_id_cnt` | 动销商品数 | - |
| `pay_refund_gmv` / `finder_pay_refund_gmv` | 成交退款金额 | M-10 refund_gmv |
| `refund_gmv` | 退款金额 | M-10 refund_gmv |
| `finder_refund_order_cnt` | 退款订单数 | M-09 refund_count |
| `shop_gift_pay_gmv` / `_cnt` / `_uv` | 送礼成交金额/订单/人数 | - |
| `finder_actual_commission` | 结算佣金(达人) | ROI 用 |
| `finder_predict_commission` | 预估佣金(达人) | ROI 用 |
| `shop_platform_actual_commission` / `shop_finderuin_actual_commission` / `shop_captain_actual_commission` | 服务费/达人/团长佣金(实际) | - |
| `shop_*_predict_commission` | 各方预估佣金 | - |

> **派生:** M-11 net_gmv = `pay_gmv` − `refund_gmv`;M-14 GPM = `pay_gmv` / 播放 × 1000(播放取 post_list readCount)。
> **拆分维度(不同接口):** `transaction-scene`(直播间/短视频/商品分享)、`transaction-newold`(新客/老客)、`transaction-follow`(粉丝/非粉丝)、`transaction-overview`(总览)。
> **注意:** `finder_*` 前缀 = 达人维度;无前缀 = 店铺维度。账号级成交,非单视频归因。
