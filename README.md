# KSeF Desktop – Community Continuation

This repository is a community-maintained continuation of the original
KSeF Desktop project created by Dawid Namyslak.

The project is further developed with the explicit permission
of the original author.

The goal of this continuation is to maintain and improve
the application for long-term stability, security and accessibility.

---

## 📌 Attribution

Original author:  
Dawid Namyslak  

Original project name:  
ksef-desktop-app  

Original code © 2025 Dawid Namyslak  

Modifications and ongoing maintenance © 2026 PIK Systems  

PIK Systems is not the original creator of this software.
This repository continues development with full attribution
and respect to the original author.

---

## 📜 License

This project is distributed with the permission of the original author.
License terms are defined in the LICENSE file.

# 🎉 KSeF Desktop v1.0.3

## ✨ Ostatnie ulepszenia (v1.0.3)

- 🔐 **SECURITY HARDENING:** Token nie jest już wstrzykiwany do HTML/LocalStorage portalu
- 🔐 **SECURITY HARDENING:** Zaostrzone CORS/CSP dla proxy portalu
- 🧾 **PDF FIX:** Poprawione parsowanie XML bez deklaracji `<?xml ...?>`
- 📥 **DOWNLOAD FIX:** Weryfikacja poprawności PDF/XML przed zapisem

---

## 🔴 Ważne - v1.0.2 zawiera krytyczne poprawki bezpieczeństwa!

**Jeśli używałeś v1.0.1, proszę:**
1. ⚠️ **Zresetuj swój token KSeF** na https://ap.ksef.mf.gov.pl (Settings → API Tokens)
2. ✅ Zaktualizuj do v1.0.2 natychmiast
3. 🔑 Postępuj zgodnie z nową instrukcją konfiguracji encryption key poniżej

## ✨ Ostatnie ulepszenia (v1.0.2)

- 🔐 **SECURITY FIX:** Usunięty hardcoded encryption key (wymagany env var)
- 🔐 **SECURITY FIX:** Baza danych NIE jest już w instalatorze
- 🔐 **SECURITY FIX:** Wzmocniony .gitignore
- ✅ **Cachowanie faktur** - faktury pamiętane po ponownym uruchomieniu
- ✅ **Własna ikona** w instalatorze i pasku zadań
- ✅ Naprawione persystencja danych w bazie
- ✅ Lepsze logowanie błędów

## ✨ Pełny feature set

- ✅ Aplikacja desktopowa Windows (.exe installer)
- ✅ Pobieranie faktur odebranych i wysłanych z KSeF
- ✅ Podgląd szczegółów faktury w modalnym oknie
- ✅ Pobieranie danych w formacie XML
- ✅ Generowanie PDF faktur
- ✅ **AES-256 encryption** dla bezpieczeństwa
- ✅ Cachowanie faktur w bazie SQLite
- ✅ Widoczny status tokenu - zielona etykieta gdy token jest zapisany
- ✅ Responsywny, nowoczesny interfejs
- ✅ Responsywny design (desktop, tablet, mobile)

## 📥 Instalacja
## 🚀 **Szybki Start** (5 minut)

### 1. Pobierz i zainstaluj
1. Idź do [GitHub Releases](https://github.com/pawelsupel/ksef-desktop-app/releases)
2. Pobierz `KSeF Desktop Setup 1.0.3.exe` (ostatnia wersja)
3. Uruchom plik `.exe`
4. **Ważne!** Przy pierwszym uruchomieniu Windows może wyświetlić ostrzeżenie „Nieznany wydawca":
   - Kliknij **Więcej informacji**
   - Kliknij **Uruchom mimo to**
5. Postępuj zgodnie z kreatorem instalacji
6. Aplikacja pojawi się w Menu Start

**Wymagania:** Windows 10+ (64-bit)
**Rozmiar:** ~109 MB
**Wersja:** 1.0.3

### 2. Konfiguracja encryption key (AUTOMATYCZNA!)

✅ **DOBRE WIEŚCI!** Od v1.0.2 encryption key jest generowany **automatycznie** przy pierwszym uruchomieniu!

Aplikacja:
- 🔑 **Automatycznie wygeneruje** silny klucz (32 znaki w base64)
- 💾 **Zapisze go** w pliku `.env` w folderze `C:\Users\[YourUsername]\AppData\Roaming\KSeF Desktop\`
- 🔒 Będzie używać tego klucza dla wszystkich operacji szyfrowania

**Dla zwykłych użytkowników:** Nie musisz nic robić! 🎉

**Dla zaawansowanych użytkowników** (którzy chcą swój klucz):

Postępuj zgodnie z instrukcjami dla Twojego systemu operacyjnego:

#### Windows - Command Prompt (CMD)
```cmd
REM Wygeneruj klucz (skopiuj cały output):
powershell -Command "[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))"

REM Skopiuj wygenerowany klucz i ustaw zmienną:
set KSEF_ENCRYPTION_KEY=twoj-klucz-tutaj-paste-caly-output

REM Uruchom aplikację:
"C:\Users\%USERNAME%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\KSeF Desktop.lnk"
```

#### Windows - PowerShell
```powershell
# Wygeneruj klucz:
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))

