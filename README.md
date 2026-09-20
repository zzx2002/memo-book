# 我的记事簿 · MemoBook

轻量化桌面待办记事簿。浅色、留白、圆角、低饱和配色，适合长期挂在桌面上使用。

视觉与交互参考：`design/prototype.html`（可双击直接在浏览器打开的高保真原型）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面容器 | Tauri 2（Rust） |
| 界面 | React 18 + TypeScript |
| 样式 | Tailwind CSS 3（配合少量 `@layer components` 结构化类） |
| 数据 | SQLite（`tauri-plugin-sql`，Rust 端管理迁移） |

浏览器里直接跑 `pnpm dev` 时会自动退化为 localStorage 实现（`src/lib/repo/local.ts`），
方便在没有 Rust 工具链的机器上调试界面；桌面端永远走 SQLite。

## 目录结构

```
.
├─ index.html                    # Vite 入口
├─ src
│  ├─ main.tsx / App.tsx         # 应用外壳：标题栏 + 三栏布局
│  ├─ index.css                  # Tailwind 层与组件类（.nav-item / .task-row / .chip ...）
│  ├─ types.ts                   # Task / Folder / View 等领域模型与 Repo 接口
│  ├─ components
│  │  ├─ Sidebar.tsx             # 左侧导航：收件箱 / 今天 / 即将到来 / 已完成 + 文件夹
│  │  ├─ TaskList.tsx            # 中间列表：视图头、搜索、排序、拖拽排序、新增、已完成分组
│  │  ├─ TaskRow.tsx             # 单条待办：拖拽手柄、勾选、优先级点、文件夹、重复图标、截止日期
│  │  ├─ AddInput.tsx            # 快速新增（回车连续添加）
│  │  ├─ DetailPanel.tsx         # 右侧详情：说明、优先级、文件夹、排期/截止/提醒、重复、备注
│  │  ├─ Dropdown.tsx            # 固定定位下拉菜单
│  │  └─ Icon.tsx                # 内联 SVG 图标
│  ├─ state/AppContext.tsx       # 全局状态、统计、搜索筛选、排序、重复任务、提醒心跳、回收站、快捷键
│  └─ lib
│     ├─ dates.ts                # 日期格式化与加减（4月25日 (周五)）
│     ├─ repeat.ts               # 重复规则：下一次日期推算、生成下一实例
│     ├─ reminder.ts             # 提醒调度纯函数（到点/过期分流、提前量）
│     ├─ notify.ts               # 通知发送：Tauri 原生 / Web Notification 降级
│     ├─ desktop.ts              # 桌面能力封装：导出/导入/备份/唤起窗口/快捷键事件
│     ├─ transfer.ts             # 导入导出纯函数（JSON 快照、Markdown、合并判重）
│     ├─ reorder.ts              # 手动排序纯函数（moveTo / toSortOrder）
│     ├─ constants.ts            # 优先级 / 文件夹配色 / 视图 / 排序常量
│     ├─ seed.ts                 # 示例数据（与设计稿一致）
│     └─ repo/{index,sqlite,local}.ts
├─ src-tauri
│  ├─ src/lib.rs                 # 托盘 / 单实例 / 全局快捷键 / 窗口状态 / 迁移注册（v1~v4）
│  ├─ src/files.rs               # 导出 / 导入 / 备份的原生命令（文件读写都在 Rust 侧）
│  ├─ migrations/0001_init.sql   # 建表 + 示例数据
│  ├─ migrations/0002_sort_and_repeat.sql   # sort_order + repeat_rule
│  ├─ migrations/0003_reminder_and_trash.sql # notified_at + deleted_at
│  ├─ migrations/0004_remind_before.sql     # remind_before（提前量）
│  ├─ capabilities/default.json  # 权限：core + sql + sql:allow-execute + notification
│  ├─ icons/                     # 由 scripts/gen-icons.mjs 生成
│  └─ tauri.conf.json
└─ scripts/                      # 图标生成与三个自检脚本
```

