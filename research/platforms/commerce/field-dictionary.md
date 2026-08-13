# commerce 端 · 字段字典

> compass 数据接口加密,但经 **JSON.parse hook** 可拿明文(见 [../../architecture.md](../../architecture.md) §4.7)。本字典记录已解密的短视频明细字段。
> 达人主页 `mmeckolbasenode`(明文)接口字段未展开(优先级低,需要时从 `data/raw-private/commerce-feed2/` 取)。

## 一、短视频明细 -- compass `liner_query/1/feed-feedlist-shopfinder-realtime`(已解密)

> 接口响应加密 `__payload__`，经 JSON.parse hook 解密。响应样本不进入公开仓库。匿名测试中 `list` 每页 10 条。

| 字段路径 | 类型 | 语义 | 对应 Doc1 | 可信度 |
|---|---|---|---|---|
| `export_id` | str | 视频跨端主键(`export/UzFfBg...`,**与 creator `exportId` 同格式,跨端验证通过**) | T-02 | 高 |
| `feedid_` | str | 数字 feed ID | - | 高 |
| `create_time` | int | 发布时间(unix) | T-03 | 高 |
| `videoInfo.description` | str | 视频标题/描述 | T-04 | 高 |
| `videoInfo.cover_url` / `thumb_url` | str | 封面/缩略图 | - | 高 |
| `read` | int | 播放量(实时) | T-05 | 高 |
| `like` | int | 点赞 | T-06 | 高 |
| `comment` | int | 评论 | T-08 | 高 |
| `forward` | int | 转发 | T-09 | 高 |
| `fav` | int | 收藏 | - | 高 |
| `follow` | int | 关注增量 | T-10 | 高 |
| `full_watch_radio` | float | 完播率 | T-11 | 高 |
| `average_watch_time` | float | 平均观看时长(秒) | T-12 | 高 |
| `pay_gmv_per_1k_watch_pv` | float/null | 千次观看成交金额(GPM) | M-14 gpm_per_1k_views | 中(部分视频为 null) |

> **注意:** 这是 `realtime`(实时)feed 列表,以互动+完播+GPM 为主。**完整 GMV/订单/退款(M-06~M-11)可能在单视频详情页**(页面有详情链接,待探索)。请求体也是加密 `__payload__`,分页/日期参数需解密请求体或观察 hook 明文获取。

## 二、其他已解密接口(明文片段)

| 接口 | 解密后顶层 | 用途 |
|---|---|---|
| `common/getLoginAccountList` | `{code, talentList, finderList, ecStoreInfoList}` | 登录账号/视频号/店铺列表 |
| `common/getMenu` | `{code, menu[]}` | 罗盘菜单(含页面路由) |
| `common/liner_query/1/feedback-dialog-config` | `{code, metaConfig, config}` | 反馈弹窗配置 |

## 三、达人主页 `mmeckolbasenode`(明文,未展开)

入 `/talent/home`,明文。已抓 488 body(见 [api-catalog.md](api-catalog.md) §A)。关键接口:`base/getBaseInfo`、`base/getWindowTop3ProductList`(橱窗 Top3)、`base/getBindChannelList`(绑定渠道,含视频号)、`base/getTalentLevel`。字段需要时再展开。
