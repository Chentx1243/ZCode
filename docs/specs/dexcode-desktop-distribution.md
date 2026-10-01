# DexCode 桌面发行与隔离

## 产品规则

新增显式构建身份 `dexcode`，通过 `ZCODE_DEXCODE_IDENTITY=1` 选择，与后端环境独立。安装名和运行名为 DexCode，Windows appId 为 `dev.dexcode.app`，独立 NSIS 卸载/快捷方式/安装目录；官方 production 与 preview 构建保持原行为。提供当前 Windows x64 安装包，保留许可证和第三方声明，内置当前源码与 DexCode 预设，不携带本机密钥、会话或工作区数据。

Main 的最早期启动入口是身份及环境唯一所有者，在导入任何依赖业务数据路径的 Service 之前设置 DexCode 的专属 home/dataBaseDir、Electron userData/sessionData 和工具缓存。默认根为 Electron appData 下 DexCode；业务 home 为其 home 子目录，既有内部 `.zcode/v2` 数据格式沿用，实际目录不与官方用户 home 共用。子 Host、scheduler、Agent 继承相同路径。DexCode 不导入官方设置或凭据；用户单独登录。工作区路径仍是实际源码 `D:\project\cyberYou\ZCode`，数据隔离不重定向项目文件操作。单实例锁在独立 userData 初始化后申请。

DexCode 不注册官方 `zcode://` 协议，安装器也不声明该协议；官方浏览器 OAuth 回跳仍归官方，DexCode 使用 API key 登录。资源管理器入口改为 `DexCode.OpenInDexCode` 和“在 DexCode 中打开”，命令沿用 `--open-workspace`。DexCode 禁用官方更新及强更通道，后续重新打包手工升级。CUA 安装变体独立，远控业务 owner 与流式协议不变。

## 启动顺序

```mermaid
flowchart LR
  A[编译期 dexcode 身份] --> B[Main 最早期设置隔离环境]
  B --> C[业务路径和设置初始化]
  C --> D[独立 Electron userData 和单实例锁]
  D --> E[窗口及 window-scoped Local Host]
  E --> F[Agent 在真实源码工作区执行]
```

移除身份不会迁移、删除或覆盖任一版本数据。DexCode 数据目录自定义仍沿用设置服务路径；用户显式选择共享目录属于后续主动操作，不在默认隔离保证内。失败时报告真实构建/运行错误，不用旧包冒充新构建。

## 验收

- 构建身份解析及 appId/产品名、共享 flavor 保留官方兼容，非法或冲突开关拒绝。
- 最早期目录初始化独立，设置读取和 Agent 数据环境不指向官方 home。
- DexCode 安装器无 `zcode` 注册，运行无官方协议写入，右键注册只涉及 DexCode key。
- Windows x64 安装产物存在且具备 runtime 依赖；从打包产物启动能显示 DexCode 和预设，打开当前源码目录，官方注册在前后保持一致。
- 执行目标测试、typecheck、lint、架构和格式检查；安装器或真实模型未实际执行的部分明确报告。

## 当前版本验证记录

- Windows x64 安装包已生成：`packages/desktop/dist-dexcode/DexCode-3.14.3-win-x64.exe`。
- 已安装到 `D:\DEVSOFTWARE\DexCode`，并启动打开 `D:\project\cyberYou\ZCode`。
- 已确认独立目录 `%APPDATA%\DexCode\home`、`%APPDATA%\DexCode\session` 与 `%APPDATA%\DexCode\home\.zcode` 已创建。
- 已确认官方 `zcode://` 与 `ZCode.OpenInZCode` 仍指向 `D:\DEVSOFTWARE\ZCode\ZCode.exe`，DexCode 使用独立的 `DexCode.OpenInDexCode`。
- 已通过 DexCode 身份、隔离、协议与菜单相关测试；`pnpm typecheck` 通过；`pnpm lint` 通过（0 errors，71 warnings）；架构检查通过。
