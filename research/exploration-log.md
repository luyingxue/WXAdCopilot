# 探索日志

## 2026-07-23 · creator · 内容管理/视频列表

**会话:** `creator-20260723-172111`(原始数据:`data/raw-private/creator-20260723-172111/`)
**操作人:** will(人工) + Claude(脚本与分析)
**脚本:** `scripts/explore.py`(Playwright 有头 + 持久化 Profile + 网络响应采集 + DOM 快照)
**账号（已匿名化）：** 示例视频号、示例运营者、示例店铺

### 操作序列
1. 扫码登录(首次;登录态持久化到 `~/.wxadcopilot/browser-profiles/operator-01/`)。
2. 打开 `https://channels.weixin.qq.com/platform/post/list`,列表加载完成。
3. 刷新一次。
4. 翻到下一页。
5. 排序/日期范围:页面 UI 无此入口(跳过)。
6. 视频详情:无独立详情页(跳过)。

### 采集结果
- 总响应 210 条;其中 xhr/fetch/json 业务响应 156 条,存 body 156 份。
- 核心接口 `POST /micro/content/cgi-bin/mmfinderassistant-bin/post/post_list` 命中 2 次(刷新 + 翻页)。
- 另捕获账号信息、关注趋势、账号级统计、店铺信息、微前端 manifest 等接口。

### 关键发现
1. 页面采用 **wujie(无界)微前端**:视频列表由 `/micro/content/` 微应用在 iframe 内渲染;`page.content()` 只能拿到外层壳,数据经 XHR(post_list)获取,非 SSR。首屏若只看外层 DOM 会误判为无数据。
2. **post_list 本身即带单视频累计互动统计**:`readCount/likeCount/commentCount/forwardCount/favCount/followCount` + `fullPlayRate`(完播率)+ `avgPlayTimeSec`(平均观看时长)+ `yesterdayReadCount/fastFlipRate`。前 1-2 条最新视频计数为 0(发布过新)。
3. 分页:**页码 + 游标双轨**。请求 `pageSize/currentPage/rawKeyBuff`;响应 `totalCount=1082`、`lastBuff`、`continueFlag`。
4. `new_post_total_data` 是**账号级时段聚合**(startTs/endTs/interval),非单视频;勿与单视频统计混淆。

### 待核实 / 风险
- `readCount` 是否为"累计总播放"(口径);`fullPlayRate` 是否为官方完播率口径;`followCount` 是否为"本视频带来的新增关注"。需与页面显示值核对(Doc2 步骤七)。
- T-07 拇指赞/爱心赞区分、T-14 流量来源拆分未在 post_list 出现,需进入"数据中心-视频数据分析"。
- 登录态有效期、限频、风控未测(本轮未触发验证码)。

### 下一步
- 暂停,等人工复核本轮记录质量(Doc2 §13)。
- 复核通过后:探索"数据中心-视频数据分析"补 T-07/T-14;再进 commerce、promote。

---

## 2026-07-23 · creator · 数值核对(Doc2 步骤七)

**方法:** 人工读屏 18 条视频的 5 个数 vs 接口 `post_list`(会话 172111,抓于约 30-40 分钟前)逐项比对。

**结果:** 90 项 = 68 精确吻合 + 22 增长漂移(接口<屏幕,自然增长)+ 0 矛盾。

**口径锁定:**
- 播放=`readCount`、点赞=`likeCount`、评论=`commentCount`、转发=`forwardCount`、收藏=`favCount`(均累计值,屏幕万级四舍五入)。
- 发布时间=`createTime`(unix,与屏幕逐位一致)、标题=`desc.description`、已声明原创=`originalInfo.isDeclared`。
- `readCount` 经证实为活累计计数器(随时间增长),满足 T-05"可重复读取观察变化"。

**列表页不渲染(需到数据中心核口径):** `followCount`/`fullPlayRate`/`avgPlayTimeSec`/`yesterdayReadCount`/`fastFlipRate`。

