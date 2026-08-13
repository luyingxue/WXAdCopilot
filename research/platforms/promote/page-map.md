# 页面地图 · 视频号加热平台 (promote)

> 参考域名: `channels.weixin.qq.com/promote`

## 一、核心页面列表

### 1. 首页 Dashboard (`/promote/pages/platform/`)

- **URL**: `https://channels.weixin.qq.com/promote/pages/platform/`
- **入口**: 扫码登录默认进入
- **页面用途**: 快速拉起加热订单创建流（短视频加热/直播间加热）与今日消耗概览。
- **可见数据模块**: 
  - 快速加热 (选择视频入口)
  - 今日消耗总览 (消耗金额、消耗微信豆金额)
- **核心操作**: 点击“创建订单”拉起短视频/直播间加热配置弹窗。

### 2. 订单管理页 (`/promote/pages/platform/order/list`)

- **URL**: `https://channels.weixin.qq.com/promote/pages/platform/order/list`
- **入口**: 左侧侧边栏导航第二项 (订单图标)
- **页面用途**: 展示历史与当前投放订单。
- **视图 Tab**:
  - `标准订单`: 普通视频/直播间加热订单
  - `全域订单`: 全域智能加热订单
- **筛选条件**: 日期范围 (开始日期 - 结束日期)、订单状态 (选择订单状态: 审核未通过 / 投放中 / 已完成等)
- **列表显示列**:
  - `订单信息`: 视频封面、标题描述、视频类型（短视频加热）、订单唯一 ID（形如 `<timestamp>_<sequence>`）
  - `投放进度`: 消耗微信豆 / 预算微信豆 (如 `0 / 100` 微信豆)
  - `订单状态`: 审核未通过 / 投放中 / 审核中 / 已完成
  - `实际加热时长`: 加热小时数或分钟数
  - `出价(ROI)`: 放量加热 / 自定义出价
  - `订单创建人`: 微信运营账号

### 3. 数据统计页 (`/promote/pages/platform/short-video/statistic`)

- **URL**: `https://channels.weixin.qq.com/promote/pages/platform/short-video/statistic`
- **入口**: 左侧侧边栏导航第三项 (统计图标)
- **页面用途**: 聚合分析指定时间段内的投放效果与消耗明细。
- **筛选条件**: 订单类型、选择作者、选择创建人、日期范围 (如 `2024-08-01 至 2024-08-10`)
- **自选指标 (看板卡片)**:
  - 消耗金额 (RMB)
  - 消耗微信豆金额
  - 播放数
  - 商品点击数
  - 点赞数 / 评论数 / 关注数
- **数据明细列表**:
  - 订单日期、订单号 (`order_id`)、视频作者、视频描述/ID (`exportId`)、消耗金额、消耗微信豆金额、播放数、互动数。

### 4. 今日数据实时看板 (`/promote/pages/platform/short-video/daily-dashboard`)

- **URL**: `https://channels.weixin.qq.com/promote/pages/platform/short-video/daily-dashboard`
- **入口**: 数据统计页顶部“前往今日数据实时看板”链接
- **页面用途**: 实时监控当天消耗与即时跑量趋势。
- **主要模块**:
  - 今日消耗金额 (RMB)
  - 消耗微信豆金额、播放数、点赞数、评论数
  - 实时趋势折线图
  - 组件加热榜
  - 订单明细实时表 (下单时间、订单号、视频作者、视频、消耗金额、微信豆、播放数)

### 5. 账号与资产信息页 (`/promote/pages/platform/account/info`)

- **URL**: `https://channels.weixin.qq.com/promote/pages/platform/account/info`
- **入口**: 左侧侧边栏导航第四项 (用户图标)
- **页面用途**: 呈现当前投放账号主体、微信豆余额及充值记录。

---

## 二、页面关系图

```text
promote 首页 (Dashboard)
  ├── 订单管理页 (/order/list)
  │     ├── 标准订单 Tab
  │     └── 全域订单 Tab
  ├── 数据统计页 (/short-video/statistic)
  │     └── 今日数据实时看板 (/short-video/daily-dashboard)
  └── 账号与资产页 (/account/info)
```
