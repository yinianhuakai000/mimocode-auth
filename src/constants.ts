export const MIMOCODE_PROVIDER_ID = 'mimocode';

export const MIMOCODE_BOOTSTRAP_CONFIG = {
  apiUrl: 'https://api.xiaomimimo.com/api/free-ai/bootstrap',
  sourceHeader: 'mimocode-cli-free',
  timeout: 15_000,
} as const;

export const MIMOCODE_API_CONFIG = {
  baseUrl: 'https://api.xiaomimimo.com/api/free-ai/openai',
  chatEndpoint: '/chat',
  chatTimeout: 300_000,
  maxRequestBody: 1 << 20,
  maxResponseBody: 5 << 20,
} as const;

export const MIMOCODE_MODELS = {
  'mimo-auto': {
    id: 'mimo-auto',
    name: 'mimo-auto',
    contextWindow: 1048576,
    maxOutput: 131072,
    description: 'MiMo Auto 免费模型 — 1M 上下文，128K 输出，支持推理和工具调用',
    reasoning: true,
    capabilities: { vision: true },
    cost: { input: 0, output: 0 },
  },
} as const;

export const MIMOCODE_JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const MIMO_SYSTEM_MARKER =
  "You are MiMoCode, an interactive CLI tool that helps users with software engineering tasks.";

export const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function generateSessionAffinity(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ses_';
  for (let i = 0; i < 24; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function rewriteModelField(body: Record<string, unknown>): Record<string, unknown> {
  const model = body.model;
  if (typeof model === 'string' && model.includes('/')) {
    return { ...body, model: model.split('/').pop() };
  }
  return body;
}

export function injectSystemMarker(body: Record<string, unknown>): Record<string, unknown> {
  if (process.env.MIMOCODE_NO_SYSTEM_MARKER === '1') return body;

  const messages = body.messages;
  if (!Array.isArray(messages)) return body;

  const hasMarker = messages.some(
    (m: any) =>
      m != null &&
      typeof m === 'object' &&
      m.role === 'system' &&
      typeof m.content === 'string' &&
      m.content.includes(MIMO_SYSTEM_MARKER)
  );
  if (hasMarker) return body;

  return { ...body, messages: [{ role: 'system', content: MIMO_SYSTEM_MARKER }, ...messages] };
}