**新发现:**
- 直接导航到 `/platform/post/list` **不一定触发 post_list**(wujie 内容微应用未完全 bootstrap);需从首页路由进入或刷新。VPS 采集脚本要注意:先到首页再路由进列表,或显式刷新。
- 列表排序:置顶视频(`取消置顶`态)置顶,其余按 `createTime` 倒序;非纯时间倒序。
- 标题重复(同 hashtag 多条),**标题不可作主键**。

**结论:** creator 视频列表端 P0-01(视频ID exportId)、P0-05/06(单视频累计统计可重复读取)可用性 = **可生产使用**(T-05~T-09、T-13 已核口径)。T-10/T-11/T-12 字段存在但口径待数据中心核对;T-14 流量来源(账号级)已在统计页取得,见下。

---

## 2026-07-23 · creator · 数据中心(statistic/post)

**会话:** `creator-statistic`(测试账号,用户为避险换号)
**URL:** `https://channels.weixin.qq.com/platform/statistic/post`

**接口发现:**
- `new_post_total_data`(微应用 `finder-helper-statistic` 下):`dataByTabtype` 的 **tabType 即流量来源**(3=关注/4=推荐/6=分享/20=主页/8=朋友/16=订阅号/15=PC微信/25=看一看/0=其他),每来源拆 browse/like/comment/forward/fav/follow + 变现字段 `wecomLinkClick`/`wecomContactAdd`。→ **T-14 账号级流量来源可生产使用**。
- `get-finder-total-statics`:`fansNum`(总粉丝)、`supportPostProduct`。
- `get-product-statics`:单商品 `exposeCnt/clickCnt/orderCnt/dealMoney`(GMV)+ 环比(商品级,非视频归因)。

**抓取陷阱(重要,VPS 必读):** 首次进入/reload 时 24+JS 高并发,CDP 响应缓冲被挤爆,`response.body()` 全部报 `Network.getResponseBody: No resource with given identifier found`。**无 SW**(wujie 用 iframe 沙箱)。**解决:JS 缓存后再 reload 一次,body 即可正常读取**(第二次 reload 61/83 body 成功)。生产采集建议:启用 HAR 录制或增大 CDP 缓冲,并内建"首访+二次 reload"容错。

**未完成:** 单视频级流量来源/完播率分布(需点进单条视频,默认 tab 无);T-11/T-12 口径仍待与显示值核对。

---

## 2026-07-23 · creator · 单篇视频 tab + SNAP workaround(关键)

**会话:** `creator-stat8`(测试账号)

**关键发现 1 -- SNAP workaround(解锁 body 抓取):** 统计微应用页 `response.body()` 普遍报 `No resource`(CDP 缓冲被 JS 突发淘汰)。**触发一次 SNAP(`page.content()`)后,CDP 缓冲被同步,之后所有响应 body 稳定可读**(SNAP 后 7/7、36/36 全成功)。任何请求拦截(route / CDP Fetch / CDP Network.enable)**都会卡死微应用启动**,不可用。**结论:VPS 采集脚本在抓微应用页前先 SNAP 一次,再驱动交互抓 body。**

**关键发现 2 -- statistic/post_list:** 「单篇视频」tab + 日期筛选触发 `POST /micro/statistic/.../statistic/post_list`(参数 `pageSize/currentPage/sort/order/startTime/endTime`),返回**日期范围内每条视频**的统计(播放/互动/完播率 `fullPlayRate`/平均观看 `avgPlayTimeSec`/`fastFlipRate`/`yesterdayReadCount`),与内容管理 `post/post_list` 的**累计**统计互补(可算边际/流速)。

**关键发现 3 -- exportId 跨接口一致:** 内容管理 `post/post_list` 与 `statistic/post_list` 的 `exportId` 同为 `export/UzFfBg...` 格式;但 `objectId` 格式不同(内容管理=`export/...`,statistic=纯数字)。**确认 `exportId` 为可靠跨端主键,`objectId` 不可跨接口混用。**

