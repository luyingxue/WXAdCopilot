# 参与贡献

感谢你帮助改进 WXAdCopilot。

## 提交问题

提交 Issue 前请：

1. 搜索是否已有相同问题；
2. 写明操作系统、应用版本、涉及平台和复现步骤；
3. 说明预期结果与实际结果；
4. 删除截图和日志中的 Cookie、Token、账号、店铺、商品及订单信息。

请勿在公开 Issue 中上传 HAR、数据库、浏览器用户目录、`.env` 或完整请求头。

## 提交代码

1. Fork 仓库并从 `main` 创建功能分支；
2. 保持平台适配、运行时、业务服务、持久化和 UI 的现有边界；
3. 不提交真实业务样本、登录态或凭证；
4. 为新增行为补充测试或可复现的验证说明；
5. 提交 Pull Request 前运行：

```bash
npm run typecheck
npm run test:architecture
npm run test:smoke
```

一个 Pull Request 尽量只解决一个明确问题，并说明对数据库、登录态、采集频率和平台接口的影响。

## 平台接口变更

微信网页接口可能变化。涉及接口的修改应同时更新 `docs/data-interface-capabilities.md`，说明：

- 页面和业务用途；
- 请求输入；
- 响应字段；
- 当前累计快照或时间范围数据口径；
- 登录域和会话依赖；
- 实测日期及已知限制。

## 联系方式

安全问题请参照 [SECURITY.md](SECURITY.md)。其他合作可联系 `support@zwill.org`。

