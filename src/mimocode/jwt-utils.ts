export function parseJWTExp(jwt: string): number {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    return Date.now() + 50 * 60 * 1000;
  }

  try {
    let payload = parts[1];
    const pad = payload.length % 4;
    if (pad) {
      payload += '='.repeat(4 - pad);
    }
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    const claims = JSON.parse(decoded);
    if (typeof claims.exp === 'number') {
      return claims.exp * 1000;
    }
  } catch {}

  return Date.now() + 50 * 60 * 1000;
}
