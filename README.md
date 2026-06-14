# mimocode-auth

[中文文档](./README_CN.md)

OpenCode plugin for [MiMo Auto](https://api.xiaomimimo.com) free model — JWT auto-auth, SHA256 device fingerprint, SSE streaming.

## Features

- **Free**: No API key needed, auto-bootstrap JWT from MiMo free API
- **1M context / 128K output**: Full `mimo-auto` model capabilities
- **Reasoning + Vision**: Supports chain-of-thought and image input
- **Auto JWT refresh**: Parses JWT payload `exp` for precise expiry, refreshes 5min before
- **Bootstrap fallback**: Uses cached JWT when bootstrap fails
- **Protocol-compliant**: SHA256 device fingerprint, `ses_<24ch>` session-affinity

## Prerequisites

- [OpenCode](https://opencode.ai) installed
- [Bun](https://bun.sh) or Node.js 22+

## Install

### 1. Clone

```bash
git clone https://github.com/yinianhuakai000/mimocode-auth.git
cd mimocode-auth
```

### 2. Build

```bash
npm install
npx bun build ./src/index.ts --outdir ./dist --target node --format esm
```

### 3. Deploy to OpenCode plugins

```bash
mkdir -p ~/.config/opencode/plugins/mimocode-auth
cp -r . ~/.config/opencode/plugins/mimocode-auth/mimocode-auth
```

### 4. Register in OpenCode config

Edit `~/.config/opencode/opencode.json`, add the plugin path to the `plugin` array:

```json
{
  "plugin": [
    "~/.config/opencode/plugins/mimocode-auth/mimocode-auth"
  ]
}
```

### 5. Connect

Restart OpenCode, then run:

```
/connect
```

Select **MiMoCode (MiMo Auto Free)** — JWT is auto-bootstrapped, no login needed.

## Usage

### Basic Chat

After connecting, just start chatting in OpenCode. The `mimo-auto` model will be available as a provider.

### Switch Model

In OpenCode, run:

```
/model mimocode:mimo-auto
```

### Reconnect

If you encounter auth errors or connection issues:

```
/connect
```

Select **MiMoCode (MiMo Auto Free)** again to re-bootstrap JWT.

### Check Available Models

```
/models
```

You should see `mimocode` provider with `mimo-auto` model listed.

### Debug Mode

If something goes wrong, enable debug logging to see what's happening:

```bash
OPENCODE_MIMOCODE_DEBUG=1 opencode
```

Debug logs will be printed to stderr, including:
- Bootstrap requests and JWT lifecycle
- Request URL rewriting (`/chat/completions` → `/chat`)
- Model field rewriting (strip prefix)
- System marker injection
- JWT refresh and retry on 401/403

### Rate Limiting

MiMo free API has strict rate limits. If you hit a 429 error:

- Wait a few minutes before trying again
- The plugin will automatically retry once on 401/403 (JWT refresh)
- 429 errors are **not** auto-retried — you must wait

### Multi-turn Conversations

The plugin works with OpenCode's built-in conversation management. Multi-turn context is handled automatically by the SDK.

### Vision (Image Input)

`mimo-auto` supports image input. In OpenCode, you can paste or reference images in your messages — the model will process them.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `Cannot connect to API` | Plugin not loaded or bundle broken | Rebuild: `npx bun build ./src/index.ts --outdir ./dist --target node --format esm` |
| `HTTP 403: Illegal access` | Missing `X-Mimo-Source` header or expired JWT | Run `/connect` to re-authenticate |
| `HTTP 429: Rate limit` | Too many requests | Wait a few minutes |
| `No JWT available` | Bootstrap failed and no cached JWT | Check network, then `/connect` |
| Plugin not showing in `/models` | Not registered in `opencode.json` | Verify plugin path in config |
| `createRequire` error in bundle | `require()` in source code | Ensure all imports are ESM `import` statements |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_MIMOCODE_DEBUG` | `0` | Set to `1` to enable debug logging to stderr |
| `MIMOCODE_NO_SYSTEM_MARKER` | `0` | Set to `1` to disable MiMoCode system prompt injection |

### Data Storage

| File | Purpose |
|------|---------|
| `~/.mimocode-auth/auth.json` | Cached JWT credentials |
| `~/.mimocode-auth/fingerprint.txt` | Persistent device fingerprint |
| `~/.mimocode-auth/client-id.txt` | Bootstrap client ID |

## Supported Models

| Model ID | Context | Max Output | Modalities |
|----------|---------|------------|------------|
| `mimo-auto` | 1,000,000 | 128,000 | Text + Image |

## How It Works

1. **Bootstrap**: `POST /api/free-ai/bootstrap` with SHA256 device fingerprint → get JWT (valid ~1h)
2. **Chat**: `POST /api/free-ai/openai/chat` with JWT + `X-Mimo-Source: mimocode-cli-free` header
3. **Auto refresh**: JWT parsed and refreshed 5 minutes before expiry
4. **Retry**: On 401/403, automatically re-bootstrap and retry once

## Development

```bash
# Type check
node node_modules/typescript/bin/tsc --noEmit

# Build
npx bun build ./src/index.ts --outdir ./dist --target node --format esm

# Test bootstrap + chat
node test.mjs

# Benchmark v1 vs v2
node benchmark.mjs
node benchmark-nonstream.mjs
```

## Project Structure

```
src/
├── index.ts                # Plugin entry (auth loader, custom fetch, config)
├── constants.ts            # API endpoints, model defs, UA rotation
├── types.ts                # TypeScript interfaces
├── errors.ts               # Error classification
├── mimocode/
│   ├── bootstrap.ts        # JWT bootstrap
│   ├── fingerprint.ts      # SHA256 device fingerprint generation
│   └── jwt-utils.ts        # JWT payload exp parsing
├── plugin/
│   ├── token-manager.ts    # JWT cache + auto refresh + fallback
│   └── auth.ts             # Credential persistence
└── utils/
    └── debug-logger.ts     # Debug logging
```

## License

MIT