# Ustaw zmienną:
$env:KSEF_ENCRYPTION_KEY='twoj-klucz-tutaj'

# Uruchom aplikację z Menu Start
```

#### Alternatywa - Plik .env (ŁATWIEJ)
Zamiast ustawiać zmienną środowiskową, możesz stworzyć plik `.env`:

1. Otwórz Notatnik (Notepad)
2. Paste poniższy tekst:
```
KSEF_ENCRYPTION_KEY=wygeneruj-klucz-i-wklej-tutaj
```
3. Zapisz plik jako `C:\Users\[TwojaUsername]\AppData\Roaming\KSeF Desktop\.env`
4. Uruchom aplikację

### 3. Pierwsze uruchomienie
1. Otwórz **KSeF Desktop** z Menu Start
2. Kliknij **⚙️ Ustawienia** (dół menu po lewej)
3. Wklej swój **Token API KSeF** (dostaniesz go w portalu KSeF)
4. Kliknij **Zapisz Ustawienia** aby sprawdzić połączenie
5. Jeśli OK → możesz używać aplikacji! i odbierac faktury

## 📖 Instrukcje

Szczegółowe instrukcje i FAQ: https://github.com/pawelsupel/ksef-desktop-app#readme

## 🔐 Bezpieczeństwo

- ✅ **Lokalnie przechowywane** - wszystkie dane na Twoim komputerze (AppData folder)
- ✅ **AES-256 encryption** - token i hasła zaszyfrowane w bazie
- ✅ **Encryption key** - generujesz lokalnie, nigdy nie wysyłany
- ✅ **Token nigdy nie wysyłany** - przechowywany tylko lokalnie, zaszyfrowany
- ✅ **HTTPS mTLS** - bezpieczne połączenie z KSeF
- ✅ **Sandbox** - frontend oddzielony od backendu
- ✅ **Otwarty kod źródłowy** - możesz sprawdzić bezpieczeństwo na GitHub'ie
- ✅ **Brak telemetrii** - żadne dane nie są wysyłane poza KSeF
- ✅ **v1.0.2 fixes** - baza danych NIE jest w instalatorze, brak hardcoded keys

### Gdzie są moje dane?
```
C:\Users\[YourUsername]\AppData\Roaming\KSeF Desktop\
└── ksef.db               # Baza danych z twoimi fakturami (szyfrowana)
```

## 📞 Wsparcie & Feedback

- 🐛 [Zgłoś błąd](https://github.com/pawelsupel/ksef-desktop-app/issues)
- 💡 [Sugestia nowej funkcji](https://github.com/pawelsupel/ksef-desktop-app/issues)
- 📧 [LinkedIn](https://www.linkedin.com/in/dawid-namyslak/)

---

## 📋 Szczegóły Techniczne

### Wymagania
- **Windows 10+** (64-bit)
- **Połączenie internetowe** do KSeF API
- **Token API KSeF** (dostępny w portalu)

### Tech Stack
- **Frontend:** Angular 21
- **Backend:** Node.js 22 + Express
- **Desktop:** Electron 30
- **Database:** SQLite 3 (lokalnie)
- **Encryption:** AES-256


## ❓ FAQ

### Czy moja dane są bezpieczne?
**TAK.** Wszystkie dane są:
- Przechowywane **lokalnie** na Twoim komputerze
- Szyfrowane **AES-256** w bazie danych
- Nigdy nie wysyłane do żadnego serwera (poza KSeF)
- Token nigdy nie wyświetlany w aplikacji

### Jak uzyskać Token API KSeF?
1. Zaloguj się na [ap.ksef.mf.gov.pl](https://ap.ksef.mf.gov.pl)
2. Przejdź do sekcji "Integracje"
3. Wygeneruj nowy token API
4. Skopiuj token (format: `YYYMMDD-EC-XXXXXXXXXX|nip-NUMER|...`)
5. Wklej w aplikacji

### Czy potrzebuję połączenia internetowego?
**TAK.** Aplikacja wymaga połączenia do:
- Portalu KSeF (pobieranie faktur)
- Internetu (weryfikacja tokenu)

Dane są cachowane lokalnie.

### Czy mogę to uruchomić na Mac/Linux?
Aktualnie tylko Windows. Możesz jednak budować z kodu źródłowego (patrz poniżej).

### Czy faktury są cachowane?
**TAK!** Od v1.0.1+:
- ✅ Faktury są pamiętane po zamknięciu aplikacji
- ✅ Przy ponownym uruchomieniu zostaną załadowane z cache
- ✅ Możesz kliknąć "Odśwież" aby pobrać najnowsze

### Co to jest KSEF_ENCRYPTION_KEY?
To klucz szyfrujący do ochrony Twoich danych lokalnych:
- **Po co?** Aby szyfrować Token API KSeF i inne wrażliwe dane w bazie
- **Jak ustawić?** Patrz sekcja "Konfiguracja encryption key" powyżej
- **Czy jest bezpieczny?** TAK - generujesz go lokalnie, nigdy nie wysyłamy go nikam
- **Co jeśli go zapomnę?** Baza danych będzie niezabezpieczona - ustaw nowy klucz

### Dlaczego v1.0.2 wymaga encryption key?
W v1.0.1 klucz był hardcoded w kodzie źródłowym. Było to niebezpieczne!
- 🔴 Ktoś mógł zobaczyć klucz na GitHub
- 🔴 Wszyscy użytkownicy używali tego samego klucza
- 🔐 W v1.0.2 każdy użytkownik ma **własny** silny klucz (automatycznie wygenerowany)
- 🔐 To znacznie zwiększa bezpieczeństwo!

### Czy aplikacja automatycznie generuje klucz?
**TAK!** Od v1.0.2:
- ✅ Przy pierwszym uruchomieniu aplikacja wygeneruje losowy klucz
- ✅ Klucz zostanie zapisany w `.env` pliku w folderze AppData
- ✅ Nie musisz nic robić - wszystko jest automatyczne!
- ✅ Klucz będzie używany dla wszystkich przyszłych operacji

Jeśli chcesz zmienić klucz (np. dla lepszego bezpieczeństwa):
1. Edytuj plik `.env` w `C:\Users\[YourUsername]\AppData\Roaming\KSeF Desktop\`
2. Wygeneruj nowy klucz (instrukcje powyżej)
3. Zamień wartość w `.env` pliku
4. Restart aplikacji


## 🛠️ Dla Developerów

Chcesz budować aplikację z kodu źródłowego lub go modyfikować?

### Wymagania
- Node.js 22.20+
- npm 10+
- Windows 10+ (do buildowania .exe) lub Linux/Mac (dla kodu)

### Instalacja zależności
```bash
npm install
cd src/backend && npm install && cd ../..
cd src/renderer && npm install && cd ../..
```

### Konfiguracja zmiennych środowiskowych
Utwórz plik `.env` w root folderu:
```bash
# Wymagane!
KSEF_ENCRYPTION_KEY=generuj-silny-klucz-32-znakowy-w-base64

