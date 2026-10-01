# Agent 维护指南

## 项目定位与阅读顺序

这是 ZCode 的源码工作区，同时包含 DexCode 独立桌面发行身份和可编辑的人物预设。内部包名、协议类型与 `.zcode` 数据格式仍沿用 ZCode；不要为品牌改名批量替换这些内部标识。

开始任务先读本文件，检查 `git status --short`、`mise.toml`、根及目标包的 `package.json`，再读目标 spec。用户已有本地改动可能尚未提交，禁止用 reset、checkout 或清理脚本抹掉它们。

本分支重点 spec：

- `docs/specs/role-management.md`：人物预设、绑定和高级提示词。
- `docs/specs/dexcode-desktop-distribution.md`：发行身份、数据隔离和 Windows 注册。
- `docs/specs/api-key-login-persistence.md`：API Key 登录持久化与重启恢复。

## 核心原则

- 新增或修改行为前，先更新对应 spec；目录不存在时按需创建。先明确产品规则、状态所有者、接口和验收场景，再实现代码。
- 以当前检出的源码、`package.json` 和架构策略为准。说明中只保留当前仓库提供的功能、命令和文件；删除功能时同步清理指令和技能中的引用。
- 定位问题时，未明确要求修改代码就先调查原因。结合源码、日志和运行时证据，区分已确认原因与待验证假设。
- 保留与任务无关的本地改动，不自行恢复已移除的模块或内部依赖。

## 命令与仓库结构

开工前运行 `node scripts/check-workspace-freshness.mjs` 检查基线。Node 版本以 `mise.toml` 为准。

以下命令从仓库根目录执行：

| 用途             | 命令                                      |
| ---------------- | ----------------------------------------- |
| 类型检查         | `pnpm typecheck`                          |
| Lint             | `pnpm lint` / `pnpm lint:fix`             |
| 格式检查         | `pnpm fmt:check`                          |
| 桌面开发         | `pnpm dev:desktop`                        |
| Web 开发         | `pnpm dev:web`                            |
| 提交前检查       | `pnpm verify:pre-push`（Lint 与架构检查） |
| 架构检查         | `pnpm architecture:check --changed`       |
| 模块阅读包       | `pnpm architecture:context <module-id>`   |
| 未使用依赖与导出 | `pnpm knip`                               |
| 导出引用查询     | `pnpm dep:refs --list-exports <file>`     |

测试入口以目标包当前的 `package.json` 和实际测试文件为准，不假定存在统一的单测或 E2E 命令。

## 环境准备与启动

工具链以 `mise.toml` 为准：当前 Node `24.14.0`、pnpm `10.33.2`。先运行 `node --version`、`pnpm --version`；不要让全局 pnpm 或 Corepack 自动切换到其他主版本。安装依赖使用 `pnpm install`，需要首次完整初始化时使用 `pnpm bootstrap`；远程资源确有需要时再用 `pnpm bootstrap:with-remote`。不要把 `pnpm clean` 当作常规故障恢复步骤。

从仓库根目录执行：

| 场景                       | 命令                    | 当前语义                         |
| -------------------------- | ----------------------- | -------------------------------- |
| 桌面开发，production 后端  | `pnpm dev:desktop`      | 等同 `pnpm dev:desktop:prod`     |
| 桌面开发，test 后端        | `pnpm dev:desktop:test` | test 是产品环境，不是执行单测    |
| Web 与本地服务             | `pnpm dev:web`          | Web 默认 5173，服务代理默认 3030 |
| 仅本地服务                 | `pnpm dev:server`       | 入口以 server 包脚本为准         |
| DexCode Windows x64 安装包 | `pnpm bundle:dexcode`   | 独立身份，production 后端        |

桌面启动脚本会准备运行资源、清理并重建 `packages/desktop/out`、构建 Agent CLI，然后启动 tsup watch、Vite 和 Electron。桌面 Vite 固定 5174（strictPort）；不要直接跳过根启动脚本调用 `dev:runtime`，除非已完成前置构建。UI 可热更新；Agent CLI 源码修改后需要重新构建并重启相关实例。实际就绪状态以日志为准，端口监听不等于 Agent 或模型请求可用。

