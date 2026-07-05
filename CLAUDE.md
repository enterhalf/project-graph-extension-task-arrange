# Task Arrange — 开发备忘

## 更新 metadata.msgpack

`metadata.msgpack` 是二进制 MessagePack 文件，**禁止用文本编辑器直接打开编辑**，否则结构字节会被破坏（`0x82`、`0xa7` 等会被替换为 `ef bf bd`）。

正确流程：

1. 编辑 `metadata.json`
2. 在项目根目录执行以下命令转换：

```bash
node -e "const fs=require('fs');const e=require('@msgpack/msgpack');const j=JSON.parse(fs.readFileSync('metadata.json','utf8'));fs.writeFileSync('metadata.msgpack',e.encode(j))"
```

## 发布流程

1. 推送代码到 main 分支
2. 打 tag：`git tag vx.x.x && git push origin vx.x.x`
3. GitHub Actions 自动打包 `.prg` 并创建 Release
4. CI 会自动将 tag 版本号（去掉 v）注入 `metadata.json` 再生成 `metadata.msgpack`，打包时只取这 4 个文件：
   - `extension.js`
   - `metadata.msgpack`
   - `README.md`
   - `icon.svg`

## README 编写原则

- 用户只关心：插件做什么、怎么用、快捷键是什么
- 不要写实现细节，核心概念说清楚即可

## Project Graph 源码关键目录

源码位于 `D:\pg-debug\project-graph`，monorepo 结构（pnpm + Nx），以下是与插件开发相关的目录：

| 目录 | 用途 |
|------|------|
| `app/src/core/stage/stageManager/` | **StageManager API** — 插件通过 `prg.tabs_getCurrentProject()` → `project.stageManager` 获取，提供节点/边的增删改查、选择、颜色等全部操作 |
| `app/src/core/stage/stageObject/` | **Stage 对象模型** — Node（TextNode）、Edge（LineEdge/ArcEdge）的属性和方法定义 |
| `app/src/core/stage/stageObject/association/` | **边类型** — LineEdge 和 ArcEdge，关键的 `lineType` 属性（`"solid"` / `"dashed"` / `"double"`）在此定义 |
| `app/src/core/render/canvas2d/` | **Canvas 2D 渲染** — 虚线渲染（`setLineDash`）、贝塞尔曲线、双线等渲染逻辑 |
| `app/src/core/extension/` | **扩展系统** — Comlink 代理机制，插件通过此层与宿主通信 |
| `app/src/core/service/controlService/shortcutKeysEngine/` | **快捷键注册** — `prg.keybinds_register()` 的底层实现，可参考已注册的快捷键格式 |
| `packages/extprg-types/` | **扩展 API 类型声明**（自动生成）— 包含 `prg.*` 所有可用方法的 TypeScript 类型 |
| `packages/data-structures/` | **基础类型** — `Color`（`{_: "Color", r, g, b, a?}`）、`Vector` 等 |

### 边（Edge）的关键属性

- `.source` / `.target` — 两端节点引用
- `.lineType` — 线型：`"solid"`（默认）、`"dashed"`（虚线）、`"double"`（双线）
- 虚线边在树检测/自动布局中被视为"非结构边"（`skipDashed` 参数跳过），不参与树拓扑计算

### StageManager 常用方法速查

- `getTextNodes()` / `getEdges()` — 获取所有文本节点/边
- `getSelectedEntities()` — 获取当前选中
- `getEntitiesByUUIDs(uuids)` — 按 UUID 批量获取
- `clearSelectAll()` — 清除选择
- `setSelectedEdgeLineType(type)` — 批量设置选中边的线型