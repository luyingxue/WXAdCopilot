# WXAdCopilot 分层边界

**版本：** 1.0  
**日期：** 2026-07-27

## 1. 目标

本文件定义代码模块的职责、依赖方向和调试边界。功能新增时必须先确定所属层，不得把登录、页面、平台请求、数据库和业务判断写在同一个模块中。

## 2. 运行结构

```text
src/
  React 界面，只通过 preload API 触发用例

electron/preload/
  最小 IPC 契约，不包含业务实现

electron/main/application/
  account-service
  health-service
  preinvest-service
  未来：midinvest-service / postinvest-service

electron/main/runtime/
  account-runtime
  identity-container
  runtime-registry
  browser-workspace
  account-task-queue

electron/main/platforms/
  compass/compass-gateway
  未来：promote/promote-gateway

electron/main/analysis/
  traffic-curve/analyzer
  纯计算，不依赖 Electron、SQLite、平台或页面

electron/main/infrastructure/
  persistence/database
  observability/logger
```

## 3. 平台身份域

| 身份域 | 页面 | Session 分区 |
|---|---|---|
| Store | 微信小店带货助手、电商罗盘 | `persist:wxad_v3_<accountId>_store` |
| Promote | 加热平台 | `persist:wxad_v3_<accountId>_promote` |

视频号助手已从运行系统退役，不得重新成为运行依赖。

每个身份域由一个 `IdentityContainer` 独占。Electron persistent Session
是运行时唯一登录态事实源。由于官方关键凭据包含 Chromium 不跨进程保留的
Session Cookie，身份容器允许维护一份系统加密的冷启动日志：只在页面稳定或
退出时读取快照，启动时只补充当前 Session 中不存在的 Cookie；禁止清空、
覆盖、合并、去重或持续反写 Cookie。
`BrowserWorkspace` 只管理原生视图的显示与尺寸，无权创建或修改 Session。

## 4. 能力状态

页面可访问不等于数据接口可用。登录状态刷新只检查现有容器，不新建页面、
不导航官网、不调用登录接口。账号运行时按能力返回状态：

```text
session_restored
→ page_authenticated
→ account_context_ready
→ core_api_available
```

罗盘核心能力检查至少包括：

- Talent/Compass Session 有效；
- `/compass/feed/list` 能读取 `selectedAccount`；
-核心 List 接口能够返回成功状态。

## 5. 并发规则

- 不同账号可以并行。
- 同一账号的 Store 登录态重置和罗盘采集串行。
- Store 会话保活、罗盘账号初始化和罗盘采集共用同一账号任务队列；保活模块只
  负责官方账号列表与业务会话，不读取或写入投前业务数据。
- Promote 使用独立队列，不与 Store 数据任务互锁。
- UI 重复点击同一刷新任务时复用或排队，不并发创建两个执行器。
-任务失败只释放自己的执行器，不销毁权威 Session 和官网页面。

## 6. 独立调试

每层提供自己的诊断证据：

- Runtime：身份域、能力阶段、页面 URL，不记录 Token 或 Cookie 值。
- Gateway：接口名、请求序号、响应码、字段完整性，不写业务判断。
- Task Engine：排队时间、开始结束时间、任务状态。
- Application：用例输入、保存数量、业务错误。
- Persistence：事务和迁移结果，不记录敏感响应。

日志关联键统一为：

```text
taskId + accountId + module + event
```

## 7. 已确认的罗盘请求约束

- List 和 Detail 均通过官方客户端直接请求，不模拟点击页面。
-请求执行器使用 AccountRuntime 的完整 Store Session。
-进入 `/compass/feed/list` 后读取官方 `selectedAccount`，禁止写死 `all`。
-请求结束时间使用真实当前时间，禁止传入未来时间。
-List 提供范围内发布视频的当前累计基础/互动快照。
-Detail 提供当前累计单视频与带货快照。
-确定 `no_cart` 后不重复请求 Detail。