## 2026-07-26 · 单视频精准跟踪可行性复核

### Creator

- `post/post_list` 不接受 `exportId`、`objectId`、`export_id` 或 `searchKey`
  作为服务端筛选条件；附加参数后仍返回完整分页。
- `pageSize=1` 可用于只读取最新一条视频。
- `statistic/post_list` 的 `startTime/endTime` 支持秒级范围。用已知
  `createTime` 构造 `[createTime, createTime + 1]`，实测只返回目标视频。
- 秒级时间窗返回的 `exportId` 与内容管理完全一致；播放、点赞、评论、
  转发、收藏、关注、完播率、平均观看、快划率逐项完全相等。
- 因此该时间窗用于“按发布时间定位视频”，返回值仍是当前累计指标，
  很适合低成本周期快照。若同秒发布多条，需再按 `exportId` 本地过滤。

### Commerce / Compass

- Talent 与 Compass 必须复用同一店铺会话；Compass 独立扫码会在
  `getLoginAccountList` 返回 403 后被官方主动退出。
- 官方列表点击详情后的正确URL为
  `/compass/feed/detail?id=<exportId>&bizId=<bizId>`。
- 旧参数 `export_id` 错误，会加载空详情。
- 使用正确URL直接定位“低处飞行”视频成功，实测返回：
  播放、点赞、评论、关注、转发、完播率、平均观看、商品名称、商品曝光、
  商品点击、成交金额、GPM、成交订单、退款金额、退款订单及转化漏斗。

**结论:** 已具备以 `exportId + createTime + bizId` 为定位信息，对观察池中
单条视频执行精准 Creator 累计快照与 Compass 单视频成交查询的接口基础，
无需扫描账号全部历史视频。

### Creator postDetail 深挖补充

- 从官方「单篇视频」列表点击“查看”进入
  `/platform/statistic/postDetail?isImageMode=0`，完整捕获并成功重放详情请求。
- 列表的数字 `objectId` 是详情接口的 `feedId`；`exportId`继续用于商品接口。
- `get_feed_lost_rate(feedId)` 实测返回按秒流失率、视频时长及最大流失点。
- `feed_aggreagate_data_by_tab_type(feedId,startTs,endTs,interval)` 实测返回
  按来源与粉丝类型拆分的播放/互动时序结构。
- `get-product-statics(id:[exportId],idType:"2")` 实测返回挂载商品。
- 网络请求证明：详情页顶部基础累计指标没有独立重新请求，而是复用列表点击时
  传入的行对象。因此“存在单篇视频分析页”并不等于存在一个覆盖全部基础累计
  指标的单接口；官方自身也是“列表行基础数据 + feedId深层接口”的组合。

**未完成:** 单视频级流量来源拆分(点进具体视频,未触发);T-11/T-12 口径仍待与显示值核对(测试号数据量小,难核)。

---

## 2026-07-23 · creator · 带货数据页(cargo/transcation,电商罗盘 compass)

**会话:** `creator-cargo`(测试号)。页面 `https://channels.weixin.qq.com/platform/statistic/cargo/transcation`,tab:成交分析 / 商品明细。

**重大发现 -- compass 后端全加密:** 带货数据页用的是电商罗盘(compass)后端 `channels.weixin.qq.com/shop-faas/mmecnodecompasscommon/`,与 creator cgi-bin 完全不同。**所有 compass 接口响应均为加密 `__payload__`(hex 字符串)**,请求体也是 `__payload__`。已确认 `transaction-v2/getChart`、`liner_query/compass/transaction`(成交/商品明细主数据)、`getMenu`、`account-info`、`getLoginAccountList`、`getIndustry` 全部加密。
- `__payload__` 解码后为二进制,非 gzip/deflate/zlib,非明文 JSON -- 疑似 AES/自定义加密,需 JS 中的密钥才能解。
- 微应用从 `static.wxqcloud.qq.com.cn/mmecnodecompassnodeall/` 加载,在 iframe 内渲染;SNAP 只抓到 7.8KB 壳,渲染数据表不在 DOM 快照(嵌套 iframe/shadow)。

