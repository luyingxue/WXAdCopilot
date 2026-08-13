# creator 端采集指南(给 coding agent)

> 本文件是"如何把 creator 端数据采下来"的 playbook。字段定义见 [field-dictionary.md](field-dictionary.md),接口清单见 [api-catalog.md](api-catalog.md),陷阱见 [../../architecture.md](../../architecture.md) §4。

## 1. 采集策略(核心原则)

**用浏览器拦截,不要自己构造 HTTP 请求。**

- 视频号助手所有业务接口都带会话/防重放参数:`rawKeyBuff, pluginSessionId, scene, reqScene, timestamp, _log_finder_uin, _log_finder_id`。这些由页面 JS 在前端生成/维护,**无法离线构造**。
- 正确做法:用 Playwright 打开页面(登录态由持久化 profile 提供),**让页面 JS 自己发请求**,通过 `context.on("response")` 拦截响应 body。auth/签名全部由页面处理,采集器只读响应。
- **不要**尝试用 requests/httpx 直接调这些 cgi-bin 接口(会因缺 rawKeyBuff/pluginSessionId/签名而失败)。
- 请求体只记了字段名(`post_data_keys`),**未记值**;若未来必须重放请求,需先抓请求体(目前未做)。

## 2. 标准采集流程(微应用页通用)

每个微应用页(内容管理、数据中心、带货数据)都遵循:

```
NAV  目标 URL            # 直接 goto 常只加载外壳
RELOAD                    # 拉起 wujie 微应用、发首屏数据接口(body 此时会失败,正常)
SNAP                      # page.content() 同步 CDP 缓冲(关键!之后 body 才稳)
CLICK/RELOAD/NAV          # 触发目标接口(tab 切换/翻页/日期/进详情)
→ 拦截响应 body           # SNAP 之后的接口 body 100% 可读
```

**为什么必须 SNAP:** 微应用 reload 时 fetch 加载大量 JS,挤爆 CDP 响应缓冲,`response.body()` 报 `No resource`。SNAP 一次后缓冲被同步,后续 body 稳定。详见 architecture §4.3。

**CLICK 驱动 tab:** `CLICK` 信号文件写文字(如「单篇视频」「商品明细」),脚本遍历所有 frame 点击首个匹配。tab 切换只发数据接口、无 JS 突发,是 post-SNAP 抓 body 的最佳触发方式。

## 3. 分页

- `post_list`(内容管理累计):`currentPage/pageSize` + 游标双轨。请求带 `rawKeyBuff`;响应 `lastBuff`+`continueFlag`。遍历:用 `currentPage` 递增,或用 `lastBuff` 作下一页 `rawKeyBuff`。`totalCount` 为总数。
- `statistic/post_list`(数据中心日期范围):`currentPage/pageSize` + `sort/order` + `startTime/endTime`。`totalCount` 为范围内视频数。

## 4. 数据需求 → 接口 → 采集动作(覆盖矩阵)

| Doc1 指标 | 字段 | 接口 | 页面/动作 | 状态 |
|---|---|---|---|---|
| T-01 account_id | `finderUser.finderUsername`/`uniqId` | `auth/auth_data` | 任意页加载即发 | ✅ 高 |
| T-02 video_id | `exportId`(≡`objectId`) | `post/post_list`、`statistic/post_list` | 内容管理列表 / 数据中心单篇视频 | ✅ 高 |
| T-03 publish_time | `createTime` | 同上 | 同上 | ✅ 高(已核) |
| T-04 title | `desc.description` | 同上 | 同上 | ✅ 高(已核) |
| T-05 total_views | `readCount`(累计) | `post/post_list` | 内容管理列表 | ✅ 高(已核累计) |
| T-06 likes | `likeCount` | `post/post_list` | 同上 | ✅ 高(拇指/爱心子区分待核) |
| T-07 likes_heart | ? | ? | ? | ❌ 未发现独立爱心赞字段 |
| T-08 comments | `commentCount` | `post/post_list` | 同上 | ✅ 高(已核) |
| T-09 shares | `forwardCount` | `post/post_list` | 同上 | ✅ 高(已核) |
| T-10 new_followers | `followCount` | `post/post_list` | 同上 | 🟡 字段在,列表不渲染,口径待核 |
| T-11 completion_rate | `fullPlayRate` | `post/post_list`、`statistic/post_list` | 同上 | 🟡 字段在,口径待核(无显示值对照) |
| T-12 avg_watch_time | `avgPlayTimeSec` | 同上 | 同上 | 🟡 同上 |
| T-13 video_duration | `desc.media[0].videoPlayLen` | `post/post_list` | 同上 | ✅ 高 |
| T-14 traffic_source | `dataByTabtype[].tabType/tabTypeName` | `new_post_total_data`(数据中心) | 数据中心-视频数据分析 | ✅ 高(账号级,按时段) |
| M-02 product_id | `desc.product.productId` | `post/post_list` | 内容管理列表(挂车时) | ✅ 高 |
| M-03 product_name | `desc.product.title` | 同上 | 同上 | ✅ 高 |
| M-04~M-08 商品级成交 | `exposeCnt/clickCnt/orderCnt/dealMoney` | `statistic/get-product-statics` | 数据中心(商品级,非视频级) | 🟡 中(商品级,非视频归因) |
| P0-06 周期快照 | 全部累计字段 | `post/post_list` | 周期采集 | ✅ 机制确认(readCount 等是活计数器,会增长) |

