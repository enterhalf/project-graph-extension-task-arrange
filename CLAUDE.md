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