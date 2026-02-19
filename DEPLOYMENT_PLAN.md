# 📦 Deployment Plan - KSeF Desktop App

## Cel: Udostępnić aplikację do pobrania za darmo (Open Source + Free)

### Data Celowa: Poniedziałek 2026-02-10

---

## OPCJA A: Standalone .EXE Installer (SZYBCIEJ) ⚡

### ✅ CZYM JEST
- Plik `ksef-desktop-setup-1.0.0.exe`
- Pobierany z GitHub Releases
- Instaluje na `C:\Program Files\KSeF Desktop`
- Tworzy desktop shortcut
- Auto-update ready

### KROKI (4-5 GODZIN PRACY)

#### Krok 1: Przygotowanie Kodu (30 min)
```bash
# 1. Sprawdzić czy build działa
npm run build

# 2. Sprawdzić czy release folder jest tworzony
ls release/

# 3. Zaktualizować version w package.json
# Zmień: "version": "0.1.0" → "version": "1.0.0"
```

#### Krok 2: Konfiguracja Electron Builder (1 godzina)
**Plik:** `package.json` w sekcji `build`

```json
{
  "build": {
    "appId": "com.ksef-desktop",
    "productName": "KSeF Desktop",
    "directories": {
      "buildResources": "assets"
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "certificateFile": null,
      "certificatePassword": null
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "KSeF Desktop"
    }
  }
}
```

#### Krok 3: Build Aplikacji (30 min)
```bash
# Przejść do głównego folderu
cd G:\[CLAUDE]\KseF

# Zainstalować ostatnie deps
npm install

# Build dla Windows x64
npm run build

# Output: release/KSeF Desktop Setup 1.0.0.exe
```

#### Krok 4: Test Instalacji (30 min)
```bash
# 1. Uruchomić .exe
# 2. Zainstalować w domyślnej lokalizacji
# 3. Testować aplikację
# 4. Sprawdzić icon na desktop
# 5. Odinstalować i testować uninstall
```

#### Krok 5: Przesłanie na GitHub (20 min)

```bash
# Wersja tagu
git tag -a v1.0.0 -m "Release v1.0.0 - KSeF Desktop"
git push origin v1.0.0

# Skopiować .exe do release folder (localnie)
# Przesłać ręcznie przez GitHub UI: Settings → Releases → New Release
```

**GitHub Release Page:**
- Title: "KSeF Desktop v1.0.0"
- Description:
```
## 🎉 KSeF Desktop - Official Release

### ✨ Features
- 📥 Przeglądaj faktury odebrane
- 📤 Przeglądaj faktury wysłane
- 📊 Szczegółowy widok każdej faktury
- 💾 Pobieraj dane faktury w XML
- 🔐 Bezpieczne przechowywanie tokena (szyfrowanie AES-256)
- ⚙️ Łatwa konfiguracja

### 📥 Instalacja
1. Pobierz: `ksef-desktop-setup-1.0.0.exe`
2. Uruchom plik
3. Postępuj zgodnie z instrukcjami instalatora
4. Uruchom "KSeF Desktop" z menu Start

### 🔒 Bezpieczeństwo
- Token API szyfrowany AES-256
- HTTPS do KSeF API
- Żadne dane nie wysyłane do 3rd parties
- Open source - cały kod dostępny do audytu

### 📖 Dokumentacja
- [README.md](../README.md) - Instrukcja użytkownika
- [SECURITY.md](../SECURITY.md) - Informacje o bezpieczeństwie
- [GitHub](https://github.com/pawelsupel/ksef-desktop-app) - Kod źródłowy

### 💬 Feedback
Issues: https://github.com/pawelsupel/ksef-desktop-app/issues

License: Free & Open Source
```

---

## OPCJA B: Windows Store (DODATKOWO, DŁUGOTERMINOWO) 📱

### ⏳ KIEDY
Potem, jeśli Opcja A będzie popularna (2-3 tygodnie)

### CZYM JEST
- Aplikacja dostępna w Microsoft Store
- One-click install
- Automatyczne aktualizacje
- Większa widoczność

### WYMAGANIA
1. **Konto Microsoft Developer** ($19 one-time)
2. **Code Signing Certificate** ($60-300/rok)
   - Authenticode certificate
   - Podpisywanie .exe