# Opcjonalne:
KSEF_DB_DIR=C:\path\to\your\database  # Custom database directory
```

Wygeneruj silny klucz:
```powershell
# PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

### Uruchomienie dev mode
```bash
npm run dev              # Wszystko: Backend + Angular + Electron
npm run dev:backend      # Tylko backend (port 8765)
npm run dev:angular      # Tylko Angular (port 4200)
npm run dev:electron     # Tylko Electron
```

### Build .exe
```bash
# Ustaw encryption key przed buildem!
set KSEF_ENCRYPTION_KEY=twoj-klucz-tutaj

# Zbuduj:
npm run build            # Tworzy installer w folderze release/
```

### Commit do GitHub
- Nigdy nie commituj `.env` (dodane do .gitignore)
- Nigdy nie commituj token.md z `.idea/` folderu
- Nigdy nie commituj `.db` plików z bazą danych
- Wszystkie sensitive data automatycznie ignorowane!

## 🚀 Plany na przyszłość

- [x] Pobieranie faktur w formacie XML ✅
- [x] Generowanie PDF faktur ✅
- [x] AES-256 encryption dla tokenu ✅
- [x] Wskaźnik statusu tokenu w UI ✅
- [ ] Wyszukiwanie i filtrowanie faktur
- [ ] Statystyki i raporty z faktur
- [ ] Dark mode / Theme switcher
- [ ] Export do Excel
