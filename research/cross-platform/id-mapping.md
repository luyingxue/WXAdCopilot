# 跨端 ID 映射

> Doc1 §2.2 / Doc2 §9 的核心命题:三端数据能否关联到同一条视频。本文件记录已验证的跨端主键。

## 一、视频主键 -- `exportId` / `export_id`(已验证跨端一致)

| 端 | 接口 | 字段 | 值格式 | 验证状态 |
|---|---|---|---|---|
| creator | `post/post_list`(内容管理,累计) | `exportId` | `export/UzFfBgAAxMij...` | ✅ 已核 |
| creator | `statistic/post_list`(数据中心,日期范围) | `exportId` | `export/UzFfBg...` | ✅ 已核(与上同格式) |
| commerce | `liner_query/1/feed-feedlist-shopfinder-realtime`(短视频明细,compass 解密后) | `export_id` | `export/UzFfBgAAxMijKC5UAw2FjMzT4DCatKpeWKrz86MjcTM40ffJUQ` | ✅ **与 creator 同格式,跨端验证通过** |
| promote | `order/get_order_list` (订单列表) / `stat/get_stat_list` | `exportId` / `export_id` | `export/UzFfBg...` | ✅ **与 creator / commerce 同格式,三端验证通过** |

**结论:** `exportId`/`export_id` 是 creator ↔ commerce ↔ promote **三端完全一致的跨端视频主键(直接相等)**。**Doc1 P0-01(视频唯一标识)三端跨端可用性完全确认。**

## 二、次级 / 辅助 ID(不跨端混用)

| ID | 端 | 字段 | 备注 |
|---|---|---|---|
| `objectId` | creator 内容管理 | `objectId` | 格式 `export/UzFfBg...`(与 exportId 同值) |
| `objectId` | creator statistic/post_list | `objectId` | **纯数字**(格式不同!)-- 不可与内容管理 objectId 混用 |
| `feedid_` / `feedId` | commerce(解密) | `feedid_` | 纯数字 feed ID,commerce 内部用;creator 无此字段 |
| `orderId` | promote 加热平台 | `orderId` | 格式 `<timestamp>_<sequence>`（消耗端唯一订单主键，对应 P0-02） |
| `objectNonce` | creator | `objectNonce` | 纯数字 nonce,单端 |
| `productId` | creator `desc.product.productId` | `productId` | `<product-id>`；commerce 端对应字段待解密详情确认 |
| `shopInfo.appid` | creator/commerce | `shopInfo.appid` / 达人 `appid` | 店铺/达人 appid |

## 三、跨端映射总结

| 维度 | creator 字段 | commerce 字段 | promote 字段 | 映射方式 | 状态 |
|---|---|---|---|---|---|
| 视频 | `exportId` | `export_id` | `exportId` / `export_id` | 直接相等 | ✅ **三端全验证** |
| 视频 -> 成交 | `exportId` + 日期 | commerce feed list `export_id` + `pay_gmv_per_1k_watch_pv` / 详情 GMV | - | exportId 关联 | ✅ 已验证 |
| 视频 -> 投放 | `exportId` | - | promote `orderId` + `exportId` | exportId 关联 | ✅ **已验证** |
| 投放 -> 消耗/效果 | - | - | promote `orderId` + `consumedBeans` + `playCnt` | orderId 关联 | ✅ **已验证** |

## 四、关系图(更新)

```text
Account (creator finderUsername ≈ commerce talentList/finderList ≈ promote builderFinderUsername)
  └── Video (exportId)  ──[三端跨端主键,已验证]──  commerce feed (export_id) ── promote video (exportId)
        ├── creator: 累计统计(post_list) + 日期范围统计(statistic/post_list) + 流量来源(new_post_total_data)
        ├── commerce: 实时互动+完播+GPM(feed list 解密) + 完整成交(cargo/transcation 35 指标解密)
        └── promote: 投放订单(orderId) + 消耗(consumedBeans/amount) + 付费结果(playCnt/likeCnt/followCnt)
```
