export interface AccessTokenRequest {
  readonly prompt?: "" | "consent" | "select_account";
  readonly interactive?: boolean;
}

export interface AccessTokenProvider {
  getAccessToken(request?: AccessTokenRequest): Promise<string>;
  invalidateAccessToken?(): void;
  revoke?(): Promise<void>;
}