3. **Electron Builder Config** dla Store
4. **Windows App Certification**

### KROKI (5-7 DNI PRACY)
1. Kupić developer account w Microsoft
2. Kupić code signing certificate
3. Zainstalować cert na komputerze
4. Skonfigurować Electron Builder dla Store build
5. Przesłać do Microsoft Store (review 24-48h)
6. Czekać na approval
7. Launch w Store

### KOSZT
- Developer: $19
- Code Signing: $60-300/rok
- **RAZEM:** ~$80-320 first year

---

## REKOMENDOWANA STRATEGIA 🎯

### FAZA 1: TERAZ (Poniedziałek 2026-02-10)
**Zrób:**
- ✅ Standalone .EXE installer
- ✅ GitHub Release page
- ✅ Instrukcja instalacji w README

**Czas:** 4-5 godzin
**Koszt:** ZERO
**Rezultat:** Aplikacja dostępna do pobrania za darmo!

### FAZA 2: JEŚLI BĘDZIE POPULARNY (Marzec 2026)
- Rozważyć Windows Store
- Zbierać feedback od użytkowników
- Dodać nowe features

---

## CHECKLIST PRE-RELEASE

### Kod
- [ ] Version updated: `package.json` → 1.0.0
- [ ] Build test: `npm run build` ✓
- [ ] Unit tests passing
- [ ] Security audit complete (SECURITY.md)
- [ ] No console.errors
- [ ] Environment variables documented

### Aplikacja
- [ ] Settings page works
- [ ] Invoices fetch correctly
- [ ] Modal opens/closes
- [ ] XML download works
- [ ] No memory leaks
- [ ] Responsive on different resolutions

### Dokumentacja
- [ ] README.md updated
- [ ] SECURITY.md complete
- [ ] .env.example created
- [ ] Installation steps clear
- [ ] Screenshots added (?)

### GitHub
- [ ] Repo public ✓
- [ ] License added (MIT or GPL)
- [ ] CONTRIBUTING.md (optional)
- [ ] Code of Conduct (optional)
- [ ] Release draft created

### .EXE Installer
- [ ] Build successful
- [ ] File size < 200MB
- [ ] Icon/branding added
- [ ] Test install on clean PC
- [ ] Test uninstall
- [ ] Shortcut created correctly

---

## IMPLEMENTACJA KROK PO KROKU

### TODO DZIŚ/JUTRO:

1. **Zaktualizować Version**
```bash
cd package.json
# Zmień version z 0.1.0 na 1.0.0
```

2. **Stworzyć .env.example**
```bash
# File: .env.example
KSEF_ENCRYPTION_KEY=generate-your-own-secure-key-here
KSeF_API_URL=https://api.ksef.mf.gov.pl
```

3. **Build i Test**
```bash
npm run build
# Testuj ./release/KSeF\ Desktop\ Setup\ 1.0.0.exe
```

4. **GitHub Release**
- Przejdź do: https://github.com/pawelsupel/ksef-desktop-app/releases/new
- Tag: v1.0.0
- Title: KSeF Desktop v1.0.0 - Public Release
- Description: (patrz wyżej)
- Upload: ksef-desktop-setup-1.0.0.exe
- Publish Release

---

## TIMELINE

| Zadanie | Czas | Status |
|---------|------|--------|
| Przygotowanie kodu | 1h | ⏳ TODO |
| Electron Builder config | 1h | ⏳ TODO |
| Build .exe | 30min | ⏳ TODO |
| Test instalacji | 1h | ⏳ TODO |
| GitHub Release | 30min | ⏳ TODO |
| **RAZEM** | **4h** | ⏳ TODO |

**Deadline:** Poniedziałek 2026-02-10, 18:00

---

## NOWE MOŻLIWOŚCI PO RELEASE

- Discord Bot do powiadomień o nowych wersjach
- Strona internetowa z demo
- YouTube tutorial
- Forum dla feedback
- Crowdfunding dla nowych features

---

**Strategia:** Najpierw Opcja A (szybko, za darmo), potem Opcja B (jeśli popularne).

Powodzenia! 🚀
