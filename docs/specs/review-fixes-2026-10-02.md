# 合并检查问题复核与修复

本记录对照用户提供的检查报告及当前 `codex/cycbyYou` 源码，记录本次修复边界。

| 报告项                          | 复核                                                           | 处理                                                                                          |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| P1 温度恢复默认留下旧值         | 确认，内层缺键导致外层 spread 保留旧温度                       | 确认显式传 undefined；真实嵌套弹窗、保存与重开回归                                            |
| P1 中文缺少三个角色消息         | 确认                                                           | 补齐翻译并检查两种语言的全部 roles.\* key 对齐                                                |
| P1 角色存储失败导致创建抛错     | 确认                                                           | Store 统一回退官方 binding，保留原资料与错误提示，禁止覆盖损坏资料                            |
| P1 非默认预设编辑不使预热失效   | 确认，且草稿旧内容快照也需刷新                                 | 成功编辑发布 generation；未提交草稿按 ID 读取最新预设，预热与创建共用解析入口                 |
| P1 新测试缺少自动门禁           | 确认；此前 UI/Desktop 均无 test 脚本，亦无 pre-push hook 或 CI | 新增 test:review、包级 test、pre-push hook 和 Windows CI；CI 先构建 CLI 依赖与 Desktop bundle |
| P2 初始绑定失败泄漏 record      | 确认                                                           | 畸形 schema 在创建前拒绝；运行时绑定失败关闭刚创建的 deferred record并返回原错误              |
| P2 快照未加载可通过角色按钮切换 | 报告不准确，当前 roleSwitchLocked 已在 !snapshot 时禁用按钮    | 回调额外拒绝未就绪快照，保留 runtime busy/queued 检查                                         |
| P2 默认绑定硬编码 zh-CN         | 确认                                                           | 草稿解析使用当前 UI locale；无 UI 上下文时沿用共享 DEFAULT_LOCALE                             |
| P2 打包参数覆盖 Windows x64     | 确认                                                           | 构建前拒绝冲突平台及缺值，测试合法透传和 dry-run                                              |
| P2 CUA 环境开关无消费方         | 确认                                                           | 删除未使用环境字段，保留实际 product identity 工具变体配置                                    |
| P2 开发态 appId 与注释矛盾      | 确认注释问题，独立 appId 行为符合 DexCode 隔离规则             | 修正注释并验证官方/DexCode 开发态各自标识                                                     |
| P2 Web 同字体中英文重复         | 确认                                                           | 每个 family 留规范名称；搜索别名与历史保存值继续兼容                                          |
| P2 .zcode 未忽略                | 确认                                                           | 添加根目录忽略规则，保留目录与用户数据                                                        |
| 字体资源约 31 MB                | 属于已有 spec 的有意取舍                                       | 保留字体和 OFL；未声称降低安装体积                                                            |

## 尚未修改的设计问题

`runtime/role-binding.ts` 的角色切换先保存 binding entry、再修改配置、最后 appendEvent。最后一步失败可能导致 runtime、entry 和 UI 投影不同步。报告对此项的描述属实。

`appendEvent` 内部还分为 eventStore append、durable event 持久化和 sink 通知，单纯调换调用顺序或盲目回滚会产生其他部分提交。根据 AGENTS.md「发现设计缺陷时先与用户对齐」，已询问是否扩大为存储事务改造；本次局部修复暂不改动该跨存储设计。

## 本次验证

- `pnpm verify:pre-push`：66 项非交互测试通过，Lint 0 错误 / 69 条既有警告，架构 0 违规。
- `pnpm typecheck` 与 `pnpm --filter @zcode/bootstrap build` 通过。
- `pnpm --filter @zcode/desktop exec tsup` 通过，产物测试读取的是本次构建。
- `pnpm test:review:ui`：隔离 Edge 浏览器通过温度恢复默认、非默认角色编辑后真实预热 hook 重建、损坏存储回退；命令 transport 使用模拟器，未调用实际模型。
- 变更文件格式检查与 `git diff --check` 通过。
- 本机验证工具链：Node 24.18.0 / pnpm 10.33.2；mise 与新增 CI 使用 Node 24.14.0。
- CI workflow 已添加，远端尚未触发；不将本地验证表述为 GitHub CI 已通过。

## 覆盖安装验证

- `pnpm bundle:dexcode` 本次退出 0，Windows x64 安装器 157.2 MiB，运行依赖闭包和 500 MiB 体积门禁通过；版本沿用根 package.json 的 3.14.3，内容为本次修复后的工作区构建。
- 已覆盖安装到实时核实的 `D:\SOFTWARE\dexcode`，安装器退出 0；已安装 EXE 和 app.asar 的 SHA256 与本次 win-unpacked 产物一致。
- 两次升级后启动均无需重新登录，官方与 DexCode 预设可见；角色 localStorage 原始记录哈希与安装前一致，现有默认角色及手动文本未改写。
- Provider 配置哈希不变；官方协议和右键注册的结构与值均保持原样。
- 调试启动验证后关闭调试实例，使用正常参数打开 `D:\project\cyberYou\ZCode`；敏感配置备份仅位于已忽略的 `.local-debug/`，未输出内容。
