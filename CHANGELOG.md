# Changelog

## [1.0.1] - 2026-02-10

### ✨ Nowe funkcje
- ✅ Własna ikona aplikacji (.ico)
- ✅ Lepsze logowanie debugowe
- 🔄 Prace nad cachowaniem faktur (w toku)

### 🐛 Poprawki
- ✅ Baza danych SQLite - struktura przygotowana (w `%APPDATA%/KSeF Desktop/`)
- ✅ Naprawiono ścieżkę bazy danych
- ✅ Poprawione włączanie node_modules do instalatora
- ✅ Naprawiono integrację backendu z Electronem

### ⏳ Wciąż w toku
- 🔄 Cachowanie faktur - funkcjonalność bazy danych przygotowana, ale persystencja wymaga dodatkowych testów

### 🔧 Zmiany techniczne
- Przesunięto bazę danych z `process.cwd()` do `%APPDATA%/KSeF Desktop/`
- Dodano `extraFiles` konfiguracji w electron-builderze dla pewnego włączenia node_modules
- Dodano `NODE_PATH` environment variable przy uruchamianiu backendu
- Ulepszono obsługę błędów cachowania

### 📊 Rozmiar
- Instalator: 108.2 MB

---

## [1.0.0] - 2026-02-09

### ✨ Funkcje
- ✅ Pobieranie faktur odebranych i wysłanych z KSeF
- ✅ Podgląd szczegółów faktury w modalnym oknie
- ✅ Pobieranie danych w formacie XML
- ✅ Generowanie PDF faktur
- ✅ AES-256 encryption dla bezpieczeństwa
- ✅ Windows .exe installer
- ✅ Responsywny interfejs
- ✅ Wskaźnik statusu tokenu

### 🔧 Architektura
- **Frontend:** Angular 21
- **Backend:** Node.js + Express
- **Desktop:** Electron 30
- **Database:** SQLite 3
- **Encryption:** AES-256

### 🔒 Bezpieczeństwo
- ✅ AES-256 encryption dla tokenu i haseł
- ✅ Dane przechowywane lokalnie
- ✅ Token nigdy nie wysyłany poza KSeF
- ✅ HTTPS mTLS do KSeF API
- ✅ Brak telemetrii

### 📊 Rozmiar
- Instalator: 113.5 MB

---

## Planowanie na przyszłość

### V1.1.0
- [ ] Wyszukiwanie i filtrowanie faktur
- [ ] Statystyki i raporty
- [ ] Export do Excel
- [ ] Kopie zapasowe bazy danych

### V1.2.0
- [ ] Dark mode / Theme switcher
- [ ] Wielojęzyczność (PL, EN, DE)
- [ ] Recall ostatnie 100 faktur
- [ ] Drukowanie bezpośrednio z aplikacji

### V2.0.0 (przyszłość)
- [ ] Wsparcie Mac/Linux
- [ ] Synchronizacja z chmurą (opcjonalnie)
- [ ] Mobile app (Android/iOS)
- [ ] WebAssembly wersja w przeglądarce
