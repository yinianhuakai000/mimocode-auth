import { MIMOCODE_BOOTSTRAP_CONFIG } from '../constants.js';
import { generateFingerprint } from './fingerprint.js';
import type { BootstrapResponse, MimoCredentials } from '../types.js';
import { MimoAuthError } from '../errors.js';
import { createDebugLogger } from '../utils/debug-logger.js';
import { parseJWTExp } from './jwt-utils.js';
import { loadClientId, saveClientId } from '../plugin/auth.js';

const debugLogger = createDebugLogger('BOOTSTRAP');

export async function performBootstrap(clientId?: string): Promise<MimoCredentials> {
  const cid = clientId || loadClientId() || generateFingerprint();

  debugLogger.info('Performing bootstrap', { clientId: cid.substring(0, 16) + '...' });

  let response: Response;
  try {
    response = await fetch(MIMOCODE_BOOTSTRAP_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client: cid }),
      signal: AbortSignal.timeout(MIMOCODE_BOOTSTRAP_CONFIG.timeout),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    debugLogger.error('Bootstrap network error', { error: msg });
    throw new MimoAuthError('bootstrap_failed', `Network error: ${msg}`);
  }

  if (response.status === 429) {
    debugLogger.warn('Bootstrap rate limited (429)');
    throw new MimoAuthError('rate_limit', 'Bootstrap rate limited');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    debugLogger.error('Bootstrap failed', { status: response.status, body: errorText });
    throw new MimoAuthError('bootstrap_failed', `HTTP ${response.status}: ${errorText}`);
  }

  let data: BootstrapResponse;
  try {
    data = await response.json() as BootstrapResponse;
  } catch {
    debugLogger.error('Bootstrap response parse error');
    throw new MimoAuthError('bootstrap_failed', 'Invalid JSON response from bootstrap');
  }

  if (!data.jwt) {
    debugLogger.error('Bootstrap response missing JWT');
    throw new MimoAuthError('bootstrap_failed', 'Bootstrap response missing JWT');
  }

  saveClientId(cid);

  const expMs = parseJWTExp(data.jwt);
  const expiresIn = Math.max(Math.floor((expMs - Date.now()) / 1000), 60);

  const credentials: MimoCredentials = {
    jwt: data.jwt,
    expiresIn,
    createdAt: Date.now(),
    clientId: cid,
  };

  debugLogger.info('Bootstrap successful', { expiresIn, expMs });

  return credentials;
}
