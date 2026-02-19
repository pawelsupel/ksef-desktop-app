import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ConfigService } from '../../services/config.service';
import { SanitizePipe } from '../../shared/pipes/sanitize.pipe';

@Component({
  selector: 'app-ksef-portal',
  standalone: true,
  imports: [CommonModule, RouterModule, SanitizePipe],
  templateUrl: './ksef-portal.component.html',
  styleUrl: './ksef-portal.component.scss'
})
export class KsefPortalComponent implements OnInit {
  kSefUrl: string = '';
  isLoaded = false;
  isLoggedIn = false;
  error: string | null = null;

  constructor(private configService: ConfigService) {}

  ngOnInit(): void {
    this.loadKSeFPortal();
  }

  /**
   * Ładuj portal KSeF poprzez backend proxy
   */
  private loadKSeFPortal(): void {
    // Sprawdź czy config istnieje przed załadowaniem iframe
    this.configService.getConfig().subscribe({
      next: (response: any) => {
        console.log('📖 Otrzymana konfiguracja:', response);

        if (!response || !response.success || !response.data) {
          this.error = 'Konfiguracja niedostępna. Przejdź do Ustawień.';
          this.isLoggedIn = false;
          return;
        }

        const config = response.data;

        if (!config.hasToken) {
          this.error = 'Token KSeF nie skonfigurowany. Przejdź do Ustawień.';
          this.isLoggedIn = false;
          return;
        }

        // Użyj backend HTTP proxy do załadowania rzeczywistego portalu KSeF
        // Backend usunie X-Frame-Options i zmodyfikuje linki zasobów
        this.kSefUrl = 'http://localhost:8765/api/ksef-portal/web/invoice-list';
        this.isLoggedIn = true;
        this.error = null;

        console.log('✓ KSeF Portal URL wygenerowany (backend proxy)');
      },
      error: (err) => {
        this.error = 'Błąd wczytywania konfiguracji: ' + err.message;
        this.isLoggedIn = false;
        console.error('❌ Błąd loadowania portalu:', err);
      },
    });
  }

  /**
   * Callback gdy iframe się załaduje
   */
  onIframeLoaded(): void {
    this.isLoaded = true;
    console.log('✓ KSeF Portal załadowany w iframe');
  }

  /**
   * Callback gdy iframe nie może się załadować
   */
  onIframeError(): void {
    console.error('❌ Błąd wczytywania iframe KSeF');
    this.error = 'Nie udało się załadować portalu KSeF. Sprawdź połączenie i spróbuj ponownie.';
    this.isLoaded = false;
  }

  /**
   * Odśwież portal
   */
  refresh(): void {
    this.isLoaded = false;
    this.loadKSeFPortal();
  }
}