**捕获到的 compass 接口(均加密,body 已存原始密文,待解密):**
- `POST /shop-faas/mmecnodecompasscommon/transaction-v2/getChart` -- 成交分析图表
- `POST /shop-faas/mmecnodecompasscommon/common/liner_query/compass/transaction` -- 成交/商品明细主数据(x4,7666-19986B)
- `POST /shop-faas/mmecnodecompasscommon/common/getMenu` / `getIndustry` / `getLoginAccountList` / `account-info` -- 罗盘菜单/账号/行业

**解密方案(待决策):**
1. **JS hook**(推荐,中成本最稳):`add_init_script` 注入,在 compass JS 解密后、`JSON.parse` 前拦截明文。风险:init script 能否注入到 compass iframe 内待验证;compass JS 可能不用 JSON.parse。
2. **反编译 compass JS** 找密钥+算法(高成本)。
3. **暂缓**:creator 端 `get-product-statics` 已提供**商品级** GMV/订单(明文,未加密),单视频成交归因若只在 compass 则受阻塞;可先试 `store.weixin.qq.com`(commerce)是否明文。

**结论:** 带货数据页 API 加密是 P0-05(单视频成交归因)的潜在阻塞点,需选上述方案之一。

---

## 2026-07-23 · commerce · store.weixin.qq.com(达人主页 + 电商罗盘)

**会话:** `commerce-feed2`(talent 主页,488 body)、`commerce-feedlist`(compass feed/list)。

**两套后端,加密性不同:**
- `shop-faas/mmeckolbasenode/*`(达人主页 `/talent/home`)-- **明文**,talent 扫码登录。已抓 488 body(账号/橱窗 Top3/等级/渠道/佣金等元数据)。
- `shop-faas/mmecnodecompasscommon/*`(电商罗盘 `/compass/feed/list`)-- **全加密 `__payload__`**,compass **独立扫码登录**(与 talent 不通用,未登录跳 `/compass/login`)。

**关键确认:commerce compass 与 creator cargo 是同一套加密。** commerce 短视频明细接口 `liner_query/1/feed-feedlist-shopfinder-realtime`(35890B)密文前缀 `1f7a3670...` 与 creator cargo 的 `transaction` 完全一致。**解一处即可通吃两端的带货/成交数据。**

**阻塞影响:**
- **跨端 exportId 验证被阻塞**:读不到 commerce feed/list 的视频 ID,无法与 creator `exportId` 对比(Doc1 §2.2 核心命题暂无法验证)。
- **P0-05 单视频成交归因(M-06~M-11)被阻塞**:短视频明细的 GMV/订单/退款在加密接口里。
- 临时替代:creator `get-product-statics`(明文,商品级 GMV)。

**采集细节:**
- compass 微应用页 body 仍需 SNAP workaround(NAV/RELOAD -> SNAP -> CLICK 触发 -> 抓 body);talent 主页是 SSR,body 直接可读(488/488 成功,无需 SNAP)。
- compass 登录 QR 接口(`getLoginQrCode`/`queryLoginQrCode`)是明文,数据接口加密。

**下一步:** 攻坚 compass 加密(JS hook 首选),解锁后即可读 feed/list + 单视频详情 + 跨端验证。详见 [platforms/commerce/api-catalog.md](platforms/commerce/api-catalog.md) §C。

---

## 2026-07-23 · compass 加密攻坚 -- 成功(JSON.parse hook)

**会话:** `compass-decrypt`。方案:`context.add_init_script` 注入 hook `JSON.parse`,捕获取解密后大对象;`CAPTURE` 信号遍历 frame `evaluate(window.__captured__)` 取回。

