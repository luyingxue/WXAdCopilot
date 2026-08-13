# WXAdCopilot

本地优先的视频号带货投流量化分析与智能盯盘桌面工具。

WXAdCopilot 把微信小店带货助手、电商罗盘和加热平台放进同一个桌面应用，持续保存视频与投放订单的数据快照，帮助运营者完成投前筛选和投中监控。账号、登录态和业务数据默认只保存在使用者自己的电脑上。

> 当前为早期公开版本：投前分析和投中监控已完成初版，投后复盘尚未实现。

## 能做什么

### 官网统一浏览

- 在应用内打开微信小店带货助手、电商罗盘和加热平台；
- 多个运营账号相互隔离，各自保存登录状态；
- 查看各平台在线状态，减少后台之间反复切换。

### 投前分析

- 每 30 分钟保存近 14 天视频的当前累计快照；
- 跟踪播放、互动、商品成交、退款和佣金等数据；
- 用账号近 30 天样本生成生命周期基准；
- 对比指定视频的流量曲线和千次观看净佣金，辅助判断是否值得测试投放。

### 投中监控

- 无活动订单时每 5 分钟发现一次新订单，也可手工立即发现；
- 活动订单每 30 秒保存一次投放和视频快照，直至订单真正结束；
- 展示消耗、成交、净佣金、盈亏和时间趋势；
- 为后续实时建议、止损规则和量化模型提供时序数据基座。

### 数据维护

- 维护橱窗商品、佣金比例和商品经营汇总；
- 汇总全部历史挂车视频的当前数据；
- 支持商品数据和带货视频分析导出 Excel。

## 下载与安装

请从 [GitHub Releases](https://github.com/luyingxue/WXAdCopilot/releases) 下载最新版本：

- Apple 芯片 Mac：文件名包含 `arm64`；
- Intel 芯片 Mac：文件名不包含 `arm64`；
- Windows 10/11 64 位：下载 `.exe` 安装程序。

当前公开预览版尚未配置 Apple Developer ID 和 Windows 商业代码签名：

- macOS 如拦截启动，请前往“系统设置 → 隐私与安全性”，选择“仍要打开”；
- Windows 如出现 SmartScreen，请确认文件来自本仓库 Release，再选择“更多信息 → 仍要运行”。

## 第一次使用

1. 启动应用，点击左侧“添加账号”；
2. 在“官网浏览”中依次登录微信小店带货助手和加热平台；
3. 电商罗盘与带货助手属于同一 Store 登录域，通常可从带货助手进入；
4. 确认三个平台显示在线；
5. 保持应用运行，快照机会按照周期自动采集；
6. 在“投前分析”查看视频，在“投中监控”查看活动订单；
7. 佣金发生调整时，可在“系统数据维护 → 商品数据库”手工刷新。

投前和投中分析依赖连续的本地快照。需要 24 小时监控时，请保持电脑、网络和应用持续运行，并关闭系统自动休眠。

## 数据与隐私

- 安装包不包含开发者的账号、Cookie、登录态、数据库、HAR 或密钥；
- 每位使用者首次启动时都会在自己的电脑上创建空数据库；
- SQLite 数据库、浏览器 Session 和运行日志保存在 Electron 的本地用户数据目录；
- 本项目没有云端账号系统，不会主动把业务数据上传到项目作者的服务器；
- 删除账号会同时删除该账号在应用内保存的本地业务数据和登录态。

提交 Issue 前请先清除截图、日志和请求信息中的 Cookie、Token、账号名称、店铺 ID、商品 ID、订单 ID 等私人信息。

## 平台依赖与使用边界

WXAdCopilot 通过使用者主动登录后的微信官方网页获取本人有权访问的数据。部分能力依赖微信网页内部接口，而不是承诺长期稳定的公共开放 API，因此微信页面或接口更新后可能暂时失效。

使用者应当：

- 只管理本人拥有或已获得合法授权的账号和数据；
- 遵守微信平台规则、相关协议及所在地法律；
- 自行评估投流决策和资金风险；
- 不使用本项目绕过登录、权限、风控或平台限制。

本项目只提供数据整理和辅助判断，不承诺流量、成交或投资收益。

## 本地开发

环境要求：

- Node.js 22 或更高版本；
- npm；
- macOS 或 Windows。

```bash
git clone https://github.com/luyingxue/WXAdCopilot.git
cd WXAdCopilot
npm install
npm run dev
```

常用命令：

```bash
npm run typecheck          # TypeScript 检查
npm run test:architecture  # 架构边界检查
npm run test:smoke         # 构建并运行真实 Electron 冒烟测试
npm run dist               # 生成当前平台安装包
```

主要技术栈：Electron、React、TypeScript、SQLite、ECharts。

## 系统设计

- [产品需求](docs/prd.md)
- [系统设计](docs/system-design.md)
- [架构边界](docs/architecture-boundaries.md)
- [平台依赖契约](docs/weixin-platform-dependency-contract.md)
- [数据接口能力](docs/data-interface-capabilities.md)
- [投中数据基座](docs/during-investment-data-foundation.md)

## 参与项目

- 功能建议和 Bug：提交 [GitHub Issue](https://github.com/luyingxue/WXAdCopilot/issues)；
- 代码贡献：阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 后提交 Pull Request；
- 安全与隐私问题：按照 [SECURITY.md](SECURITY.md) 私下报告；
- 其他系统定制开发与商业合作：微信扫码添加 `WILL`，或发送邮件至 `support@zwill.org`。

<p align="center">
  <img src="public/wechat-will.jpg" alt="WILL 的微信二维码" width="300" />
</p>

## 开源许可

本项目采用 [Apache License 2.0](LICENSE) 开源。

项目名称和标识不因源代码许可而自动授予商标使用权。