### Windows 并行调试与数据隔离

先核对已运行进程的 `ExecutablePath`、`CommandLine`、数据根和占用端口。普通开发身份是 ZCode Dev，不能仅凭 UI 的 ZCode 文案判定它是官方安装。

下面示例在专用 PowerShell 终端内使用，路径可按任务调整，避免与已安装 DexCode 共用数据。环境变量只用于当前终端和子进程；不要设置用户级或系统级环境变量。

```powershell
$debugRoot = Join-Path (Get-Location) '.local-debug'
$env:ZCODE_DEXCODE_IDENTITY = '0'
$env:ZCODE_PREVIEW_IDENTITY = '0'
$env:ZCODE_DATA_BASE_DIR = Join-Path $debugRoot 'home'
$env:ZCODE_DESKTOP_HOME_DIR = Join-Path $debugRoot 'home'
$env:ZCODE_DESKTOP_USER_DATA_DIR = Join-Path $debugRoot 'electron'
$env:ZCODE_DESKTOP_SESSION_DATA_DIR = Join-Path $debugRoot 'session'
pnpm dev:desktop:prod
```

调试目录含凭据和会话，必须留在本机并确保未被 Git 跟踪。不同后端环境使用不同调试目录。普通开发实例启动仍可能注册 `zcode://` 和 `ZCode.OpenInZCode`，数据隔离不能阻止这些全局副作用。启动前记录或导出已有注册，启动后和调试结束时核对并恢复原值；按实际安装路径恢复，不硬编码其他机器的路径。不要删除整个 Classes 或 Directory 注册分支。只退出本任务启动的进程，不批量结束所有 Electron/Node/ZCode。

开发态默认 CDP 端口 9229。多实例或 Chromedriver 场景设置 `ZCODE_DISABLE_FIXED_REMOTE_DEBUGGING_PORT=1`，再由启动参数或测试框架分配端口。Electron 已运行时，新增调试参数不会自动作用到原实例。调试结束后关闭带调试端口的实例，以正常参数启动；截图和 DOM 输出避免泄露凭据及用户会话。

## DexCode 打包、安装与维护

`pnpm bundle:dexcode` 通过 `scripts/bundle-dexcode.mjs` 设置 `ZCODE_DEXCODE_IDENTITY=1`、关闭 preview 身份，生成 `packages/desktop/dist-dexcode` 下的 Windows x64 安装包和 `win-unpacked`。文件名版本取根 `package.json`，不要把某次版本号写死为永恒命令。构建耗时可能较长；检查实际日志和最终退出码，等待运行依赖与包大小审计完成，不能用旧安装包冒充本次构建成功。

关键实现入口：

- `packages/desktop/scripts/desktop-product-identity.mjs`：产品名、appId 和发行身份解析。
- `packages/desktop/src/main/desktopEarlyProductIsolationBootstrap.ts`：先初始化隔离环境，再动态导入 Main；不要恢复为提前静态导入业务入口。
- `packages/desktop/src/main/desktopProductIsolation.ts`：独立 home、userData、sessionData 和工具变体。
- `packages/desktop/electron-builder.config.js`：安装器元数据与协议声明。
- `packages/desktop/src/main/desktopOAuthDeepLink.ts`、`desktopWindowsOpenFolderContextMenu.ts`：运行时协议与右键注册。

DexCode 的 appId 为 `dev.dexcode.app`。默认业务配置在 `%APPDATA%\DexCode\home\.zcode\v2`，Electron session 在 `%APPDATA%\DexCode\session`。它不注册官方 `zcode://`，使用独立 `DexCode.OpenInDexCode` 右键 key，并禁用官方自动更新；当前使用 API Key 登录，浏览器 OAuth 回跳仍由官方协议接收。数据隔离不改变实际 workspacePath，Agent 对源代码目录的操作仍会直接修改工作区文件。