## 环境要求

| 依赖 | 版本要求 | 本机状态（2026-09-20 实测） |
| --- | --- | --- |
| Node.js | ≥ 18（推荐 20/22） | ✅ v24.9.0，需 `node:sqlite` 跑 `pnpm check:sql`（Node 22.5+ 内置） |
| pnpm | ≥ 9；本机用的 12 | ✅ v12.5.1（`allowBuilds` 等配置写在 `pnpm-workspace.yaml`，该文件仅 pnpm 11+ 识别） |
| Rust | ≥ 1.77（`rustup` + `stable-x86_64-pc-windows-msvc`） | ✅ 1.98.1，装在 `%USERPROFILE%\.cargo\bin` 且已写入用户 PATH |
| MSVC 生成工具 | VS 2022/2026 Build Tools 的 C++ 工作负载 | ✅ VS Build Tools 18（MSVC 14.51.36231） |
| WebView2 运行时 | Win10/11 通常自带 | ✅ 153.0.4234.48 |

`cargo fetch` 与 `cargo build` 均已在本机跑通（`src-tauri/target/debug` 已产出 `memo_book_lib.dll`），
所以 `pnpm desktop:dev` 可以直接用，无需再安装 Rust。

> 新开一个终端窗口才会有 `cargo` / `rustc`；安装 Rust 之前就已打开的旧终端里 PATH 仍是旧的，
> 遇到 “不是内部或外部命令” 时重开终端即可，或在当前会话临时执行
> `$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`。

### 桌面端首次构建

- 第一次 `pnpm desktop:dev` / `pnpm desktop:build` 要联网从 crates.io 拉取依赖并全量编译，
  耗时明显长于之后的增量编译（本机实测依赖已全部下载，纯编译约 18s）。
- 若下载报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，
  说明当前终端的网络/代理拦住了 TLS，换一个普通终端或在代理放行 `static.crates.io` 后重试。

## 常用命令

```bash
pnpm install            # 安装前端依赖
pnpm dev                # 只在浏览器里预览界面（localStorage 模式）
pnpm build              # 类型检查 + 产出 dist/
pnpm check              # typecheck + SQL 迁移校验 + jsdom 交互冒烟测试
pnpm icons              # 重新生成 src-tauri/icons

pnpm desktop:dev        # 启动 Tauri 桌面窗口（需要 Rust 工具链）
pnpm desktop:build      # 打包桌面安装包
```

首次运行 `pnpm desktop:dev` 会编译 Rust 依赖，耗时较长；之后为增量编译。

### 自检脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | TypeScript 全量类型检查 |
| `pnpm check:config` | 校验 tauri.conf.json / 权限 / 图标是否齐备 |
| `pnpm check:sql` | 用 Node 内置 `node:sqlite` 在内存库里跑一遍全部迁移，打印各视图条数并演练排序回写、软删除/恢复、提醒标记、回收站超期清理 |
| `pnpm check:ui` | jsdom 中真实挂载 App，覆盖搜索、拖拽排序、重复任务、日期选择、回收站与撤销、内联重命名、键盘导航、提醒调度、提前量、导入导出（57 项断言） |

### 权限与窗口配置说明

- `src-tauri/capabilities/default.json` 里的 `sql:default` **只包含** `allow-load / allow-select / allow-close`，
  写入类操作必须额外声明 `sql:allow-execute`，否则 `db.execute` 会在运行时被权限系统拒绝。
- 到点提醒需要 `notification:default` 权限，否则 `sendNotification` 会被拒绝。
- `tauri.conf.json` 中窗口必须设置 `"dragDropEnabled": false`：该选项默认为 `true`，会在 Windows 上注册
  系统级文件拖放，从而**抢走前端的 HTML5 拖拽事件**，导致列表拖拽排序完全失效。
  以上都由 `pnpm check:config` 兜底校验（含 Cargo.toml 依赖与 lib.rs 插件/迁移注册），避免回归。

