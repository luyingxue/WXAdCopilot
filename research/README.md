# 研究产出 · 微信视频号量化投流助手 第一阶段

本目录为 Doc2《三平台 Playwright 数据探索任务说明书》要求的探索产出,严格只读。

## 目录结构

```
research/
  README.md                 本文件
  architecture.md           架构与操作手册(技术栈/部署/脚本/陷阱,项目级单一事实来源)
  exploration-log.md        探索日志(按会话记录)
  platforms/
    creator/                视频号助手 channels.weixin.qq.com
      collection-guide.md   采集指南(给 coding agent:策略/流程/覆盖矩阵/缺口)
      page-map.md           页面地图
      api-catalog.md        接口目录
      field-dictionary.md   字段字典
      entity-map.md         实体与 ID 映射
    commerce/               微信小店/电商罗盘 store.weixin.qq.com
      page-map.md           页面地图(达人主页明文 / compass 短视频明细加密)
      api-catalog.md        接口目录(明文 mmeckolbasenode + 加密 compass)
    promote/                视频号加热平台(待探索)
  cross-platform/           跨平台映射与差距分析(三端完成后)
    id-mapping.md
    metric-mapping.md
    coverage-gap.md
    final-assessment.md
```

## 原始数据与隐私

- 原始响应(含真实 ID)存于 `data/raw-private/`,**已 gitignore,不入库**。
- 为降低公开仓库的隐私风险，响应样本不进入 Git；字段结构统一记录在字段字典中。
- 不保存 Cookie/Token/签名/完整请求头;请求体只记录字段名(`post_data_keys`),不记录值。

## 进度

- [x] creator · 内容管理/视频列表 post_list(口径已核对)
- [x] creator · 数据中心/视频数据分析(T-14 流量来源、statistic/post_list 单视频完播率/观看时长)
- [x] creator · 单视频详情 postDetail(接口已发现,body 待补)
- [x] creator · 带货数据 cargo/transcation(compass,**JSON.parse hook 解密成功**,35 成交指标 + 佣金)
- [x] commerce · store.weixin.qq.com 达人主页(明文)+ 电商罗盘短视频明细(compass,JSON.parse hook **解密成功**)
- [x] promote · 微信豆加热平台(订单列表/实时看板/消耗/付费结果/导出键 `exportId` **探索完成**)
- [x] 跨端 exportId 验证(commerce `export_id` ≡ creator `exportId` ≡ promote `exportId`,**三端通过**);商品/店铺映射待补
- [x] compass 加密攻坚:**hook 通吃 creator cargo + commerce compass**(同套加密)
- [x] 核心生死指标:P0-01~P0-06 全线验证通过！第一阶段核心数据可及性评估完结。
