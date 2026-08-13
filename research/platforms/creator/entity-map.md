# 视频号助手(creator)· 实体与 ID 映射

## 一、识别到的实体

| 实体 | 来源接口 | 主键候选 | 备注 |
|---|---|---|---|
| 账号(Account) | `auth_data` | `finderUser.finderUsername` / `finderUser.uniqId` | 请求侧另有 `_log_finder_uin` / `_log_finder_id` |
| 视频(Video/Post) | `post_list` | `exportId` ≡ `objectId`;次级 `objectNonce` | 值形如 `export/UzFfBg...` |
| 商品(Product) | `post_list.desc.product` | `desc.product.productId` ≡ `desc.component.id` | 值形如 `<product-id>` |
| 店铺(Shop) | `get_finder_ec_info...` | `shopInfo.appid` | 微信小店 appid |
| 达人(Talent) | `mp_finder_window_init` | `talentItem.talentAppid` | 带货达人 appid |
| 数据快照(Snapshot) | 本地派生 | `snapshot_time` = 本地采集时刻 | 接口不返回服务端时间 |
| 合集(Collection) | `get_collection_list` | (本账号为空) | - |

## 二、视频 ID 候选(优先级)

1. **`exportId` / `objectId`**(主):值相同,`export/UzFfBg...` 前缀。命中 Doc2 §5 `export_id` 候选。**推荐作为跨端关联主键。**
2. `objectNonce`:纯数字 nonce,单端稳定,跨端是否一致待 commerce/promote 验证。
3. 请求侧 `rawKeyBuff` / 响应 `lastBuff`:分页游标,非视频 ID,勿混用。

## 三、账号 ID 候选

| 候选 | 出现位置 | 形态 | 备注 |
|---|---|---|---|
| `finderUser.finderUsername` | auth_data 响应 | `v2_060000231003b20f...` | 视频号 username,稳定 |
| `finderUser.uniqId` | auth_data 响应 | `sphw3VWvu6TgUUj` | 短 ID |
| `_log_finder_uin` | 各接口请求体 | 数字 | 请求侧账号 uin |
| `_log_finder_id` | 各接口请求体 | 数字 | 请求侧 finder id |
| `proxyUid` / `txvideoOpenId` | auth_data | 长串 | 辅助 |

> **待核对:** `finderUsername` 与 `_log_finder_uin/_log_finder_id` 的对应关系(响应侧 vs 请求侧),需抓请求体值确认。

## 四、本端(creator)内部关系

```text
Account (finderUsername)
  └── 1:N ── Video (exportId)            [post_list.data.list[]]
                ├── 1:N ── Product (productId)   [desc.product, 挂车时]
                └── 1:N ── Snapshot              [本地按 snapshot_time 多次采集]
Account ─── 1:1 ── Shop (shopInfo.appid)   [get_finder_ec_info]
Account ─── 1:N ── FansSnapshot            [fans_trend, 时段聚合, 非单视频]
```

## 五、跨端映射假设(待 commerce / promote 验证)

| 本端字段 | 假设对应端 | 目标字段候选 | 映射方式 | 可信度 |
|---|---|---|---|---|
| `exportId`(视频) | commerce(带货短视频明细) | `video_fk` / `export_id` / `object_id` | 直接相等? | 低(待验证) |
| `exportId`(视频) | promote(加热订单) | 被加热视频 ID | 直接相等? | 低(待验证) |
| `productId`(商品) | commerce | `product_id`/`spu_id` | 直接相等? | 低(待验证) |
| `shopInfo.appid`(店铺) | commerce | `shop_id` | 直接相等? | 低(待验证) |

> 跨端验证计划:选 3-5 条视频(Doc1 §2.2 / Doc2 §9),取其 `exportId`,在 commerce 与 promote 端搜索,核对是否能命中同一条视频。

## 六、关系约束(承接 Doc1 §2.3)

- 一个账号 -> 多条视频(`totalCount=1082`)。
- 一条视频 -> 0 或 1 个挂车商品(`desc.product` 可空)。
- 一条视频 -> 多个时间点快照(周期采集 `post_list`)。
- 视频与店铺通过账号间接关联(非视频直挂店铺)。
