import { hostname, homedir, cpus, userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { createDebugLogger } from '../utils/debug-logger.js';

const debugLogger = createDebugLogger('FINGERPRINT');

function getCredentialsDir(): string {
  if (process.env.MIMOCODE_TEST_CREDS_DIR) {
    return process.env.MIMOCODE_TEST_CREDS_DIR;
  }
  return join(homedir(), '.mimocode-auth');
}

function getFingerprintPath(): string {
  return join(getCredentialsDir(), 'fingerprint.txt');
}

function detectCPU(): string {
  try {
    const cpuList = cpus();
    if (cpuList && cpuList.length > 0 && cpuList[0].model) {
      return cpuList[0].model;
    }
  } catch {}
  return 'unknown-cpu';
}

function detectUsername(): string {
  try {
    return userInfo().username || 'unknown-user';
  } catch {
    return 'unknown-user';
  }
}

function computeFingerprint(): string {
  const h = hostname() || 'unknown-host';
  const p = process.platform || 'unknown-platform';
  const a = process.arch || 'unknown-arch';
  const c = detectCPU();
  const u = detectUsername();

  const seed = `${h}|${p}|${a}|${c}|${u}`;
  const fp = createHash('sha256').update(seed).digest('hex');

  debugLogger.info('Computed fingerprint', { seed: seed.substring(0, 40) + '...', fingerprint: fp.substring(0, 16) + '...' });
  return fp;
}

export function generateFingerprint(): string {
  const fpPath = getFingerprintPath();

  if (existsSync(fpPath)) {
    try {
      const cached = readFileSync(fpPath, 'utf8').trim();
      if (cached && cached.length === 64) {
        debugLogger.info('Loaded cached fingerprint', { fingerprint: cached.substring(0, 16) + '...' });
        return cached;
      }
    } catch {}
  }

  const fp = computeFingerprint();

  try {
    const dir = dirname(fpPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fpPath, fp, 'utf8');
  } catch (e) {
    debugLogger.warn('Failed to persist fingerprint', e);
  }

  return fp;
}
