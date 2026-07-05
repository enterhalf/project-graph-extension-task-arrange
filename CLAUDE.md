# Task Arrange — 开发备忘

## 更新 metadata.msgpack

`metadata.msgpack` 是二进制 MessagePack 文件，**禁止用文本编辑器直接打开编辑**，否则结构字节会被破坏（`0x82`、`0xa7` 等会被替换为 `ef bf bd`）。

正确流程：

1. 编辑 `metadata.json`
2. 在项目根目录执行以下命令转换：

```bash
node -e "const fs=require('fs');const e=require('@msgpack/msgpack');const j=JSON.parse(fs.readFileSync('metadata.json','utf8'));fs.writeFileSync('metadata.msgpack',e.encode(j))"
```

## 打包发布

只选中这 4 个文件，右键压缩为 zip，改后缀为 `.prg`：

- `extension.js`
- `metadata.msgpack`
- `README.md`
- `icon.svg`

**不要打包** `node_modules/`、`package.json`、`*.prg`。