## 数据存储

- 数据库文件：Windows 为 `%APPDATA%\com.memobook.desktop\memo.db`（macOS/Linux 在对应的应用数据目录）
- 自动备份：`%APPDATA%\com.memobook.desktop\backups\memo-<时间戳>.json`，保留最近 7 份，启动时每天自动备一次
- 表：`folders`、`tasks`、`app_meta`
- 迁移：`src-tauri/migrations/*.sql`，由 `tauri-plugin-sql` 在启动时按版本执行，只执行一次
  - `0001_init.sql` 建表 + 示例数据
  - `0002_sort_and_repeat.sql` 手动排序 + 重复规则
  - `0003_reminder_and_trash.sql` 提醒记录 + 软删除
  - `0004_remind_before.sql` 提醒提前量
- 首次启动会写入 3 个文件夹与 13 条示例待办；"⋯" 菜单里可随时再次载入示例数据
- 删除是**软删除**：`deleted_at` 非空即进回收站，可恢复；超过 30 天启动时自动清理，「清空回收站」则立即 `DELETE`
- 导出的 JSON 是完整快照（含文件夹与回收站），导入为**只新增不覆盖**：文件夹按名称复用，待办以「标题 + 截止日期」判重

## 已实现

### v0.1 基础版

- 左侧导航：收件箱 / 今天 / 即将到来 / 已完成，实时计数
- 文件夹分类：工作、生活、学习，可新增自定义文件夹（自动分配配色）、可删除（任务回落为"未分类"）
- 中间列表：勾选完成、优先级色点、所属文件夹、截止日期（今天/逾期高亮）、已完成分组折叠
- 快速新增：直接在输入框回车连续添加；在文件夹视图新增会自动归入该文件夹，在"今天"视图会自动设为今天截止
- 右侧详情：任务说明（1000 字计数）、优先级（高红 / 中橙 / 低蓝）、所属文件夹、排期、截止日期、提醒时间、其他备注
- 排序：按创建时间 / 截止日期 / 优先级
- 其他：清除已完成、载入示例数据、删除待办、完成时间/创建时间戳

### v0.2 搜索 / 拖拽排序 / 重复任务

- **搜索**：列表头搜索框，匹配标题、任务说明与备注正文；结果计数显示在副标题上；`/` 或 `Ctrl+K` 唤起，`Esc` 清空
- **拖拽排序**：每条待办左侧都有拖拽手柄（hover 显示，手动排序模式下常显），任何排序模式下都能直接拖；
  松手时以"当前看到的顺序"为基准重排 `sort_order` 并自动切换为「手动排序」，列表不会整片跳动
- **重复任务**：详情面板可设置 每天 / 每周 / 每月；勾选完成时自动按规则生成下一次实例（排期按原提前量整体平移、提醒时间保留），本轮记录归档并停止重复，列表行显示重复图标
- 键盘：`/`、`Ctrl/Cmd+K` 聚焦搜索

### v0.3 提醒通知 / 回收站 / 交互体验

- **系统原生提醒**：应用内每 30 秒扫描一次，到点的待办由 `tauri-plugin-notification` 弹出系统通知（浏览器预览退化到 Web Notification）；
  已提醒的写 `notified_at` 防止重复弹；关闭期间错过的提醒在启动后 24 小时内补发，更早的只做标记不再打扰
- **回收站与撤销**：删除改为软删除，侧栏新增「回收站」（显示计数），可单条恢复或彻底删除、可一键清空；
  删除与"已完成移入回收站"的提示条上都带**撤销**按钮，5 秒内可反悔
- **双击重命名**：双击列表标题就地编辑，`Enter` 提交、`Esc` 取消（原先双击是"标记完成"，容易误触，已改为只走勾选框）
- **键盘导航**：`↑` `↓` 在列表中上下移动选中项，配合右侧详情面板可以纯键盘处理
- **跨天自动刷新**：心跳定时器让「今天 / 即将到来」与逾期高亮在跨零点后自动纠正，不再停留在昨天
- 快捷键新增：`5` 直达回收站

