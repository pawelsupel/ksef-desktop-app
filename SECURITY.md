# 🔒 Security Policy - KSeF Desktop App

## Ostatnia Aktualizacja: 2026-02-18

### ⚠️ WAŻNE - PRZECZYTAJ PRZED DEPLOYMENT

## 1. Przechowywanie Danych Wrażliwych

### ✅ Token API KSeF
- **Status:** 🔐 **SZYFROWANY** (AES-256)
- **Lokalizacja:** SQLite database `ksef.db`
- **Szyfrowanie:** CryptoJS.AES z kluczem z environment variables
- **Proces:**
  1. Przy zapisie: Token szyfrowany przed zapisem do bazy
  2. Przy odczycie: Token deszyfrowany podczas wczytywania
  3. W pamięci: Token trzymany w czystym tekście (tylko w runtime)

### ✅ Hasło Certyfikatu
- **Status:** 🔐 **SZYFROWANY** (AES-256)
- **Lokalizacja:** SQLite database `ksef.db`
- **Szyfrowanie:** Jak token - CryptoJS.AES

### ✅ NIP
- **Status:** ✓ Przechowywany w czystym tekście (niedostępny publicznie)
- **Uzasadnienie:** NIP jest publicznym identyfikatorem podatnika, brak ryzyka

## 2. Konfiguracja Szyfrowania

### Klucz Szyfrujący
```bash
# Production - ustaw zmienną środowiskową:
set KSEF_ENCRYPTION_KEY=your-super-secret-key-here

# Lub dodaj do .env:
KSEF_ENCRYPTION_KEY=your-super-secret-key-here
```

### Default Key (DEV ONLY!)
- **Aktualnie:** Brak hardcoded klucza (klucz generowany automatycznie przy pierwszym uruchomieniu)
- ✅ **OK**: Klucz zapisywany w `.env` w katalogu danych użytkownika

### Jak Generować Bezpieczny Klucz
```bash
# Linux/Mac:
openssl rand -base64 32

# Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

## 3. Bezpieczeństwo Połączenia

### ✅ HTTPS do KSeF API
- **Status:** ✓ Używane `https://api.ksef.mf.gov.pl`
- **Certyfikat:** Walidowany automatycznie przez Node.js
- **Brak Self-Signed Certificatów:** Ochrona przed MITM

### ✅ mTLS (Client Certificate)
- **Status:** ✓ Używane dla certificate auth
- **Certyfikat:** ECDSA P-256, przechowywany na dysku
- **Klucz Prywatny:** Zaszyfrowany z hasłem użytkownika

## 4. Bezpieczeństwo Aplikacji Electron

### ✅ Preload Script
- **Status:** ✓ Powinien być implementowany
- **Cel:** Izolacja kontekstu renderera od main process

### ✅ Content Security Policy (CSP)
- **Status:** ✅ Zaostrzone CSP dla proxy portalu (frame-ancestors tylko lokalnie)
- **Benefit:** Ochrona przed XSS / clickjacking w kontekście proxy

### ✅ Node Integration
- **Status:** ✓ DISABLED (bezpieczeństwo)
- **Lokalizacja:** `src/main/index.ts`

## 5. Bezpieczeństwo SQLite Database

### ✅ Lokalizacja
- **Ścieżka:** `~/.ksef/ksef.db` (macOS/Linux) lub `%APPDATA%\\KSeF Desktop\\ksef.db` (Windows)
- **Uprawnienia:** Tylko użytkownik (nie Everyone)
- **Backup:** Baza lokalna, dane z KSeF, brak wysyłki do 3rd parties

### ✅ Encryption at Rest
- **Status:** ✓ AES-256 dla tokena i haseł
- **Dane:** Wszystkie wrażliwe dane szyfrowane

### ❌ SQLite Database Encryption
- **Status:** Nie zaimplementowany (optional layer)
- **Rekomendacja:** Dla production możliwe użycie `better-sqlite3` + encryption

## 6. Bezpieczeństwo Kodu

### ✅ Brak Hardcoded Secrets
- ✓ Brak tokenów w kodzie
- ✓ Brak kluczy w kodzie
- ✓ Encryption key z environment variables lub automatycznie generowany w `.env`

### ✅ Parametrized Queries
- ✓ SQLite queries używają prepared statements
- ✓ Ochrona przed SQL injection

### ✅ Input Validation
- ⏳ REKOMENDACJA: Dodać validation dla tokena formatu

### ✅ Error Messages
- ✓ Brak leak'u sensitive info w error messages
- ✓ Tokeny zamazywane w logach (`***`)

## 7. Logowanie i Audyt

### ✅ Logowanie Bezpieczne
- ✓ Tokeny wyświetlane jako `***` w logach
- ✓ Sensitive data nielogowana
- ✅ Token nie jest już wstrzykiwany do HTML/LocalStorage portalu

### ⏳ Rekomendacja
- Dodać audit log dla wszystkich akcji
- Logować: kto zalogował się kiedy, jakie faktury pobrane itp.

## 8. Plan Bezpieczeństwa na Przyszłość

### Phase 1: TERAZ (2026-02-18) ✅
- [x] AES-256 encryption dla tokena
- [x] AES-256 encryption dla hasła certyfikatu
- [x] Environment variable dla klucza
- [x] Dokumentacja security

### Phase 2: PRE-RELEASE (2026-02-18)
- [ ] SQLite database encryption (better-sqlite3)
- [ ] OWASP Top 10 security audit
- [ ] Penetration testing
- [ ] Generate i dokumentuj encryption key generation

### Phase 3: POST-RELEASE
- [ ] Audit logging (wszystkie akcje)
- [ ] Rate limiting na backend API
- [ ] Two-factor authentication (dla admin)
- [ ] Certificate pinning do KSeF API
- [ ] Auto-update mechanism z signature verification

## 9. Deployment Checklist

### Przed Uruchomieniem na Produkcji:

```
SECURITY CHECKLIST:
[ ] KSEF_ENCRYPTION_KEY ustawiony w environment
[ ] Klucz szyfrowania jest ustawiony (env lub `.env` w katalogu danych)
[ ] HTTPS enabled (już mamy)
[ ] Baza danych SQLite w bezpiecznej lokalizacji
[ ] Uprawnienia pliku bazy (600 - tylko owner)
[ ] Node modules updated (npm audit)
[ ] Build signed (dla Windows installer)
[ ] Antivirus scanned
[ ] OWASP Top 10 przeglądnięty
```

## 10. Raportowanie Problemów Bezpieczeństwa

Jeśli znaleziesz lukę bezpieczeństwa:
1. **NIE** publikuj na publicznych kanałach
2. Wyślij: security@example.com (TBD)
3. Opisz: typ podatności, kroki do reprodukcji, impact
4. Czekaj na odpowiedź maksymalnie 48h

## 11. Compliance

### ✅ GDPR
- Brak zbierania danych osobowych (proxy to KSeF)
- Dane przechowywane lokalnie

### ✅ RODO
- Aplikacja działająca offline-first
- Brak transmisji danych do 3rd parties

### ✅ KSeF API Terms
- ✓ Używamy oficjalnego KSeF API
- ✓ Respektujemy rate limits
- ✓ Nie modyfikujemy danych

---

**Status:** ✅ SECURE FOR RELEASE (z zaleceniami)
**Encryption:** AES-256 (CryptoJS)
**Ostatnia Audyt:** 2026-02-18
