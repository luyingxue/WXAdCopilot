# 架构与操作手册 · WXAdCopilot 第一阶段

> 本文件承载技术栈、部署架构、采集脚本用法与操作陷阱。**项目级单一事实来源**(不依赖会话记忆)。
> 探索产出见 [exploration-log.md](exploration-log.md) 与 [platforms/](platforms/)。

## 1. 技术栈(已定)

- **语言:** Python(用户决策:项目核心是量化分析,pandas/numpy/scipy 生态决定性;VPS 部署 Python Playwright 是标准操作)。
- **浏览器自动化:** Playwright **自带 Chromium**(`playwright install chromium`),**不用系统 Chrome**(VPS 可移植)。
- **数据处理:** pandas(字段字典/差距分析);后续 pydantic(API schema 校验,当字段字典单一事实来源)。
- **存储:** SQLite(单文件、VPS 友好,存时间序列快照 + 三端映射表 + 派生指标)。
- **环境:** venv 在项目 `.venv/`(`requirements.txt` 锁定)。

## 2. 部署目标

- 后续部署到 **Linux VPS 长跑持续监控**。
- 脚本从第一天带 `--headless` 开关:探索期 Mac 有头(扫码/接管)、VPS 无头,复用同一份代码。
- **登录态:** `launchPersistentContext` + profile 目录 `~/.wxadcopilot/browser-profiles/operator-01/`(项目外、gitignore)。VPS 需内建"二维码截图推送重认证"流程(session 过期时)。
- 采集纪律:只读、限频、指数退避、错误熔断、结构变更即停转人工(Doc1 §8)。

## 3. 采集器 `scripts/explore.py`

有头/无头 Playwright 持久化会话,监听所有 XHR/Fetch 响应,原始 body 落 `data/raw-private/<session>/`(gitignore),脱敏元数据写 `manifest.jsonl`。通过**信号文件**远程驱动(便于 VPS/调度):

| 信号文件 | 作用 |
|---|---|
| `STOP` | 优雅关闭浏览器、flush 清单 |
| `SNAP` | 抓所有页面 + 所有 frame 的渲染后 DOM(**含 wujie 微前端 iframe**) |
| `NAV` | 内容为 URL,导航到该 URL |
| `RELOAD` | 刷新当前页 |
| `CLICK` | 内容为文字,遍历所有 frame 点击首个匹配(驱动 tab 切换) |

用法:
```bash
.venv/bin/python scripts/explore.py --platform creator               # 探索期,有头
.venv/bin/python scripts/explore.py --platform commerce --headless   # VPS,无头
```

## 4. 操作陷阱(实测,必读)

### 4.1 wujie(无界)微前端
视频号助手(`channels.weixin.qq.com`)用 wujie,各业务模块是独立微应用在 `<iframe data-wujie-flag>` 内渲染。
- `page.content()` 只拿到外层壳,**不含业务数据**;数据走 XHR(如 `post_list`),非 SSR。
- 抓数据必须走接口,或抓 iframe frame 的 DOM(SNAP 已遍历 frame)。

### 4.2 直接导航不触发数据接口
直接 `goto(/platform/xxx)` 常只加载外壳、不 bootstrap 微应用、不发数据 XHR。**需 RELOAD 一次**(有时两次)才拉起微应用并发出数据接口。

### 4.3 body 抓取失败 + SNAP workaround(最关键)
微应用页 `response.body()` 普遍报 `Network.getResponseBody: No resource with given identifier found` -- CDP 响应缓冲被微应用的 JS 突发(fetch 加载大 JS)挤爆,数据接口响应被淘汰。
- **任何请求拦截都会卡死微应用启动,不可用:** `ctx.route`+`route.fetch()`、CDP `Fetch.enable`、CDP `Network.enable` 改缓冲 -- 实测均导致微应用不 bootstrap。
- `record_har` 在 `launch_persistent_context`(Playwright 1.61)不支持。
- **可靠解法:驱动交互前先 SNAP 一次(`page.content()`)。** SNAP 会同步 CDP 缓冲,之后所有响应 body 稳定可读(creator-stat8 实测 SNAP 后 100% 成功)。
- **VPS 采集脚本标准流程:** NAV/RELOAD 拉起微应用 → SNAP → 再 NAV/RELOAD/CLICK 触发目标接口 → 抓 body。

