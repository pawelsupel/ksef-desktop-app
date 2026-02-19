import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ConfigService } from '../../services/config.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  settingsForm: FormGroup;
  authMethod: 'token' | 'certificate' = 'token';
  savedSuccessfully = false;
  isSaving = false;
  isTestingConnection = false;
  errorMessage: string | null = null;
  connectionStatus: 'idle' | 'testing' | 'success' | 'error' = 'idle';
  connectionMessage: string | null = null;
  private destroy$ = new Subject<void>();
  private tokenWasSaved = false; // Track if token was previously saved

  constructor(
    private fb: FormBuilder,
    private configService: ConfigService
  ) {
    this.settingsForm = this.fb.group({
      authMethod: ['token'],
      nip: [''],
      token: [''],
      certificatePath: [''],
      certificatePassword: [''],
    });
  }

  ngOnInit(): void {
    this.loadSettings();

    // Update form validators when auth method changes
    this.settingsForm.get('authMethod')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((method: string) => {
        this.updateValidators(method as 'token' | 'certificate');
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSettings(): void {
    // Fetch config from backend API
    this.configService.getConfig().subscribe(
      (response) => {
        if (response.success && response.data) {
          console.log('✓ Config loaded from backend:', response.data);

          // Track if token was previously saved
          this.tokenWasSaved = response.data.hasToken || false;

          // If token exists, show placeholder value to indicate it's saved
          // If no token, set empty string for user to enter new one
          const tokenValue = this.tokenWasSaved ? '***TOKEN_SAVED***' : '';

          this.settingsForm.patchValue({
            authMethod: response.data.authMethod || 'token',
            nip: response.data.nip || '',
            token: tokenValue,
            certificatePath: response.data.certificatePath || '',
            certificatePassword: response.data.certificatePassword || '',
          });
          this.authMethod = response.data.authMethod as 'token' | 'certificate';
          this.updateValidators(this.authMethod);
        } else {
          console.log('ℹ️ No saved configuration found');
          this.tokenWasSaved = false;
        }
      },
      (error) => {
        console.error('❌ Error loading config:', error);
      }
    );
  }

  updateValidators(method: 'token' | 'certificate'): void {
    this.authMethod = method;

    const tokenControl = this.settingsForm.get('token');
    const nipControl = this.settingsForm.get('nip');
    const certificateControl = this.settingsForm.get('certificatePath');
    const certPasswordControl = this.settingsForm.get('certificatePassword');

    if (method === 'token') {
      // Clear certificate fields when switching to token
      certificateControl?.reset();
      certPasswordControl?.reset();

      tokenControl?.setValidators([Validators.required]);
      nipControl?.clearValidators();
      certificateControl?.clearValidators();
      certPasswordControl?.clearValidators();
    } else {
      // Clear token field when switching to certificate
      tokenControl?.reset();
      nipControl?.reset();

      tokenControl?.clearValidators();
      nipControl?.clearValidators();
      certificateControl?.setValidators([Validators.required]);
      certPasswordControl?.clearValidators();
    }

    tokenControl?.updateValueAndValidity();
    nipControl?.updateValueAndValidity();
    certificateControl?.updateValueAndValidity();
    certPasswordControl?.updateValueAndValidity();
  }

  saveSettings(): void {
    if (!this.settingsForm.valid) {
      this.errorMessage = 'Please fill in all required fields';
      return;
    }

    this.isSaving = true;
    this.errorMessage = null;

    const formValue = this.settingsForm.value;

    // Check if user entered a new token or kept the placeholder
    const tokenValue = formValue.token || '';
    const isTokenPlaceholder = tokenValue === '***TOKEN_SAVED***';

    let configToSend: any = {
      authMethod: formValue.authMethod,
      token: isTokenPlaceholder ? '' : tokenValue, // Empty string = keep existing token
      certificatePath: formValue.certificatePath || '',
      certificatePassword: formValue.certificatePassword || '',
      nip: formValue.nip || '',
      skipTokenUpdate: isTokenPlaceholder && this.tokenWasSaved, // Flag: don't update token if placeholder
    };

    // Automatically extract NIP from token for token auth (only if it's a real token, not placeholder)
    if (configToSend.authMethod === 'token' && configToSend.token && !isTokenPlaceholder) {
      const tokenParts = configToSend.token.split('|');
      if (tokenParts.length >= 2) {
        const nipPart = tokenParts[1];
        configToSend.nip = nipPart.replace('nip-', '');
        console.log('✓ Extracted NIP from token:', configToSend.nip);
      }
    } else if (this.tokenWasSaved && isTokenPlaceholder) {
      console.log('ℹ️ Keeping previously saved token - not updating');
    }

    this.configService.saveConfig(configToSend).subscribe(
      (response) => {
        this.isSaving = false;
        if (response.success) {
          this.savedSuccessfully = true;
          // User can click "Test Connection" button manually if they want
          setTimeout(() => {
            this.savedSuccessfully = false;
          }, 3000);
        } else {
          this.errorMessage = response.message || 'Failed to save settings';
        }
      },
      (error) => {
        this.isSaving = false;
        this.errorMessage = 'Connection error. Make sure backend is running.';
        console.error('Error saving settings:', error);
      }
    );
  }

  testConnection(): void {
    this.isTestingConnection = true;
    this.connectionStatus = 'testing';
    this.connectionMessage = 'Testowanie połączenia...';

    this.configService.testConnection().subscribe(
      (response) => {
        this.isTestingConnection = false;
        if (response.success) {
          this.connectionStatus = 'success';
          this.connectionMessage = response.message || 'Połączono z KSeF ✓';
        } else {
          this.connectionStatus = 'error';
          this.connectionMessage = response.message || 'Błąd połączenia z KSeF';
        }
      },
      (error) => {
        this.isTestingConnection = false;
        this.connectionStatus = 'error';
        this.connectionMessage = 'Nie można połączyć się z backendem. Sprawdź czy aplikacja jest uruchomiona.';
        console.error('Error testing connection:', error);
      }
    );
  }

  onAuthMethodChange(method: string): void {
    this.settingsForm.patchValue({ authMethod: method });
  }
}
