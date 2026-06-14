import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, writeFileSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import type { MimoCredentials } from '../types.js';

export function getCredentialsDir(): string {
  if (process.env.MIMOCODE_TEST_CREDS_DIR) {
    return process.env.MIMOCODE_TEST_CREDS_DIR;
  }
  return join(homedir(), '.mimocode-auth');
}

export function getCredentialsPath(): string {
  return join(getCredentialsDir(), 'auth.json');
}

export function getClientIdPath(): string {
  return join(getCredentialsDir(), 'client-id.txt');
}

export function loadClientId(): string | null {
  const path = getClientIdPath();
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function saveClientId(clientId: string): void {
  const path = getClientIdPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, clientId, 'utf8');
}

export function loadCredentials(): MimoCredentials | null {
  const credPath = getCredentialsPath();
  if (!existsSync(credPath)) return null;

  try {
    const content = readFileSync(credPath, 'utf8');
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return null;
    if (!data.jwt || typeof data.jwt !== 'string') return null;
    if (!data.createdAt || typeof data.createdAt !== 'number') return null;
    return {
      jwt: data.jwt,
      expiresIn: data.expiresIn || 3600,
      createdAt: data.createdAt,
      clientId: data.clientId || '',
    };
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: MimoCredentials): void {
  const credPath = getCredentialsPath();
  const dir = dirname(credPath);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const data = {
    jwt: credentials.jwt,
    expiresIn: credentials.expiresIn,
    createdAt: credentials.createdAt,
    clientId: credentials.clientId,
  };

  const tempPath = `${credPath}.tmp.${randomUUID()}`;

  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2));
    renameSync(tempPath, credPath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {}
    throw error;
  }
}
