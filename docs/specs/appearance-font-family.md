# 外观：字体选择

状态：已实现（初版）

## 产品规则

设置 → 外观 → 「界面」分组卡片内、「界面字号」行上方新增「字体」设置项，标签为「字体」，描述为「调整应用界面与模型输出内容的字体」。

可选值：

| 值                           | 含义                                               | 展示                         |
| ---------------------------- | -------------------------------------------------- | ---------------------------- |
| `system`（默认）             | 跟随系统，即应用默认无衬线栈                       | 「跟随系统」                 |
| `builtin:source-han-sans-sc` | 应用内置的思源黑体（可变字体，字重 200–900）       | 「思源黑体（内置）」         |
| 其他非空字符串               | 系统已安装字体的 family 名（如 `Microsoft YaHei`） | 字体名本身，选项用该字体渲染 |

生效范围：全部界面文字与模型输出 Markdown 正文（段落、标题、列表、表格等继承默认 sans 的内容）。代码块、行内代码、Diff 与终端使用 `--font-mono` 等宽字体，不受本设置影响（遵守 DESIGN.md「UI Mono」规范）。

字体被卸载时的行为：所选字体排在字体栈首位，栈尾为默认栈，浏览器自动回退，不做存在性校验。

## 状态所有者与持久化

与 `uiFontSizePx`（界面字号）同构：

- 唯一所有者：`packages/ui/src/store/index.ts` 的 zustand store，state 字段 `uiFontFamily`。
- 持久化：localStorage key `zcode-ui-font-family`（`packages/ui/src/lib/uiFontFamily.ts`）。不进 `setting.json`，不经过 SettingService。
- 生效方式：`applyUiFontFamily` 在 `document.documentElement` 上写 CSS 变量 `--app-font-family`（字体栈字符串）；`packages/ui/src/styles.css` 中 `@theme` 的 `--font-sans` 指向 `var(--app-font-family)`，Tailwind preflight 的 html 字体与 `font-sans` utility 全部跟随。不修改 html/body 的 font-size。
- 跨窗口同步：`uiFontFamily` 加入 store `BROADCAST_FIELDS`（zustand 广播）+ `subscribeToUiFontFamilyStorageChanges`（storage 事件）。资源管理器独立窗口在 `resource-manager.tsx` 首屏前显式 apply。

## 内置思源黑体

- 文件：`packages/ui/src/assets/fonts/SourceHanSansSC-VF.otf`（约 30.3MB，官方 v2.005R 可变字体，简体中文字集，SIL Open Font License 1.1）。
- 许可：`packages/ui/src/assets/fonts/SourceHanSansSC-OFL.txt` 随包分发，满足 OFL 对附带许可文本的要求。字体未做修改，保留原名称。
- 注册：`styles.css` 中的 `@font-face`，family 名 `Source Han Sans SC`，`src` 先 `local("Source Han Sans SC")` / `local("思源黑体 SC")`（本机已安装时优先命中、不读打包文件），再落到打包的 VF 文件（`format("opentype-variations")`，`font-weight: 200 900`，`font-display: swap`）。
- 打包：由 Vite 经 `styles.css` 的相对 url 引用进入 hashed assets，桌面（asar 内）与 Web 共用同一份文件；仅在字体被实际使用时浏览器才会加载它。

## 系统字体枚举（平台能力）

Web 常见字体预设每个 family 仅提供一个规范名称；中文别名继续用于搜索，已保存的历史名称不改写。内置可变字体仍按既定规则随包分发，不在本次缺陷修复中移除或改换资源。

`IPlatformService.listSystemFonts(): Promise<string[]>`。

- 桌面：渲染进程通过 Chromium Local Font Access（`window.queryLocalFonts()`，Electron 默认授权）枚举，按 family 去重、`localeCompare` 排序。不走路由 IPC——Electron 主进程没有 `app.getFontList` 这类字体枚举 API（已实测 41.x 不存在）；`queryLocalFonts` 在页面不可见时会抛 `SecurityError`，而字体下拉只在用户点击展开（页面必然可见）时才懒加载，该约束天然满足。
- Web（含手机远控页面）：浏览器 Local Font Access 需授权且移动端不可用，降级为内置项 + 常见字体预设列表（常见中西文字体 family 名）。
- 设置面板在下拉展开时懒加载系统字体列表，加载失败只影响「系统字体」分组，固定项仍可用。

## 验收场景

1. 默认状态：设置值为 `system`，界面与默认视觉一致。
2. 选择系统字体（如「微软雅黑」）：界面文字与模型回复正文即时变化；代码块、行内代码、终端不变。
3. 选择「思源黑体（内置）」：未安装该字体的机器上由内置文件渲染，粗体/中黑等字重正常（可变字体）。
4. 重启应用后选择保持；多窗口（含资源管理器窗口）同步变化。
5. 非法/空 localStorage 值回退 `system`；被卸载的字体名自动落回默认栈。
6. Web 端设置项可见，预设列表可选并生效。