**额外有价值字段(非 Doc1 清单):**
- `wecomLinkClick`/`wecomContactAdd`(企微链接点击/联系人添加,账号级转化)-- `new_post_total_data.dataByTabtype[]`
- `fastFlipRate`(快速划过率)、`yesterdayReadCount`(昨日播放)-- `post_list`
- `forwardSnsCount`/`forwardAllChatCount`(转发到朋友圈/聊天细分)-- `post_list`
- `desc.shortTitle`(短标题)-- `statistic/post_list`
- `fans_trend`(关注新增/流失/净增,账号级时段)
- `get-finder-total-statics.fansNum`(总粉丝)

## 5. 开放缺口 / 阻塞项(coding agent 需知)

| 项 | 说明 | 影响 | 建议优先级 |
|---|---|---|---|
| **compass(带货数据)加密** | `cargo/transcation` 页的 `shop-faas/mmecnodecompasscommon/*` 响应为 `__payload__` 加密密文 | 单视频×商品成交归因(M-06~M-11)若仅在此处则阻塞 | 高(需 JS hook 或反编译;或试 store.weixin.qq.com 是否明文) |
| **postDetail 单视频详情 body 未捕获** | `feed_aggreagate_data_by_tab_type`(单视频流量来源)、`get_feed_lost_rate`(流失率)接口已发现,body 未抓到 | 单视频级流量来源(T-14 细化)缺失 | 中(从单篇视频列表点入 postDetail、SNAP 后触发) |
| **T-11/T-12 口径未核** | `fullPlayRate`/`avgPlayTimeSec` 字段存在,但列表页不渲染,无显示值对照 | 完播率/观看时长口径未最终确认 | 中(需主号数据中心页面对照,测试号数据量小) |
| **T-07 爱心赞** | 未发现独立"爱心赞"字段(likeCount 可能含拇指+爱心) | 拇指赞/爱心赞区分缺失 | 低 |
| **跨端 exportId 一致性** | exportId 在 creator 内跨接口一致,但 commerce/promote 端未验证 | 三端关联主键命脉 | 高(进 commerce/promote 时优先验证) |
| **请求体未存** | 只记 post_data_keys 名,未存值 | 若需重放请求则缺料 | 低(浏览器拦截方案下不需要) |
| **`_log_finder_uin/id` 与 `finderUsername` 映射** | 请求侧 uin/id 与响应侧 username 未对上 | 账号标识跨侧映射待核 | 低 |
| **限频/登录态有效期** | 未测接口限频与 session 过期时长 | VPS 长跑稳定性 | 中(部署前测) |

## 6. commerce 概念澄清(防混淆)

存在**两个**带货相关的数据源,勿混:

1. **creator 端「带货数据」页** `channels.weixin.qq.com/platform/statistic/cargo/transcation` -- 用电商罗盘 compass 后端(`shop-faas/mmecnodecompasscommon`),**响应加密**。属 creator 平台,已探(加密阻塞)。
2. **微信小店/电商罗盘** `store.weixin.qq.com` -- 独立平台,**未探**。entity-map 里"commerce"跨端映射指的是这个。

跨端 `exportId` 验证应在 #2(store.weixin.qq.com)进行。

## 7. 采集器调用示例

```bash
# 探索/采集 creator(有头,扫码登录一次后 profile 持久化)
.venv/bin/python scripts/explore.py --platform creator --start-url "https://channels.weixin.qq.com/platform/post/list" --session collect-$(date +%Y%m%d)

# 信号文件驱动(在另一终端)
cd data/raw-private/<session>/
touch SNAP                      # 抓 DOM + 同步缓冲
echo "单篇视频" > CLICK          # 切 tab
touch RELOAD                    # 刷新
echo "https://..." > NAV         # 导航
touch STOP                      # 结束
```

采集后:解析 `manifest.jsonl`(全量响应元数据)+ 同目录 `*.json`(响应 body)→ 入库 SQLite(snapshot_time = 本地采集时刻)。
