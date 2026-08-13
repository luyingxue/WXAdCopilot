# 视频号助手(creator)· 页面地图

## 页面:内容管理 / 视频列表(动态管理)

- **平台:** creator(`channels.weixin.qq.com`)
- **URL:** `https://channels.weixin.qq.com/platform/post/list`
- **入口路径:** 登录后首页 -> 左侧「内容管理」-> 动态管理 / 视频列表
- **页面用途:** 管理账号已发布视频/动态,展示每条视频的累计互动数据与关联商品
- **可见数据:** 缩略图、标题/描述、发布时间、时长、播放量、点赞、评论、转发、收藏、关注增量、完播率、平均观看时长、关联商品
- **日期范围:** 无(页面 UI 不提供日期范围筛选)
- **筛选 / 排序:** 页面 UI 无显式排序/筛选入口;但接口层支持 `stickyOrder`、`timestamp`、`currentPage/pageSize`
- **分页:** 页码 + 游标双轨。请求 `pageSize/currentPage/rawKeyBuff`;响应 `totalCount`、`lastBuff`、`continueFlag`
- **详情入口:** 无独立详情页。更细的单视频数据(流量来源拆分、完播率口径)需进入「数据中心 - 视频数据分析」
- **导出能力:** 本页未见明显导出按钮(待确认)
- **触发的主要接口:**
  - `POST /micro/content/cgi-bin/mmfinderassistant-bin/post/post_list` -- 核心,视频列表
  - `POST /cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data` -- 账号级时段聚合统计
  - `POST /cgi-bin/mmfinderassistant-bin/auth/auth_data` -- 账号/认证信息
  - `POST /cgi-bin/mmfinderassistant-bin/statistic/fans_trend` -- 关注者趋势
  - `POST /cgi-bin/mmfinderassistant-bin/shop/get_finder_ec_info_for_opening_page` -- 店铺/橱窗信息
  - `POST /cgi-bin/mmfinderassistant-bin/notification/notification_list` -- 通知
  - `GET /micro/{content|live|eccommerce}/mf-manifest.json` -- wujie 微前端清单
- **备注:**
  - 页面采用 **wujie(无界)微前端**,视频列表由 `/micro/content/` 微应用在 `<iframe data-wujie-flag name="content">` 内渲染。
  - 首屏数据经 XHR(`post_list`)获取,非 SSR;`window.microConfig` 注册各微应用模块。
  - 前 1-2 条最新视频的互动计数可能为 0(发布过新,尚未产生统计)。
  - 外层 `page.content()` 只含微前端壳与 `microConfig`,**不含视频数据**;抓数据必须走接口或进 iframe frame。

## 页面:数据中心 / 视频数据分析

- **平台:** creator
- **URL:** `https://channels.weixin.qq.com/platform/statistic/post`
- **入口路径:** 左侧「数据中心」-> 视频数据分析
- **页面用途:** 账号级时段统计、流量来源拆分、商品成交统计
- **可见数据:** 多 tab + 日期筛选(近7天/近30天等);账号互动按来源拆分、总粉丝、商品曝光/点击/订单/GMV
- **日期范围:** 有(startTs/endTs/interval)
- **筛选 / 排序:** tab 切换、日期范围
- **分页:** 无(聚合数据)
- **详情入口:** 单视频级流量来源/完播率分布**未在默认 tab 发现**,可能需点进单视频(待探索)
- **触发的主要接口:**
  - `POST /micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data` -- 账号级统计 + 流量来源 tabType 拆分
  - `POST /cgi-bin/mmfinderassistant-bin/statistic/get-finder-total-statics` -- 总粉丝
  - `POST /cgi-bin/mmfinderassistant-bin/statistic/get-product-statics` -- 单商品成交
- **备注:**
  - wujie 微应用 `finder-helper-statistic` 在 iframe(name="statistic")内渲染。
  - **抓取陷阱:** 首次进入/reload 时 24+JS 高并发涌入,CDP 响应缓冲被挤爆,`response.body()` 报 `No resource with given identifier found`。**解决:JS 缓存后再 reload 一次**(或启用 HAR 录制)。VPS 采集脚本需内建此容错。

## 页面:单视频详情(postDetail)

- **平台:** creator
- **URL:** `https://channels.weixin.qq.com/platform/statistic/postDetail?isImageMode=0`(需指定视频,通常由单篇视频列表点入)
- **页面用途:** 单条视频的明细分析(流量来源、流失率等)
- **触发的主要接口:**
  - `POST /micro/statistic/.../statistic/feed_aggreagate_data_by_tab_type` -- 参数 `feedId, startTs, endTs, interval`;单视频按流量来源(tabType)拆分(单视频级 T-14)
  - `POST /micro/statistic/.../statistic/get_feed_lost_rate` -- 参数 `feedId`;单视频流失率
- **备注:** body 未稳定捕获(接口在首屏加载时发、SNAP 后难重触发)。接口与参数已确认,字段结构待补。详见 [api-catalog.md](api-catalog.md) §9.5。

## 页面:带货数据(cargo/transcation,电商罗盘 compass)

- **平台:** creator(但用独立电商罗盘 compass 后端)
- **URL:** `https://channels.weixin.qq.com/platform/statistic/cargo/transcation`
- **入口路径:** 数据中心 -> 带货数据;tab:成交分析 / 商品明细
- **页面用途:** 带货成交分析、商品明细(GMV/订单/退款等)
- **触发的主要接口(域名 `channels.weixin.qq.com/shop-faas/mmecnodecompasscommon/`):**
  - `transaction-v2/getChart` -- 成交分析图表
  - `common/liner_query/compass/transaction` -- 成交/商品明细主数据
  - `common/getMenu`、`getIndustry`、`getLoginAccountList`、`account-info` -- 罗盘菜单/账号/行业
- **⚠️ 重大障碍:** **所有 compass 接口响应均为加密 `__payload__`(hex 密文)**,请求体也加密。非 gzip/deflate,疑似 AES/自定义,需 JS 中的密钥。微应用从 `static.wxqcloud.qq.com.cn/mmecnodecompassnodeall/` 加载。详见 [exploration-log.md](../../exploration-log.md) 带货数据页小节。解密方案待定(JS hook / 反编译)。

## 待探索页面(creator 端)

- 单视频详情 postDetail 的 body(从单篇视频列表点入 + SNAP 后触发)
- compass 加密解密(攻坚)
- 数据中心 -> 关注者增长按视频维度(`fans_trend` 已覆盖账号级)
- 数据中心 -> 账号整体趋势
