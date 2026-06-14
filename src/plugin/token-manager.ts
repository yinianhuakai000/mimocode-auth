import { loadCredentials, saveCredentials, getCredentialsPath } from './auth.js';
import type { MimoCredentials } from '../types.js';
import { MIMOCODE_JWT_REFRESH_BUFFER_MS } from '../constants.js';
import { performBootstrap } from '../mimocode/bootstrap.js';
import { createDebugLogger } from '../utils/debug-logger.js';
import { parseJWTExp } from '../mimocode/jwt-utils.js';
import { existsSync, watch } from 'node:fs';

const debugLogger = createDebugLogger('TOKEN_MANAGER');

interface CacheState {
  credentials: MimoCredentials | null;
  lastCheck: number;
}

class TokenManager {
  private memoryCache: CacheState = {
    credentials: null,
    lastCheck: 0,
  };

  constructor() {
    this.initializeFileWatcher();
  }

  private initializeFileWatcher(): void {
    const credPath = getCredentialsPath();

    try {
      if (existsSync(credPath)) {
        watch(credPath, (eventType) => {
          if (eventType === 'change') {
            this.invalidateCache();
            debugLogger.info('Credentials file changed, cache invalidated');
          }
        });
      }
    } catch (error) {
      debugLogger.debug('File watcher failed to initialize', error);
    }
  }

  private invalidateCache(): void {
    this.memoryCache = {
      credentials: null,
      lastCheck: 0,
    };
  }

  private isJwtExpired(credentials: MimoCredentials): boolean {
    const expMs = parseJWTExp(credentials.jwt);
    const now = Date.now();
    return now >= (expMs - MIMOCODE_JWT_REFRESH_BUFFER_MS);
  }

  async getValidCredentials(forceRefresh = false): Promise<MimoCredentials | null> {
    try {
      if (!forceRefresh && this.memoryCache.credentials && this.memoryCache.lastCheck > 0) {
        if (!this.isJwtExpired(this.memoryCache.credentials)) {
          return this.memoryCache.credentials;
        }
        debugLogger.info('Cached JWT expired, refreshing');
      }

      if (!forceRefresh) {
        const fromFile = loadCredentials();
        if (fromFile && !this.isJwtExpired(fromFile)) {
          this.memoryCache = {
            credentials: fromFile,
            lastCheck: Date.now(),
          };
          return fromFile;
        }
        if (fromFile) {
          debugLogger.info('Stored JWT expired, re-bootstrapping');
        }
      }

      try {
        const clientId = this.memoryCache.credentials?.clientId || loadCredentials()?.clientId || undefined;
        const newCreds = await performBootstrap(clientId);
        this.setCredentials(newCreds);
        debugLogger.info('JWT refreshed via bootstrap');
        return newCreds;
      } catch (bootstrapError) {
        debugLogger.error('Bootstrap refresh failed', bootstrapError);

        if (!forceRefresh) {
          const cached = this.memoryCache.credentials || loadCredentials();
          if (cached) {
            debugLogger.warn('Using cached JWT (may be expired) due to bootstrap failure');
            return cached;
          }
        }

        return null;
      }
    } catch (error) {
      debugLogger.error('Failed to get valid credentials', error);
      return null;
    }
  }

  clearCache(): void {
    this.memoryCache = {
      credentials: null,
      lastCheck: 0,
    };
  }

  setCredentials(credentials: MimoCredentials): void {
    this.memoryCache = {
      credentials,
      lastCheck: Date.now(),
    };
    saveCredentials(credentials);
  }
}

export { TokenManager };
export const tokenManager = new TokenManager();