### 4.4 标题不可作主键
账号反复用相同 hashtag 作标题(如「#老年人#生活#情感#社会现象」多条不同日期)。**跨端/跨接口映射必须用 `exportId` + `createTime`**,不能用标题(Doc1 §2.2)。

### 4.5 exportId 是可靠跨端主键
- 内容管理 `post/post_list` 与 `statistic/post_list` 的 `exportId` 同为 `export/UzFfBg...` 格式。
- `objectId` 格式却不同(内容管理=`export/...`,statistic=纯数字),**不可跨接口混用**。
- 跨 commerce/promote 的一致性待验证(Doc1 §2.2 选 3-5 条)。

### 4.6 脱敏
原始响应（含真实 ID）只存放在已被 gitignore 的 `data/raw-private/`，不进入公开仓库。不保存 Cookie、Token、签名或完整请求头；公开文档只记录字段名和匿名占位值。

### 4.7 compass 加密解法(JSON.parse hook,已验证可行)

电商罗盘 compass 后端(`shop-faas/mmecnodecompasscommon/*`,用于 creator `cargo/transcation` 与 commerce `compass/feed/list` 等)的所有数据接口响应为加密 `__payload__`(hex,AES/RSA,Forge 库)。**离线解密需密钥(高成本),但可用 JS hook 绕过:**

- **方案(已验证):** `context.add_init_script` 注入脚本,hook `JSON.parse`,捕获解密后的大对象(>800B)。compass JS 解密 `__payload__` 后会 `JSON.parse` 明文字符串,故 hook 能拿到明文。`add_init_script` 经 CDP `addScriptToEvaluateOnNewDocument` 注入,**对所有 frame(含 compass iframe)生效**。
- **取回:** `CAPTURE` 信号 -> 遍历 `page.frames`,`frame.evaluate("() => window.__captured__")` 取回各 frame 的明文数组,落 `captured-*.json`。
- **流程:** NAV 到 compass 页(需 compass 独立登录)-> 等数据加载+解密 -> CAPTURE 取明文。**不要 RELOAD**(compass session 短,RELOAD 易触发重新登录)。
- **采集纪律:** 同样过滤 crypto 库噪声(`aes-128-ecb`/`modp1`/`sha224WithRSAEncryption` 等算法表)与 `__payload__` wrapper;真正的解密数据是带业务字段(`export_id`/`gmv`/`list` 等)的对象。
- **已确认:** 此法拿到 commerce 短视频明细明文,含 `export_id`(与 creator `exportId` 同格式,跨端主键验证通过)。**同一 hook 也可解 creator cargo 页**。
- **2026-07-23 验证通吃:** 同一 JSON.parse hook 已成功解密 **creator cargo**(`cargo/transcation`)成交数据(`pay_gmv`/`pay_order_cnt`/`refund_gmv`/`product_click_cnt` + 35 指标 + 场景/新老客/粉丝拆分 + 佣金)。**creator cargo 与 commerce compass 同套加密,hook 通吃。**
- **compass 页稳定性(重要):** compass 微应用页 **RELOAD 会崩页(Target crashed)、SNAP(`page.content()`)也崩**。且 **localStorage hook 会致崩**(sandbox iframe 写 localStorage)。故:① hook 用**轻量版**(仅 `window.__captured__`,不写 localStorage);② 流程 **NAV -> RELOAD(仅一次,bootstrap)-> 等 -> CAPTURE**,**不 SNAP、不二次 RELOAD**;③ CAPTURE 读 `window.__captured__`(页面未崩时有效)。
- 实现见 `scripts/explore.py` 的 `INIT_SCRIPT`(轻量版)与 `CAPTURE` 信号。

## 5. 进度与 P0 状态

- ✅ creator 内容管理 post_list(口径已核对,18 视频×5 字段=90 项 0 矛盾)
- ✅ creator 数据中心(new_post_total_data 流量来源 T-14、statistic/post_list 单视频完播率/观看时长)
- ⬜ commerce(单视频成交归因 + 跨端 exportId 验证)
- ⬜ promote(投放订单/消耗/付费结果)
- ⬜ 跨端映射与差距分析

P0 详见 [platforms/creator/field-dictionary.md](platforms/creator/field-dictionary.md) 与 [exploration-log.md](exploration-log.md)。
