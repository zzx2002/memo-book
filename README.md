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
│  │  ├─ TaskList.tsx            # 中间列表：视图头、排序、新增、已完成分组
│  │  ├─ TaskRow.tsx             # 单条待办：勾选、优先级点、文件夹、截止日期
│  │  ├─ AddInput.tsx            # 快速新增（回车连续添加）
│  │  ├─ DetailPanel.tsx         # 右侧详情：说明、优先级、文件夹、排期/截止/提醒、备注
│  │  ├─ Dropdown.tsx            # 固定定位下拉菜单
│  │  └─ Icon.tsx                # 内联 SVG 图标
│  ├─ state/AppContext.tsx       # 全局状态、统计、筛选排序、快捷键
│  └─ lib
│     ├─ dates.ts                # 日期格式化（4月25日 (周五)）
│     ├─ constants.ts            # 优先级 / 文件夹配色 / 视图 / 排序常量
│     ├─ seed.ts                 # 示例数据（与设计稿一致）
│     └─ repo/{index,sqlite,local}.ts
├─ src-tauri
│  ├─ src/lib.rs                 # 注册 sql 插件与迁移
│  ├─ migrations/0001_init.sql   # 建表 + 示例数据
│  ├─ capabilities/default.json  # 权限：core:default + sql:default
│  ├─ icons/                     # 由 scripts/gen-icons.mjs 生成
│  └─ tauri.conf.json
└─ scripts/gen-icons.mjs         # 零依赖生成 PNG/ICO 图标
```

## 环境要求

- Node.js ≥ 18（推荐 20/22）与 pnpm
- Rust ≥ 1.77（`rustup` 安装）—— **本机当前未安装，运行桌面端前需要先装**
- Windows：WebView2 运行时（Win10/11 通常自带）+ MSVC 生成工具

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
| `pnpm check:sql` | 用 Node 内置 `node:sqlite` 在内存库里跑一遍迁移脚本，打印各视图条数 |
| `pnpm check:ui` | jsdom 中真实挂载 App，验证载入 8+5 条、勾选完成、视图切换、回车新增、持久化 |

### 权限说明

`src-tauri/capabilities/default.json` 里的 `sql:default` **只包含** `allow-load / allow-select / allow-close`，
写入类操作必须额外声明 `sql:allow-execute`，否则 `db.execute` 会在运行时被权限系统拒绝。

## 数据存储

- 数据库文件：Windows 为 `%APPDATA%\com.memobook.desktop\memo.db`（macOS/Linux 在对应的应用数据目录）
- 表：`folders`、`tasks`、`app_meta`
- 迁移：`src-tauri/migrations/*.sql`，由 `tauri-plugin-sql` 在启动时按版本执行，只执行一次
- 首次启动会写入 3 个文件夹与 13 条示例待办；"⋯" 菜单里可随时再次载入示例数据

## 已实现（第一版）

- 左侧导航：收件箱 / 今天 / 即将到来 / 已完成，实时计数
- 文件夹分类：工作、生活、学习，可新增自定义文件夹（自动分配配色）、可删除（任务回落为"未分类"）
- 中间列表：勾选完成、优先级色点、所属文件夹、截止日期（今天/逾期高亮）、已完成分组折叠
- 快速新增：直接在输入框回车连续添加；在文件夹视图新增会自动归入该文件夹，在"今天"视图会自动设为今天截止
- 右侧详情：任务说明（1000 字计数）、优先级（高红 / 中橙 / 低蓝）、所属文件夹、排期、截止日期、提醒时间、其他备注
- 排序：按创建时间 / 截止日期 / 优先级
- 其他：清除已完成、载入示例数据、删除待办、完成时间/创建时间戳

### 快捷键

| 按键 | 作用 |
| --- | --- |
| `N` | 聚焦"新增待办"输入框 |
| `1` `2` `3` `4` | 切换 收件箱 / 今天 / 即将到来 / 已完成 |
| `Enter` | 新增待办（可连续输入） |
| `Esc` | 关闭详情面板 / 取消输入 |

## 后续规划

- 搜索（标题 + 说明全文）
- 拖拽排序与手动排序字段
- 重复任务（每天 / 每周 / 每月）
- 系统原生提醒通知（Tauri notification 插件）
- 数据导入导出与多端同步
- 深色主题
