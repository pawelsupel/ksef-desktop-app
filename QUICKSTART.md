# 🚀 KSeF Desktop - Quick Start Guide

## Instalacja

1. Pobierz plik `KSeF Desktop Setup 1.0.3.exe` z folderu `release/`
2. Uruchom instalator i postępuj zgodnie z instrukcjami
3. Aplikacja zainstaluje się w `C:\Users\[YourUsername]\AppData\Local\Programs\KSeF Desktop`

## Uruchamianie Aplikacji

### WAŻNE: Backend musi być uruchomiony NAJPIERW!

Aplikacja wymaga, aby backend serwer Node.js działał na porcie 8765.

#### Opcja 1: Automatyczne uruchamianie (polecane)

1. **Z folderu projektu** uruchom plik: `start-backend.bat`
   ```
   start-backend.bat
   ```
   - Backend uruchomi się automatycznie
   - Będzie dostępny na: `http://localhost:8765`
   - Okno terminala pozostanie otwarte

2. **Teraz** uruchom aplikację KSeF Desktop z menu Start lub skrótu na pulpicie

#### Opcja 2: Ręczne uruchamianie

1. Otwórz terminal (Command Prompt lub PowerShell)
2. Przejdź do folderu projektu:
   ```bash
   cd C:\path\to\KSeF\src\backend
   ```
3. Uruchom backend:
   ```bash
   npm start
   ```
   Backend powinien pokazać:
   ```
   ✅ Backend server running on http://localhost:8765
   ```

4. W **nowym terminalu** uruchom aplikację:
   ```bash
   cd C:\path\to\KSeF
   npm start
   ```

## Konfiguracja

1. Po uruchomieniu aplikacji przejdź do **⚙️ Ustawienia**
2. Wpisz swoje dane KSeF:
   - **NIP** (bez myślników)
   - **Token** (jeśli masz) LUB
   - **Ścieżka do certyfikatu** (plik `.crt`)
   - **Hasło do certyfikatu** (jeśli jest szyfrowany)
3. Kliknij "Test Połączenia" aby sprawdzić konfigurację
4. Jeśli OK - kliknij "Zapisz"

## Użytkowanie

- **📥 Faktury Odebrane** - Pobierane faktury od dostawców
- **📤 Faktury Wysłane** - Faktury wysyłane do odbiorców
- **⚙️ Ustawienia** - Konfiguracja dostępu do KSeF

## Rozwiązywanie Problemów

### Błąd: "Cannot connect to API"

- Sprawdź czy backend jest uruchomiony (`start-backend.bat`)
- Sprawdź czy terminal z backendem jest otwarty
- Spróbuj wejść na http://localhost:8765/api/health w przeglądarce

### Błąd: "Connection refused"

- Terminal z backendem został zamknięty
- Uruchom `start-backend.bat` ponownie

### Błąd: "Invalid NIP/Token"

- Sprawdź czy dane w Ustawieniach są prawidłowe
- Sprawdź czy NIP jest bez myślników (np. `1234567890`)
- Kliknij "Test Połączenia" aby sprawdzić konfigurację

## Rozwój (Development)

Do uruchomienia w trybie developerskim:

```bash
# Terminal 1: Backend
cd src/backend
npm run dev

# Terminal 2: Frontend (Angular)
cd src/renderer
npm start

# Terminal 3: Electron
npm run dev:electron
```

## Gdzie szukać plików

- **Frontend:** `src/renderer/` (Angular 21)
- **Backend:** `src/backend/` (Node.js + Express)
- **Electron:** `src/main/` (główny proces)
- **Skompilowany kod:** `dist/`

Powodzenia! 🎉