本机最近确认的安装目录为 `D:\SOFTWARE\dexcode`；这是本机状态，换机器或执行安装前必须重新核实。用户要求升级时，先构建并检查新包，再关闭该目录对应的 DexCode 进程，覆盖安装到确认过的目录。默认保留数据，不重新写入已有 API Key；安装后检查程序/asar 哈希、两次启动、预设可见性及官方协议/右键注册。卸载程序与删除用户数据是两件事，删除数据需要用户明确要求。

## 人物预设与登录问题定位

发行预设在 `packages/ui/src/lib/rolePresets.ts`，当前初始列表为官方角色与 DexCode；保留 DexCode 稳定 ID，不将“通用助手”“写作伙伴”重新加入默认列表。默认选择和自定义预设由 `packages/ui/src/store/roleManagementStore.ts` 管理，版本内预制内容不是本机导出文件的运行时依赖。用户手动编辑的预设需要保留。

高级提示与 Agent 拼装需结合 `apps/zcode-cli/packages/core/src/context/builder.ts`、`dynamic-sections.ts` 和 `runtime/role-binding.ts` 查看，避免身份、表达风格和高级覆写重复或冲突。`customSystemPrompt` 会绕过默认动态提示词，不能随意用来替代人物预设。

登录页出现时先确认实际进程和数据根，再检查配置存在性和脱敏日志。API Key 登录保存在 `provider_config.json`；OAuth 凭据由 CredentialService 保存到 `credentials.json`。不要因为没有 credentials 文件就断言 API Key 丢失，更不能输出任一文件的完整敏感内容。

`LoginApiKeyForm.tsx` 必须先保存 Provider，再通过 SettingService 保存所选运行域，最后发布登录成功事件。`providerFamilyDomainMigration.ts` 负责旧配置恢复；`Root.tsx` 必须等待迁移后的设置和模型状态刷新，才解除启动门禁。调查重启丢登录时同时看 `providerFamilyDomain`、迁移标记、可用模型投影和 Key 是否存在，不用绕过登录门禁掩盖状态错误。

日志默认位于业务配置根的 `logs` 子目录。区分 Renderer 登录检查、Host 服务持久化和 Agent 请求；HTTP/端口正常不能证明鉴权或真实模型生成成功。

### 当前可用的定向验证示例

以下命令从仓库根运行；新增测试仍应按行为选择实际入口。

```powershell
node node_modules/tsx/dist/cli.mjs --tsconfig packages/ui/tsconfig.json --test packages/ui/test/apiKeyLoginPersistence.test.ts
node node_modules/tsx/dist/cli.mjs --test packages/ui/test/roleManagement.test.ts packages/ui/test/roleSwitching.test.ts packages/ui/test/roleAdvanced.test.ts
node --test packages/desktop/test/dexcodeDistribution.test.mjs
node node_modules/tsx/dist/cli.mjs --test packages/desktop/test/dexcodeIsolation.test.ts
```

`packages/ui/test/rolePresetShipping.e2e.mjs` 连接已经启动的 Electron CDP，默认 9229，可用 `ZCODE_ROLE_E2E_CDP` 指定地址。E2E 应使用独立数据，不能把测试专用 store bridge 开关带入交付包。一次启动、截图或静态审计不能当作完整交互验证；纯文档改动检查格式与命令引用即可，不需重打包或重启用户软件。

- `packages/desktop`：Electron main、host、renderer。
- `packages/web`、`packages/server`：Web 客户端与服务端。
- `packages/ui`：共享 React 组件、hooks 与 Zustand store。
- `packages/services`：业务服务；`packages/rpc`：RPC 框架。
- `packages/shared`：共享协议与类型；`packages/client`：Agent 客户端 SDK。
- `apps/zcode-cli`：Agent CLI 与运行时。
- `CONTEXT.md`：插件商店领域词汇；修改相关 UI 前阅读。
- `DESIGN.md`：UI 设计规范；修改 UI 前阅读。

## 实现与验证

