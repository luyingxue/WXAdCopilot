# 字段字典 · 视频号加热平台 (promote)

> 本文件锁定视频号加热平台 (`promote`) 的核心业务字段定义、类型与 P0 可用性评估。

## 一、订单与加热核心字段

| 规范字段 | 平台原始字段 | 数据类型 | 语义推断 | 单位 | 示例值 | P0 对齐 |
|---|---|---|---|---|---|---|
| `campaign_id` | `orderId` / `order_id` | String | 投放订单全局唯一标识 | 无 | `<timestamp>_<sequence>` | **P0-02** |
| `video_fk` | `exportId` / `export_id` | String | 被加热视频的跨端全局主键 | 无 | `export/UzFfBgAA...` | **P0-01** |
| `campaign_status` | `status` | Enum / Int | 订单状态 (待审核/审核未通过/投放中/已完成) | 枚举 | `AUDIT_REJECT` / `RUNNING` | **P0-02** |
| `total_budget_beans` | `totalBeans` | Integer | 订单微信豆总预算 | 微信豆 | `100` / `500` | **P0-03** |
| `consumed_beans` | `consumedBeans` | Integer | 当前累计已消耗微信豆 | 微信豆 | `0` / `120` | **P0-03** |
| `consumed_amount` | `consumedAmount` | Float / Cent | 当前累计实际消耗金额 | 元/分 | `0.00` / `12.00` | **P0-03** |
| `paid_views` | `playCnt` / `paidViews` | Integer | 订单带来的付费/加热播放数 | 次 | `1667` | **P0-04** |
| `paid_likes` | `likeCnt` | Integer | 订单带来的互动点赞数 | 次 | `45` | **P0-04** |
| `paid_comments` | `commentCnt` | Integer | 订单带来的评论数 | 次 | `12` | **P0-04** |
| `paid_followers` | `followCnt` | Integer | 订单带来的关注数 | 人 | `8` | **P0-04** |
| `product_clicks` | `productClickCnt` | Integer | 加热期间引流的商品点击数 | 次 | `25` | **P0-05** |
| `objective` | `targetType` | Enum | 优先提升目标 (智能加热/点赞/关注/播放) | 枚举 | `SMART` / `PLAY` | 基础配置 |
| `creator_account` | `builderFinderUsername` | String | 订单创建人/运营账号 | 无 | `vic` | 基础配置 |
| `create_time` | `createTime` | Timestamp | 订单创建时间戳 | 秒级 | `1722787200` | 基础配置 |

## 二、自然流量溢出指标（静态结构已确认，真实字段待映射）

官方口径：自然流量溢出是**加热开始后 72 小时内，由高溢出人群带来的自然增量**。
平台直接提供溢出指标，无需使用视频总播放量减去加热播放量反推。

| 规范字段 | 平台原始字段 | 语义 | 单位 | 验证状态 |
|---|---|---|---|---|
| `overflow_views` | 待实数响应确认 | 溢出播放 | 次 | 静态确认 |
| `overflow_likes` | 待实数响应确认 | 溢出点赞 | 次 | 静态确认 |
| `overflow_favorites` | 待实数响应确认 | 溢出收藏 | 次 | 静态确认 |
| `overflow_comments` | 待实数响应确认 | 溢出评论 | 次 | 静态确认 |
| `overflow_channel_follows` | 待实数响应确认 | 溢出视频号关注 | 人 | 静态确认 |
| `overflow_official_account_follows` | 待实数响应确认 | 溢出公众号/服务号关注 | 人 | 静态确认 |
| `overflow_shares` | 待实数响应确认 | 溢出分享 | 次 | 静态确认 |

自然流量杠杆率应直接使用平台归因字段计算：

```text
overflow_leverage = overflow_views / paid_views
```

其中 `paid_views` 为加热播放，`overflow_views` 为平台归因的自然溢出播放。需要显式
处理 `paid_views = 0`：此时杠杆率记为 `null`，不能记为 0 或无穷大。

已知限制：

- 自然流量溢出只对加热者自己的作品展示；
- 页面逻辑显示该能力主要对应“智能加热/播放”类目标；
- 点赞、关注等其他投放目标是否返回溢出字段，需按目标逐类实测；
- 72 小时是归因窗口，不应在窗口尚未结束时把当前累计值当成最终效果。

---

## 三、P0 可用性评估

- **P0-01 (视频唯一标识)**: 可生产使用 (`exportId` 完美对应)
- **P0-02 (订单唯一标识)**: 可生产使用 (`orderId` 全局唯一)
- **P0-03 (实际消耗)**: 可生产使用 (`consumedAmount` / `consumedBeans`)
- **P0-04 (付费结果)**: 可生产使用 (`playCnt` / `likeCnt` / `followCnt`)
- **自然流量溢出**: 静态结构已确认，真实订单字段名、单位和累计口径待验证
