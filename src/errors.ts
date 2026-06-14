const REAUTH_HINT =
  'Run "opencode auth login" and select "MiMoCode (MiMo Auto Free)" to re-authenticate.';

export type AuthErrorKind =
  | 'token_expired'
  | 'bootstrap_failed'
  | 'auth_required'
  | 'rate_limit'
  | 'network_error'
  | 'server_error';

const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  token_expired: `[MiMoCode] JWT expired. ${REAUTH_HINT}`,
  bootstrap_failed: `[MiMoCode] Bootstrap failed. ${REAUTH_HINT}`,
  auth_required: `[MiMoCode] Authentication required. ${REAUTH_HINT}`,
  rate_limit: '[MiMoCode] Rate limit reached (429). MiMo free API has strict rate limits — wait a few minutes before trying again.',
  network_error: '[MiMoCode] Network error. Please check your connection.',
  server_error: '[MiMoCode] MiMo server unavailable. Try again in a few minutes.',
};

export class MimoAuthError extends Error {
  public readonly kind: AuthErrorKind;
  public readonly technicalDetail?: string;

  constructor(kind: AuthErrorKind, technicalDetail?: string) {
    super(AUTH_MESSAGES[kind]);
    this.name = 'MimoAuthError';
    this.kind = kind;
    this.technicalDetail = technicalDetail;
  }
}
