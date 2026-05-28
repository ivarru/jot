export interface AccessTokenRequest {
  readonly prompt?: "" | "consent" | "select_account";
}

export interface AccessTokenProvider {
  getAccessToken(request?: AccessTokenRequest): Promise<string>;
  revoke?(): Promise<void>;
}
