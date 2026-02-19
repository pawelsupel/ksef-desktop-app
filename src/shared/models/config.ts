/**
 * Config model - konfiguracja integracji z KSeF
 */

export interface KSeFConfig {
  id?: string;
  authMethod: 'token' | 'certificate';
  token?: string;
  certificatePath?: string;
  certificatePassword?: string;
  apiUrl?: string; // KSeF API URL (default: https://ksef.mf.gov.pl)
  createdAt?: string;
  updatedAt?: string;
}

export interface ConfigResponse {
  success: boolean;
  message?: string;
  data?: KSeFConfig;
}

export interface AuthResponse {
  success: boolean;
  authenticated: boolean;
  message?: string;
  sessionId?: string;
}

export interface KSeFApiError {
  code: string;
  message: string;
  details?: any;
}
