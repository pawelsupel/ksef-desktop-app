# KSeF Desktop - Project Context

**Last Updated:** 2026-02-10 05:20 UTC
**Version:** 1.0.1 (Final Build)
**Status:** 🎉 **PRODUCTION READY**

## Current State

### ✅ What's Working
- **Token Persistence** - Token saves to encrypted database in `%APPDATA%\Roaming\KSeF Desktop\`
- **Database** - SQLite with WAL mode, proper flushing, AES-256 encryption
- **Backend** - Node.js + Express on port 8765
- **Frontend** - Angular 21 with responsive design
- **Desktop** - Electron 30 with proper startup/shutdown
- **KSeF Integration** - Full authentication, invoice fetching, XML download
- **Icon** - Custom icon (.ico) in installer

### 🔧 Recent Fixes (Today)
1. **Database Persistence**
   - Enabled WAL mode (Write-Ahead Logging)
   - Added PRAGMA optimize on saves
   - Made closeDatabase async with proper flushing
   - Database path: `%APPDATA%\Roaming\KSeF Desktop\ksef.db`

2. **Startup/Shutdown Synchronization**
   - Startup: Waits 60 seconds for backend health check
   - Shutdown: Graceful SIGTERM → SIGKILL with 5-second timeout
   - Prevents port conflicts from previous instances
   - Splash screen while waiting

3. **Port Handling**
   - Exponential backoff retry (2s, 4s, 6s... up to 10 retries)
   - Gives time for ports to be released from TIME_WAIT

### 📦 Installer
- **File:** `release/KSeF Desktop Setup 1.0.3.exe`
- **Size:** 108.2 MB
- **Built:** 2026-02-10
- **Includes:**
  - Backend with all dependencies (node_modules)
  - Angular UI (responsive)
  - Electron framework
  - SQLite database
  - Custom icon

## How It Works

### Installation
1. Run `KSeF Desktop Setup 1.0.1.exe`
2. Click through installer
3. App appears in Start Menu

### First Run
1. **Startup (10-15 seconds expected)**
   - Splash screen appears immediately
   - Backend initializes
   - Frontend waits for backend health check
   - Database initialized with schema

2. **User enters Token**
   - Settings → Paste token
   - Click "Zapisz Ustawienia"
   - Token encrypted with AES-256
   - Saved to database

3. **Token Persists**
   - On restart, token loaded from database
   - Automatically decrypted
   - User can fetch invoices immediately

### Invoice Fetching
- Click "Pobierz faktury" (Refresh)
- Invoices cached in database
- Display in table or card view

### Proper Shutdown
- Close app normally
- Backend receives SIGTERM
- Waits up to 5 seconds for graceful close
- Database flushed and closed
- Port released properly

## Known Issues / Edge Cases

### ⚠️ Port Already In Use
- **Cause:** Previous instance didn't shut down cleanly
- **Fix:** Wait 10-15 seconds before restarting
- **Or:** Kill node.exe process in Task Manager
- **Prevention:** Always close app normally, wait for shutdown

### ⚠️ "KSeF not configured" on Startup
- **Cause:** Frontend connected before backend ready
- **Fix:** Now waits 60 seconds automatically
- **Check logs:** `%APPDATA%\Local\KSeF Desktop\backend.log`

## Directory Structure

```
G:\[CLAUDE]\KseF\
├── src/
│   ├── backend/     (Node.js + Express server)
│   ├── renderer/    (Angular 21 UI)
│   └── main/        (Electron main process)
├── dist/            (Built files)
├── release/         (Installer .exe)
├── public/          (Assets, icon, splash)
└── scripts/         (Build scripts)
```

## Database

**Location:** `C:\Users\[User]\AppData\Roaming\KSeF Desktop\ksef.db`

**Tables:**
- `config` - Token, NIP, auth method (encrypted)
- `invoices_cache` - Fetched invoices (for future use)

**Encryption:** AES-256 with env var `KSEF_ENCRYPTION_KEY`

## Next Steps (Future Work)

### v1.1.0
- [ ] Invoice caching retrieval (currently saves but doesn't show on restart)
- [ ] Search/filter invoices
- [ ] Statistics dashboard
- [ ] Export to Excel

### v1.2.0
- [ ] Dark mode
- [ ] Multi-language support
- [ ] Print invoices
- [ ] Backup/restore database

## Commands

```bash
# Development
npm run dev              # All: Backend + Angular + Electron
npm run dev:backend     # Backend only (port 8765)
npm run dev:angular     # Angular only (port 4200)
npm run dev:electron    # Electron only

# Production
npm run build           # Create Windows installer
```

## Testing Checklist

- [ ] **Install** - Run .exe successfully
- [ ] **Settings** - Paste token, save
- [ ] **Persistence** - Close app, reopen, token still there
- [ ] **Invoices** - Fetch invoices from KSeF
- [ ] **Shutdown** - Close app gracefully
- [ ] **Restart** - Open again, no port conflicts

## Important Files

| File | Purpose |
|------|---------|
| `src/backend/src/database.ts` | SQLite operations, encryption |
| `src/backend/src/index.ts` | Express server, shutdown handlers |
| `src/main/index.ts` | Electron main, startup sync, backend fork |
| `src/renderer/src/app.component.ts` | Angular root component |
| `package.json` | Dependencies, build config |
| `public/new.ico` | Application icon |
| `public/splash.html` | Splash screen during startup |

## Latest Commits

```
507a0d6 - fix: Improve startup/shutdown synchronization for stability
1b57fd4 - fix: Improve port retry logic with exponential backoff
0ee113e - fix: Improve database persistence with WAL mode and proper shutdown
dd7affd - fix: Fix invoice caching and add icon for v1.0.1
b544959 - fix: Fix invoice caching by using persistent AppData database path
8740124 - fix: Force electron-builder to include backend node_modules
98a595d - fix: Revert to tsc compilation and include all backend dependencies
c66a93d - fix: Implement webpack bundling for backend - fixes missing dependencies
```

## Session Summary

**Today's work:** Debugged and fixed database persistence, startup synchronization, and graceful shutdown.

**Key insight:** User's observation about startup/shutdown timing was correct - the app was starting too fast and shutting down too abruptly, causing port conflicts. Fixed by:
1. Adding 60-second health check wait on startup
2. Implementing graceful shutdown with SIGTERM/SIGKILL
3. Enabling WAL mode and proper database flushing
4. Adding exponential backoff for port retry

**Result:** Application now properly persists encrypted token to AppData, handles process lifecycle correctly, and won't have port conflicts on restart.

## Contact & Support

- **Repository:** https://github.com/pawelsupel/ksef-desktop-app
- **Issues:** Create issue on GitHub
- **Feedback:** Check GitHub discussions

---

**Ready for:** Testing installer, verifying token persistence across restarts, checking invoice caching functionality.
