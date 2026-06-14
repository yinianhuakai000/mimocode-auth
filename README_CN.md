# mimocode-auth

[English](./README.md)

OpenCode 插件，接入 [MiMo Auto](https://api.xiaomimimo.com) 免费模型 — JWT 自动认证、SHA256 设备指纹、SSE 流式输出。

## 特性

- **完全免费**：无需 API Key，自动从 MiMo 免费 API 获取 JWT
- **1M 上下文 / 128K 输出**：完整的 `mimo-auto` 模型能力
- **推理 + 视觉**：支持思维链推理和图片输入
- **JWT 自动刷新**：解析 JWT payload 的 `exp` 字段精确判断过期，提前 5 分钟自动刷新
- **Bootstrap 降级**：JWT 获取失败时使用缓存继续工作
- **协议合规**：SHA256 设备指纹、`ses_<24ch>` 会话亲和性

## 前置条件

- 已安装 [OpenCode](https://opencode.ai)
- 已安装 [Bun](https://bun.sh) 或 Node.js 22+

## 安装

### 1. 克隆

```bash
git clone https://github.com/yinianhuakai000/mimocode-auth.git
cd mimocode-auth
```

### 2. 构建

```bash
npm install
npx bun build ./src/index.ts --outdir ./dist --target node --format esm
```

### 3. 部署到 OpenCode 插件目录

```bash
mkdir -p ~/.config/opencode/plugins/mimocode-auth
cp -r . ~/.config/opencode/plugins/mimocode-auth/mimocode-auth
```

### 4. 注册到 OpenCode 配置

编辑 `~/.config/opencode/opencode.json`，在 `plugin` 数组中添加插件路径：

```json
{
  "plugin": [
    "~/.config/opencode/plugins/mimocode-auth/mimocode-auth"
  ]
}
```

### 5. 连接

重启 OpenCode，然后执行：

```
/connect
```

选择 **MiMoCode (MiMo Auto Free)** — JWT 自动获取，无需登录。

## 使用说明

### 基本对话

连接成功后，直接在 OpenCode 中对话即可。`mimo-auto` 模型会作为可用 provider 出现。

### 切换模型

在 OpenCode 中执行：

```
/model mimocode:mimo-auto
```

### 重新连接

遇到认证错误或连接问题时：

```
/connect
```

再次选择 **MiMoCode (MiMo Auto Free)** 重新获取 JWT。

### 查看可用模型

```
/models
```

应能看到 `mimocode` provider 及 `mimo-auto` 模型。

### 调试模式

遇到问题时，开启调试日志查看详细信息：

```bash
OPENCODE_MIMOCODE_DEBUG=1 opencode
```

调试日志输出到 stderr，包括：
- Bootstrap 请求和 JWT 生命周期
- 请求 URL 重写（`/chat/completions` → `/chat`）
- Model 字段重写（剥离前缀）
- System marker 注入
- JWT 刷新和 401/403 重试

### 速率限制

MiMo 免费 API 有严格的速率限制。遇到 429 错误时：

- 等待几分钟后重试
- 插件会在 401/403 时自动刷新 JWT 重试一次
- 429 错误**不会**自动重试，需要等待

### 多轮对话

插件与 OpenCode 内置的对话管理配合使用，多轮上下文由 SDK 自动处理。

### 视觉（图片输入）

`mimo-auto` 支持图片输入。在 OpenCode 中可以粘贴或引用图片，模型会自动处理。

## 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `Cannot connect to API` | 插件未加载或 bundle 损坏 | 重新构建：`npx bun build ./src/index.ts --outdir ./dist --target node --format esm` |
| `HTTP 403: Illegal access` | 缺少 `X-Mimo-Source` 头或 JWT 过期 | 执行 `/connect` 重新认证 |
| `HTTP 429: Rate limit` | 请求过于频繁 | 等待几分钟后重试 |
| `No JWT available` | Bootstrap 失败且无缓存 JWT | 检查网络，然后执行 `/connect` |
| 插件未出现在 `/models` | 未在 `opencode.json` 中注册 | 检查配置文件中的插件路径 |
| bundle 中出现 `createRequire` 错误 | 源码中使用了 `require()` | 确保所有导入使用 ESM `import` 语句 |

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `OPENCODE_MIMOCODE_DEBUG` | `0` | 设为 `1` 开启调试日志输出到 stderr |
| `MIMOCODE_NO_SYSTEM_MARKER` | `0` | 设为 `1` 关闭 MiMoCode 系统提示注入 |

### 数据存储

| 文件 | 用途 |
|------|------|
| `~/.mimocode-auth/auth.json` | 缓存的 JWT 凭证 |
| `~/.mimocode-auth/fingerprint.txt` | 持久化的设备指纹 |
| `~/.mimocode-auth/client-id.txt` | Bootstrap 客户端 ID |

## 支持的模型

| 模型 ID | 上下文 | 最大输出 | 模态 |
|---------|--------|----------|------|
| `mimo-auto` | 1,000,000 | 128,000 | 文本 + 图片 |

## 工作原理

1. **Bootstrap**：`POST /api/free-ai/bootstrap`，携带 SHA256 设备指纹 → 获取 JWT（有效期约 1 小时）
2. **Chat**：`POST /api/free-ai/openai/chat`，携带 JWT + `X-Mimo-Source: mimocode-cli-free` 头
3. **自动刷新**：解析 JWT 过期时间，提前 5 分钟自动刷新
4. **重试**：遇到 401/403 时，自动重新获取 JWT 并重试一次

## 开发

```bash
# 类型检查
node node_modules/typescript/bin/tsc --noEmit

# 构建
npx bun build ./src/index.ts --outdir ./dist --target node --format esm

# 测试 bootstrap + chat
node test.mjs

# 性能对比 v1 vs v2
node benchmark.mjs
node benchmark-nonstream.mjs
```

## 项目结构

```
src/
├── index.ts                # 插件入口（auth loader, custom fetch, config）
├── constants.ts            # API 端点、模型定义、UA 轮换
├── types.ts                # TypeScript 接口
├── errors.ts               # 错误分类
├── mimocode/
│   ├── bootstrap.ts        # JWT 获取
│   ├── fingerprint.ts      # SHA256 设备指纹生成
│   └── jwt-utils.ts        # JWT payload exp 解析
├── plugin/
│   ├── token-manager.ts    # JWT 缓存 + 自动刷新 + 降级
│   └── auth.ts             # 凭证持久化
└── utils/
    └── debug-logger.ts     # 调试日志
```

## 许可证

MIT