- 代码改动使用 `.agents/skills/architecture-governance/SKILL.md`，先运行架构检查，再读取目标模块的受控上下文。
- 避免重复状态和多条写入路径。明确唯一所有者、接口、依赖方向、事件顺序与幂等边界，不能用超时掩盖同步问题。
- 有行为改动时先补充对应测试；交互改动需要 E2E 场景。检查测试与实现是否一致，并实际执行可用的验证。未执行或环境受限时如实说明。
- 修复 bug 时用中文注释说明原因和修复依据。发现设计缺陷时先与用户对齐，不不断增加兜底分支。
- 涉及状态、时序、远端或异步同步的方案，用图展示所有者及事件顺序。
- 必须执行 `pnpm typecheck` 和 `pnpm lint`，报告真实结果，不将已有失败写成通过。
- 使用异步文件和网络 IO；跨包导入使用公开入口，遵守现有路径别名。
- 禁止 UI 直接调用 Repo、Service 引用 Runtime 具体实现、跨域导入实现细节及循环依赖。

## UI 与平台边界

- 遵守 `DESIGN.md`，复用已有组件，兼顾桌面与手机 Web 的布局、交互、主题和国际化。
- 组件通过 `packages/ui/src/hooks/` 访问服务；平台操作通过 `IPlatformService`（`packages/shared/src/platform.ts`），不直接调用 `window.zcode`。
- 通过依赖注入处理 Desktop、Web、本地和远程环境的差异，并兼顾 Windows、macOS 和 Linux。
- Zustand 状态位于 `packages/ui/src/store/`。广播同步的主题、语言等字段需要防止回环；UI 局部状态不应被误当作服务端事实。
- hooks 中含 JSX 的文件使用 `.tsx`。

## 进程、协议与远程控制

- Desktop app 通过 stdio 与 Agent 通信。协议改动同步更新 `packages/shared/src/zcode-protocol/index.ts`，提供严格类型与运行时校验。
- Main 负责窗口、原生操作、进程调度和消息转发，不承载 task/session 业务状态。
- 每个窗口使用一个 window-scoped Local Host；本地 workspace 共享该 Host。远程 workspace 由窗口内的连接注册表管理，不另建 Desktop Remote Host。
- 手机远控连接桌面已有 Host attachment，复用会话运行时；不为手机另起 Agent、Local Host 或远程会话。
- Desktop 的 `desktop-continuous` 实时链路与手机的 `web-remote-replayable` 恢复链路必须明确区分。修改 stream、snapshot、queue 或重连时，同时验证两种语义。
- 外部 relay 与 Main 只做鉴权、配对、心跳、转发及 attachment 调度，不保存任务队列、快照等业务状态。
- 已接受的 busy/running 输入由 CLI/runtime `CommandInbox` 串行 admission；Renderer 只保留未提交草稿与 pending optimistic overlay，Host owner/lease 负责路由。
- 保留 owner/lease、跨 Host 路由和 stale run 防护，不能仅根据单一路径删除边界判断。

## Workspace Identity

- `workspaceIdentity` 用于身份隔离，`workspacePath` 用于文件操作、命令 cwd、Git 和路径展示。
- 身份 key 统一为 `workspaceIdentity?.trim() || workspacePath`，适用于去重、绑定、缓存、队列、持久化和请求关联。
- 远程链路贯穿传递 `workspaceIdentity` 与 `remoteSessionId`，不得仅按路径匹配。
- 新接口保留本地路径 fallback；远程 identity 复用现有构造和解析工具，不在业务代码中手写格式。

## 日志

- UI 使用 `packages/ui/src/logger.ts`，不直接使用 `console.log` 或 `window.zcode?.log`。
- Agent/session/runtime 相关服务日志使用 `createServiceLogger(scope)`（`packages/services/src/logger/serviceLogger.ts`）。
- `debug` 用于协议原始数据、流式 chunk 和逐条工具更新等高频诊断，生产环境不落盘。
- `info` 用于进程和会话生命周期、权限结果、一次性初始化等生产可用事件。
- `warn` 用于可恢复异常；`error` 用于崩溃、握手失败、鉴权丢失等不可恢复错误。
- 不在日志、示例或提交中写入凭据、真实用户数据和内部服务地址。