**结果:成功拿到 compass 解密明文!** compass JS 用 Forge 库(AES/RSA)解密 `__payload__` 后,经 `JSON.parse` 解析明文,hook 拦截到。需过滤 crypto 库噪声(`aes-128-ecb`/`modp1`/`sha224WithRSAEncryption` 算法表)与 `__payload__` wrapper。

**已解密的 commerce 短视频明细**(`liner_query/1/feed-feedlist-shopfinder-realtime`,原 35890B 密文):
- `export_id` = `export/UzFfBgAAxMij...`(**与 creator `exportId` 同格式 -- 跨端主键验证通过!**)
- `feedid_`、`create_time`、`videoInfo.description/cover_url`
- `read/like/comment/forward/fav/follow`(实时互动)
- `full_watch_radio`(完播率)、`average_watch_time`(观看时长)
- `pay_gmv_per_1k_watch_pv`(GPM,部分 null)

**三大解锁:**
1. **compass 加密绕过** -- JSON.parse hook 通吃 creator cargo + commerce compass(同一套加密)。
2. **跨端 exportId 验证成功** -- commerce `export_id` ≡ creator `exportId`,Doc1 §2.2 / P0-01 跨端确认。
3. **单视频 commerce 字段可读** -- GPM 已得;完整 GMV/订单/退款在详情页(待探)。

**注意事项:**
- compass session 短,RELOAD 易触发重新登录;采数据用 NAV(不 reload)+ CAPTURE。
- `add_init_script` 经 CDP 注入,对所有 frame(含 compass iframe)生效,已验证。
- 采集纪律:过滤 crypto 算法表 + `__payload__` wrapper,只留带业务字段的对象。

详见 [architecture.md](architecture.md) §4.7、[platforms/commerce/field-dictionary.md](platforms/commerce/field-dictionary.md)、[cross-platform/id-mapping.md](cross-platform/id-mapping.md)。

---

## 2026-07-23 · creator cargo 同法解密验证 -- 成功(hook 通吃确认)

**会话:** `cargo-decrypt3`(测试号 vic)。目的:验证 JSON.parse hook 能否解密 creator `cargo/transcation`(与 commerce compass 同套加密)。

**结果:成功!hook 通吃。** RELOAD 拉起 compass 微应用后,CAPTURE 从 compass iframe(`/compass/embed/channels-helper`)抓到 26 条明文,含**解密的成交数据**:
- `total.pay_gmv`(20400)、`pay_order_cnt`(4)、`pay_uv`、`pay_refund_gmv`/`refund_gmv`、`product_click_cnt`、`create_gmv`/`create_cnt`、`pay_gmv_per_uv`(客单价)、`pay_product_id_cnt`(动销商品数)
- 35 个指标(含 `finder_*` 达人维度 + `finder_actual_commission`/`predict_commission` 佣金)
- 拆分接口:`transaction-overview`(总览)、`transaction-scene`(直播间/短视频/商品分享)、`transaction-newold`(新老客)、`transaction-follow`(粉丝/非粉丝)

**踩坑(已记入 architecture §4.7):**
- compass 页 **RELOAD 崩页、SNAP 崩页**;localStorage hook 也致崩(sandbox iframe)。→ 用**轻量 hook**(仅 window.__captured__)+ 流程 **NAV -> RELOAD(一次)-> 等 -> CAPTURE**(不 snap、不二次 reload)。
- 之前 localStorage 版 hook 致 creator cargo 反复崩页;回退轻量版后稳定。

**结论:compass 加密彻底攻破。** 一个 JSON.parse hook 通吃 creator cargo + commerce compass。creator cargo 成交数据(M-04/06/07/08/09/10 + 佣金)可解密采集(账号级时段)。单视频归因仍靠 commerce feed/list(GPM)+ 详情页(待探索)。

详见 [platforms/creator/api-catalog.md](platforms/creator/api-catalog.md) §10、[platforms/creator/field-dictionary.md](platforms/creator/field-dictionary.md) §十、[architecture.md](architecture.md) §4.7。

---

