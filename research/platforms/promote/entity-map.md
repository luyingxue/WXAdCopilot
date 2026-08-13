# 实体与 ID 映射 · 视频号加热平台 (promote)

## 一、实体结构图

```text
Promote Account (包含微信豆资产)
  └── Campaign / Order (orderId: <timestamp>_<sequence>)
        ├── Associated Video (exportId: export/UzFfBg...) ──> 关联到 Creator / Commerce 视频
        ├── Target & Budget (SMART / PLAY, 100/500 微信豆)
        ├── Consumed Progress (consumedBeans, consumedAmount)
        └── Paid Results (paid_views, paid_likes, paid_followers, product_clicks)
```

## 二、ID 字段映射

1. **主主键 (跨端)**: `exportId`
   - Promote 订单中的被加热视频标识格式为 `export/UzFfBg...`，与 Creator 内容管理 `post_list` 及 Commerce 罗盘解密后的 `export_id` **完全一致**。
2. **订单主键 (单端/消耗端)**: `orderId` / `order_id`
   - 格式形如 `<timestamp>_<sequence>`，具有全局唯一性，可作为计算多次追投、分段 ROI 的主键。
