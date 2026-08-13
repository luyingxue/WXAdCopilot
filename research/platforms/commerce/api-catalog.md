# commerce 端(微信小店/电商罗盘)· 接口目录

> 域名 `store.weixin.qq.com`。两套后端:**`mmeckolbasenode`(明文)** 与 **`mmecnodecompasscommon`(加密)**。
> 明文接口顶层结构一般为业务 JSON;加密接口顶层为 `{"__payload__": "<hex密文>"}`,请求体也是 `__payload__`。
> 采集纪律同 creator:浏览器拦截、SNAP workaround(compass 微应用页 body 仍需 SNAP 后触发)。

---

## A. 达人主页接口(`shop-faas/mmeckolbasenode/*`,明文,已抓到 body)

> 入口 `/talent/home`,talent 扫码登录。这些是账号/橱窗/商品元数据,**明文可读**。

| 接口(POST/GET) | 用途 | body |
|---|---|---|
| `base/getBaseInfo` | 达人基础信息 | 1475B |
| `base/getTalentAccount` | 达人账号 | 712B |
| `base/getTalentLevel` | 达人等级 | 581B |
| `base/getBindChannelList` | 绑定渠道(含视频号?) | 533B |
| `base/selectTimeData` | 时间维度选项 | 616B |
| `base/getMsgInfo` | 消息信息 | 595B |
| `base/getWindowTop3ProductList` | 橱窗 Top3 商品 | 6439B |
| `base/checkAndGetTalentEstablishContactInfo` | 联系信息 | 54B |
| `manage/member/getTalentList` | 达人列表 | 1421B |
| `msg/api/getPlatformKfUnreadNum` | 客服未读数 | 33B |
| `invoice/commission/getRedDot` | 佣金红点 | 39B |
| `upgrade/getTalentHistoricalAssets` | 历史资产 | 10B |
| `open-api/getTalentOpenApiAccountInfo` | 开放平台账号 | 78B |
| `partner/api/batchGetExpireInfo` | 到期信息 | 73B |
| `finder/checkLiveStatus` | 直播状态 | 28B |
| `report/commonReport` | 通用上报 | 131B |
| `attract/getTalentRedDotInfo` | 招商红点 | 28B |
| `mmchannelstradedeposit/kol/cgi/getDepositState` | 押金状态 | 615B |
| `mmchannelstradeec/talentkf/cgi/isUpgradeEcKf` | 升级企微客服 | 45B |
| `talent/ssr/getConfigData`(GET) | SSR 配置 | 3544B |

> 这些明文接口的字段结构尚未逐个展开(优先级低;主力成交数据在 compass 加密端)。需要时可从 `data/raw-private/commerce-feed2/` 取 body 细化。

## B. 电商罗盘 compass 接口(`shop-faas/mmecnodecompasscommon/*`,加密)

> 入口 `/compass/feed/list` 等,compass 独立扫码登录。**所有数据接口响应加密 `__payload__`**。与 creator `cargo/transcation` 是**同一套加密**(密文前缀 `1f7a3670...` 一致)。

| 接口(POST) | 用途 | 加密 | body |
|---|---|---|---|
| `login/getLoginQrCode`(GET) | 登录二维码 | **明文** | 65806B |
| `login/queryLoginQrCode` | 轮询登录态 | **明文** | 61B |
| `common/getLoginAccountList` | 登录账号列表 | 加密 | 2290B |
| `common/getAccountListV2` | 账号列表 v2 | 加密 | - |
| `common/account-info` | 账号信息 | 加密 | 690B |
| `common/getMenu` | 罗盘菜单 | 加密 | 20914B |
| `common/liner_query/1/feed-feedlist-shopfinder-realtime` | **短视频明细列表(核心,M 系列)** | 加密 | 35890B |
| `common/liner_query/1/feedback-dialog-config` | 反馈弹窗配置 | 加密 | 2514B |
| `home-v2/getFeedData` | 首页 feed 汇总 | 加密 | 1138B |
| `home-v2/getLiveData` | 首页直播数据 | 加密 | 3026B |
| `promoter/dsrUpdateTime` | DSR 更新时间 | 加密 | 146B |
| `rp/mm`、`common/rp/wcb` | 上报辅助 | 加密 | 50-82B |
| `cube.weixinbridge.com/cube/report/reportbizdata` | 埋点 | - | 58B |

