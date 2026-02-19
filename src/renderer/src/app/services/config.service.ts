import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface KSeFConfig {
  authMethod: 'token' | 'certificate';
  nip?: string;
  token?: string;
  certificatePath?: string;
  certificatePassword?: string;
}

interface ConfigResponse {
  success: boolean;
  message?: string;
  data?: {
    authMethod: string;
    nip?: string;
    token?: string;
    hasToken?: boolean;
    certificatePath?: string;
    certificatePassword?: string;
    apiUrl?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private apiUrl = 'http://localhost:8765/api';
  private configSubject = new BehaviorSubject<KSeFConfig | null>(null);
  public config$ = this.configSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfig();
  }

  // Load configuration from backend
  loadConfig(): void {
    this.getConfig().subscribe(
      (response: ConfigResponse) => {
        if (response.success && response.data) {
          const config: KSeFConfig = {
            authMethod: (response.data.authMethod as 'token' | 'certificate') || 'token',
          };
          this.configSubject.next(config);
        }
      },
      (error) => {
        console.error('Error loading config:', error);
      }
    );
  }

  // Get configuration
  getConfig(): Observable<ConfigResponse> {
    return this.http.get<ConfigResponse>(`${this.apiUrl}/config`).pipe(
      catchError((error) => {
        console.error('Error fetching config:', error);
        return of({ success: false, message: 'Error fetching config' });
      })
    );
  }

  // Save configuration
  saveConfig(config: KSeFConfig): Observable<ConfigResponse> {
    const payload = {
      authMethod: config.authMethod,
      nip: config.nip || null,
      token: config.token || null,
      certificatePath: config.certificatePath || null,
      certificatePassword: config.certificatePassword || null,
    };

    return this.http.post<ConfigResponse>(`${this.apiUrl}/config/save`, payload).pipe(
      tap((response: ConfigResponse) => {
        if (response.success) {
          this.configSubject.next(config);
        }
      }),
      catchError((error) => {
        console.error('Error saving config:', error);
        return of({ success: false, message: 'Error saving config' });
      })
    );
  }

  // Test connection to KSeF
  testConnection(): Observable<ConfigResponse> {
    return this.http.post<ConfigResponse>(`${this.apiUrl}/config/test-connection`, {}).pipe(
      catchError((error) => {
        console.error('Error testing connection:', error);
        return of({ success: false, message: 'Błąd testowania połączenia' });
      })
    );
  }

  // Get current config value
  getCurrentConfig(): KSeFConfig | null {
    return this.configSubject.value;
  }

  // Check if configured
  isConfigured(): boolean {
    const config = this.configSubject.value;
    return config !== null && config.authMethod !== null;
  }
}