### v0.4 桌面化 / 数据安全 / 提醒提前量

- **托盘常驻**：点窗口关闭按钮不再退出，而是收进系统托盘（提醒继续生效，并弹一条通知说明）；
  左键点托盘图标唤出窗口，右键菜单提供 显示主窗口 / 快速新增待办 / 退出
- **单实例**：重复启动只会聚焦已有窗口，避免两条 SQLite 连接、提醒弹两次
- **全局快捷键**：`Ctrl/Cmd+Shift+Space` 在任何界面下唤出窗口并聚焦新增输入框
- **窗口状态记忆**：位置与大小由 `tauri-plugin-window-state` 自动保存恢复
- **数据导入导出**：`⋯` 菜单里可 导出为 JSON（完整快照）/ 导出为 Markdown（便于阅读粘贴）/ 从 JSON 导入；
  文件读写全部在 Rust 侧完成，前端不开放 fs 权限
- **自动备份**：启动时若距上次备份超过约 20 小时，自动写一份 JSON 到应用数据目录，保留最近 7 份（可手动「立即备份」）
- **回收站自动清理**：超过 30 天的软删除记录在启动时清除
- **提醒提前量**：详情面板新增「提前提醒」下拉（准时 / 5 / 15 / 30 分钟 / 1 小时 / 1 天），实际触发时刻 = 提醒时间 − 提前量
- **提醒唤起窗口**：到点提醒时若窗口处于最小化/托盘状态会自动唤出；用户正在别处工作时只弹通知、不抢焦点

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl/Cmd+Shift+Space` | 全局快捷键：唤出窗口并聚焦新增输入框（应用未前台时也生效） |
| `N` | 聚焦"新增待办"输入框 |
| `/` 或 `Ctrl/Cmd+K` | 聚焦搜索框 |
| `1` ~ `5` | 切换 收件箱 / 今天 / 即将到来 / 已完成 / 回收站 |
| `↑` `↓` | 在当前列表里上下移动选中项 |
| 双击标题 | 就地重命名（`Enter` 提交，`Esc` 取消） |
| `Enter` | 新增待办（可连续输入） |
| `Esc` | 清空搜索 / 关闭详情面板 / 取消输入 |

## 发布新版本

```powershell
# 1) 改版本号（package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml）
# 2) 提交并打标签
git tag -a v0.5.0 -m "我的记事簿 v0.5.0"
git push origin master v0.5.0
# 3) 打包（nsis 生成 .exe 安装器，msi 需要额外下载 WiX 工具链）
pnpm tauri build --bundles nsis
# 4) 写一份本版更新说明到 .release-notes.md（首次发布时必须存在；补传资产时可省略）
# 5) 发布：脚本会自动收集 bundle/nsis、bundle/msi 与 release/memo-book.exe 并改名上传
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release.ps1 -Version 0.5.0
```

`scripts/release.ps1` 说明：

- 复用本机 git 凭据（Git Credential Manager），**不需要安装 gh、也不读取任何环境变量里的 token**；
  token 只在进程内存与一个临时文件中存在，用完立即删除，从不打印
- 幂等：release 已存在时只补传缺失的资产，同名资产会跳过
- 依赖 Windows PowerShell 5.1，脚本文件需保存为 **UTF-8 with BOM**（否则中文会按 GBK 解析报语法错误）

## 后续规划

- 开机自启开关、自动更新（updater 插件）与安装包签名
- 子任务与清单模板；每 N 天 / 工作日重复
- 多选批量操作（批量改优先级、文件夹、删除）
- 全局搜索（跨视图）与命中片段高亮
- 深色主题（跟随系统）
- 列表虚拟滚动（数据量上千后）
