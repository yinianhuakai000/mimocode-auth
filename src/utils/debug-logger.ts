type DebugNamespace = string;

export function createDebugLogger(namespace: DebugNamespace) {
  const isEnabled = () => process.env.OPENCODE_MIMOCODE_DEBUG === '1';

  return {
    info(message: string, data?: any) {
      if (!isEnabled()) return;
      const ts = new Date().toISOString();
      console.error(`[${ts}] [MiMoCode:${namespace}] INFO: ${message}`, data ?? '');
    },
    warn(message: string, data?: any) {
      if (!isEnabled()) return;
      const ts = new Date().toISOString();
      console.error(`[${ts}] [MiMoCode:${namespace}] WARN: ${message}`, data ?? '');
    },
    error(message: string, data?: any) {
      if (!isEnabled()) return;
      const ts = new Date().toISOString();
      console.error(`[${ts}] [MiMoCode:${namespace}] ERROR: ${message}`, data ?? '');
    },
    debug(message: string, data?: any) {
      if (!isEnabled()) return;
      const ts = new Date().toISOString();
      console.error(`[${ts}] [MiMoCode:${namespace}] DEBUG: ${message}`, data ?? '');
    },
  };
}
