import { randomBytes } from 'node:crypto';

import {
  MIMOCODE_PROVIDER_ID,
  MIMOCODE_API_CONFIG,
  MIMOCODE_MODELS,
  MIMOCODE_BOOTSTRAP_CONFIG,
  injectSystemMarker,
  rewriteModelField,
  getRandomUserAgent,
  generateSessionAffinity,
} from './constants.js';
import { tokenManager } from './plugin/token-manager.js';
import { createDebugLogger } from './utils/debug-logger.js';

const debugLogger = createDebugLogger('PLUGIN');

export const MimocodeAuthPlugin = async (input: any) => {
  const client = input?.client;

  return {
    auth: {
      provider: MIMOCODE_PROVIDER_ID,

      loader: async (
        getAuth: any,
        provider: { models?: Record<string, { cost?: { input: number; output: number } }> },
      ) => {
        if (provider?.models) {
          for (const model of Object.values(provider.models)) {
            if (model) model.cost = { input: 0, output: 0 };
          }
        }

        let credentials = await tokenManager.getValidCredentials();

        if (!credentials?.jwt) {
          for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            credentials = await tokenManager.getValidCredentials();
            if (credentials?.jwt) break;
          }
        }

        debugLogger.info('Auth loader completed', { hasJwt: !!credentials?.jwt });

        return {
          apiKey: credentials?.jwt || 'pending-auth',
          baseURL: MIMOCODE_API_CONFIG.baseUrl,
          fetch: async (url: string, options: any = {}) => {
            let authRetryCount = 0;

            const executeRequest = async (): Promise<Response> => {
              const currentCreds = await tokenManager.getValidCredentials();
              const token = currentCreds?.jwt;

              if (!token) throw new Error('[MiMoCode] No JWT available. Please re-authenticate.');

              const mergedHeaders: Record<string, string> = {};

              if (options.headers) {
                if (typeof (options.headers as any).entries === 'function') {
                  for (const [k, v] of (options.headers as any).entries()) {
                    const kl = k.toLowerCase();
                    if (kl !== 'authorization' && kl !== 'user-agent') {
                      mergedHeaders[k] = v;
                    }
                  }
                } else {
                  for (const [k, v] of Object.entries(options.headers)) {
                    const kl = k.toLowerCase();
                    if (kl !== 'authorization' && kl !== 'user-agent') {
                      mergedHeaders[k] = v as string;
                    }
                  }
                }
              }

              mergedHeaders['Authorization'] = `Bearer ${token}`;
              mergedHeaders['X-Mimo-Source'] = MIMOCODE_BOOTSTRAP_CONFIG.sourceHeader;
              mergedHeaders['User-Agent'] = getRandomUserAgent();
              mergedHeaders['Accept'] = 'text/event-stream, application/json';
              mergedHeaders['x-session-affinity'] = generateSessionAffinity();

              let targetUrl = url;
              if (targetUrl.includes('/chat/completions')) {
                targetUrl = targetUrl.replace('/chat/completions', '/chat');
              }

              let requestBody: any = options.body;

              try {
                let parsed: any;
                if (typeof requestBody === 'string') {
                  parsed = JSON.parse(requestBody);
                } else if (requestBody instanceof Uint8Array) {
                  parsed = JSON.parse(new TextDecoder().decode(requestBody));
                } else if (requestBody instanceof ReadableStream) {
                  const reader = requestBody.getReader();
                  const chunks: Uint8Array[] = [];
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                  }
                  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
                  const combined = new Uint8Array(totalLen);
                  let offset = 0;
                  for (const c of chunks) { combined.set(c, offset); offset += c.length; }
                  parsed = JSON.parse(new TextDecoder().decode(combined));
                }

                if (parsed) {
                  parsed = rewriteModelField(parsed);
                  parsed = injectSystemMarker(parsed);
                  requestBody = JSON.stringify(parsed);
                }
              } catch (e) {
                debugLogger.warn('Failed to process request body', e);
              }

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), MIMOCODE_API_CONFIG.chatTimeout);

              let response: Response;
              try {
                response = await fetch(targetUrl, {
                  ...options,
                  body: requestBody,
                  headers: mergedHeaders,
                  signal: controller.signal,
                });
              } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
              }
              clearTimeout(timeoutId);

              if ((response.status === 401 || response.status === 403) && authRetryCount < 1) {
                authRetryCount++;
                debugLogger.warn(`Received ${response.status}, refreshing JWT and retrying`);
                const refreshed = await tokenManager.getValidCredentials(true);
                if (refreshed?.jwt) {
                  mergedHeaders['Authorization'] = `Bearer ${refreshed.jwt}`;
                  mergedHeaders['x-session-affinity'] = generateSessionAffinity();
                  const retryController = new AbortController();
                  const retryTimeoutId = setTimeout(() => retryController.abort(), MIMOCODE_API_CONFIG.chatTimeout);
                  try {
                    response = await fetch(targetUrl, {
                      ...options,
                      body: requestBody,
                      headers: mergedHeaders,
                      signal: retryController.signal,
                    });
                  } catch (fetchError) {
                    clearTimeout(retryTimeoutId);
                    throw fetchError;
                  }
                  clearTimeout(retryTimeoutId);
                }
              }

              if (response.status === 429) {
                const error: any = new Error(
                  '[MiMoCode] Rate limit reached (429). MiMo free API has strict rate limits — please wait a few minutes before trying again.'
                );
                error.status = 429;
                throw error;
              }

              if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                const error: any = new Error(`HTTP ${response.status}: ${errorText}`);
                error.status = response.status;
                throw error;
              }

              const contentType = response.headers.get('content-type') || '';
              if (!contentType.includes('text/event-stream')) {
                const bodyText = await response.text();
                let cleaned = bodyText.trim();
                if (cleaned.startsWith('data: ')) {
                  cleaned = cleaned.substring(6);
                }
                return new Response(cleaned, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: { 'Content-Type': 'application/json' },
                });
              }

              return response;
            };

            return executeRequest();
          }
        };
      },

      methods: [
        {
          type: 'oauth' as const,
          label: 'MiMoCode (MiMo Auto Free)',
          authorize: async () => {
            try {
              return {
                url: '',
                instructions: 'MiMoCode 免费模型 — 自动获取 JWT 中，无需登录...',
                method: 'auto' as const,
                callback: async () => {
                  try {
                    const credentials = await tokenManager.getValidCredentials(true);

                    if (!credentials?.jwt) {
                      return { type: 'failed' as const };
                    }

                    if (client?.auth?.set) {
                      try {
                        await client.auth.set({
                          providerID: MIMOCODE_PROVIDER_ID,
                          auth: {
                            type: "oauth",
                            access: credentials.jwt,
                            refresh: '',
                            expires: credentials.createdAt + credentials.expiresIn * 1000,
                          }
                        });
                      } catch (authError) {
                        debugLogger.warn('Failed to set auth in client', authError);
                      }
                    }

                    return {
                      type: 'success' as const,
                      access: credentials.jwt,
                      refresh: '',
                      expires: credentials.createdAt + credentials.expiresIn * 1000,
                    };
                  } catch (e) {
                    debugLogger.error('Auth callback failed', e);
                    return { type: 'failed' as const };
                  }
                },
              };
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Unknown error';
              return {
                url: '',
                instructions: `Error: ${msg}`,
                method: 'auto' as const,
                callback: async () => ({ type: 'failed' as const }),
              };
            }
          },
        },
      ],
    },

    config: async (config: Record<string, unknown>) => {
      const providers = (config.provider as Record<string, unknown>) || {};

      providers[MIMOCODE_PROVIDER_ID] = {
        npm: '@ai-sdk/openai-compatible',
        name: 'MiMoCode',
        options: {
          baseURL: MIMOCODE_API_CONFIG.baseUrl,
        },
        models: Object.fromEntries(
          Object.entries(MIMOCODE_MODELS).map(([id, m]) => {
            const caps = m.capabilities as { vision?: boolean } | undefined;
            const inputModalities = ['text'];
            if (caps?.vision) inputModalities.push('image');
            return [
              id,
              {
                id: m.id,
                name: m.name,
                reasoning: m.reasoning,
                limit: { context: m.contextWindow, output: m.maxOutput },
                cost: m.cost,
                modalities: {
                  input: inputModalities,
                  output: ['text']
                },
              },
            ];
          })
        ),
      };

      config.provider = providers;
    },
  };
};

export default MimocodeAuthPlugin;