## 2026-07-24 · promote · 微信豆加热平台探索完成 (P0 指标全通关)

**会话:** `promote-explore` / `promote_dashboard_after_login`
**操作人:** will (人工扫码) + Agent (内置浏览器子 Agent 探测与分析)
**URL:** `https://channels.weixin.qq.com/promote` (重定向至 `/promote/pages/platform/`)

### 操作序列
1. 浏览器 Agent 打开 `https://channels.weixin.qq.com/promote`，探测到扫码登录屏障及重定向 URL。
2. 人工扫码完成身份验证。
3. Agent 进入加热平台后台，全面探索 Dashboard、订单管理 (`/order/list`)、数据统计 (`/short-video/statistic`) 及今日实时看板 (`/short-video/daily-dashboard`)。

### 核心发现
1. **订单唯一标识 (P0-02)**: 确认每笔订单生成全局唯一 `orderId`（形如 `<timestamp>_<sequence>`），覆盖标准订单与全域订单。
2. **实际消耗 (P0-03)**: 数据表及 UI 精确提供 `consumed_amount` (消耗金额 RMB) 与 `consumed_beans` (消耗微信豆金额)。
3. **付费结果 (P0-04)**: 可精准获取加热带来的 `playCnt` (付费播放)、`likeCnt` (点赞)、`commentCnt` (评论)、`followCnt` (关注)。
4. **三端视频主键一致性 (P0-01 跨端)**: Promote 订单绑定的视频标识同为 `exportId` (格式 `export/UzFfBg...`)，与 Creator、Commerce 两端完全一致。
5. **创建订单流配置**: 确认智能加热、点赞、关注、播放数四大提升目标与 500/1000 微信豆预算预设。

### 结论
微信豆加热平台探索完成，P0-01 ~ P0-06 全部 6 项生死指标在三端均已验证可行。第一阶段核心数据可及性评估顺利完结。

详见 [platforms/promote/page-map.md](platforms/promote/page-map.md)、[platforms/promote/field-dictionary.md](platforms/promote/field-dictionary.md)、[cross-platform/id-mapping.md](cross-platform/id-mapping.md)。

## 2026-07-28 · promote · 自然流量溢出与 RPC 静态结构确认

### 新发现

1. 加热平台直接提供自然流量溢出效果，无需通过视频总播放量反推。
2. 溢出指标包含：播放、点赞、收藏、评论、视频号关注、公众号/服务号关注、分享。
3. 官方口径为：加热开始后 72 小时内，由高溢出人群带来的自然增量。
4. 已静态确认 5 个核心 RPC：
   - `searchFeedPromotionOrderList`
   - `getFeedPromotionOrderOverview`
   - `getFeedPromotionOrdersTsIndicator`
   - `getFeedPromotionOrderDetail`
   - `getFeedPromotionOrderIndicatorDetail`
5. 时序接口支持 10 分钟、1 小时、1 天粒度。
6. 自然流量杠杆率可准确计算为 `自然溢出播放 / 加热播放`。

### 已知边界

- 自然溢出只对加热者自己的视频展示；
- 主要对应“智能加热/播放”类目标，其他目标需逐类验证；
- 当前仅完成静态接口结构确认，尚未取得这 5 个 RPC 的脱敏真实响应样例。

### 下一步实数验证

使用一笔自投的智能加热/播放订单作为主样本，并补充点赞、关注目标各一笔作为对照：

1. 请求订单列表，核对订单 ID、视频 ID、目标、状态和分页；
2. 请求批量累计效果，判断聚合层级是订单还是视频；
3. 分别请求 10 分钟、1 小时、1 天时序，核对时间桶、时区和累计/增量口径；
4. 请求单订单详情，映射全部付费指标和 7 个溢出指标原始字段；
5. 请求深度指标，确认画像分桶、观看时长单位和互动时点定义；
6. 对比页面显示值，确保接口值、单位和累计窗口一致；
7. 只保存脱敏样例，不保存 Cookie、Token、签名或完整请求头。