> **核心阻塞:** `liner_query/1/feed-feedlist-shopfinder-realtime`(短视频明细)即 P0-05 单视频成交归因的数据源,但加密。**跨端 exportId 验证也在此**(需读 feed/list 的视频 ID 与 creator `exportId` 对比),被加密阻塞。

## C. compass 加密解密方案(待攻坚,解锁 commerce + creator cargo)

密文特征:hex 字符串,解码后二进制,非 gzip/deflate/zlib,疑似 AES/自定义。**creator cargo 与 commerce compass 密文前缀一致(`1f7a3670...`),同一套加密,解一处通吃。**

1. **JS hook(推荐):** `context.add_init_script` 注入,在 compass JS 解密后、`JSON.parse` 前拦截明文。compass JS 从 `static.wxqcloud.qq.com.cn/mmecnodecompassnodeall/` 加载,在 iframe 内。需验证:① `add_init_script` 能否注入到该 iframe;② compass JS 是否经 `JSON.parse` 解析明文。若可行,则 hook `JSON.parse` 过滤大对象即可拿到明文成交数据。
2. **反编译 compass JS** 找密钥+算法(`mmecnodecompassnodeall` bundle),离线解密 `__payload__`。
3. **DOM 抓取:** compass 页解密后渲染表格,SNAP 抓 DOM 明文(脆,但可救急)。

> 解密前:**P0-05(单视频成交归因)、跨端 exportId 验证**均阻塞。creator 端 `get-product-statics`(明文,商品级 GMV)可作临时替代。

## D. compass 加密已破解 + 短视频明细详情接口(2026-07-23 攻坚)

**加密已破解:** JSON.parse hook 绕过(见 [../../architecture.md](../../architecture.md) §4.7)。已成功解密 feed/list 短视频明细(含 `export_id` 跨端主键 + GPM + 互动 + 完播 + 观看时长,见 [field-dictionary.md](field-dictionary.md) §一)。

**单视频详情页接口（2026-07-26 已实测）:** 正确详情地址为
`/compass/feed/detail?id=<URL编码的exportId>&bizId=<店铺bizId>`。
旧写法 `?export_id=...` 会进入空详情并报加载失败，不能使用。正确地址已用
“低处飞行”视频实测，页面稳定返回视频指标、商品数据与转化漏斗。

详情页触发:
| 接口 | 用途 | body 状态 |
|---|---|---|
| `common/liner_query/1/feeddetail-overview-shopfinder-offline` | 详情概览(GMV/订单/退款预估在此) | 加密,待 hook 捕获 |
| `feed/getFeedDetailInfo` | 详情信息 | 加密,待 hook 捕获 |
| `common/liner_query/1/feeddetail-channel-shopfinder-offline` | 分渠道明细 | 加密,待 hook 捕获 |
| `common/liner_query/1/feed-productinfo-shopfinder` | 商品信息(商品级成交) | 加密,待 hook 捕获 |

**详情数据未捕获的原因(给 coding agent):** compass **session 短**(数分钟),NAV 到详情页易触发重新登录(跳 `/compass/login`),`window.__captured__` 随页面重定向被重置,JSON.parse hook 捕到的详情明文丢失。**解决:**
1. 登录后**尽快** NAV 到详情页(用完整 URL 编码的 `export_id`,勿截断)。
2. 详情接口 fire + 解密后**立即 CAPTURE**(在 session 过期/重定向前)。
3. 或:把 hook 改为**即时落盘**(每捕到明文立即 `fetch` 回传或写 localStorage),不依赖事后 CAPTURE(避免重置丢失)。
4. 或:用 EVAL 信号在详情页 frame 内直接 `fetch` 详情接口 + 本地解密(需 hook 解密函数)。

> **跨端 exportId 已验证:** commerce 列表的 `export_id` 直接作为详情页
> `id` 参数，与 creator `exportId` 同值。详情页还必须带当前店铺 `bizId`。
