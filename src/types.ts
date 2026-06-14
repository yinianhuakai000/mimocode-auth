export interface MimoCredentials {
  jwt: string;
  expiresIn: number;
  createdAt: number;
  clientId: string;
}

export interface BootstrapResponse {
  jwt: string;
  exp?: number;
}
