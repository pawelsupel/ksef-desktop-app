import { app, BrowserWindow, Menu, globalShortcut, shell } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';
import http from 'http';
import { fork } from 'child_process';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let backendProcess: any = null;

/**
 * Start backend server on port 8765
 */
const startBackendServer = async (): Promise<void> => {
  if (isDev) {
    console.log('⏭️ Dev mode - backend runs separately');
    return;
  }

  const appPath = app.getAppPath();

  // Log file for backend output (create early for error logging)
  const logFile = path.join(app.getPath('userData'), 'backend.log');
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n=== Backend started at ${new Date().toISOString()} ===\n`);
  console.log('📝 Backend logs: ' + logFile);

  // Try multiple possible paths for backend
  // In packaged app: dist/backend/dist/index.js (tsc compiled)
  // In dev mode: src/backend/dist/index.js
  const possiblePaths = [
    path.join(appPath, 'dist/backend/dist/index.js'),      // Packaged app (tsc compiled)
    path.join(appPath, 'src/backend/dist/index.js'),       // Dev mode
    path.join(appPath, 'backend/dist/index.js'),
    path.join(appPath, '../src/backend/dist/index.js'),
  ];

  // For packaged app, node_modules may be in extraResources
  // Create symlink if needed from app to resources
  const backendDepsInResources = path.join(appPath, '..', 'dist/backend/node_modules');
  const backendNodeModulesPath = path.join(appPath, 'dist/backend/node_modules');
  if (!require('fs').existsSync(backendNodeModulesPath) && require('fs').existsSync(backendDepsInResources)) {
    console.log('📁 Creating symlink to backend node_modules...');
    try {
      require('fs').symlinkSync(backendDepsInResources, backendNodeModulesPath, 'dir');
    } catch (e) {
      // Symlink might fail on some systems, that's ok - will try junction
      try {
        require('fs').symlinkSync(backendDepsInResources, backendNodeModulesPath, 'junction');
      } catch (e2) {
        console.warn('⚠️ Could not create symlink/junction, backend modules may not be found');
      }
    }
  }

  let backendPath = '';
  let backendDir = '';

  for (const p of possiblePaths) {
    const dir = path.dirname(p);
    console.log(`📍 Checking: ${p}`);
    if (require('fs').existsSync(p)) {
      backendPath = p;
      backendDir = path.join(dir, '..');
      console.log(`✓ Found backend at: ${backendPath}`);
      break;
    }
  }

  if (!backendPath) {
    console.error('❌❌❌ BACKEND NOT FOUND ❌❌❌');
    console.error('App path:', appPath);
    console.error('Checked paths:', possiblePaths);
    console.error('');
    console.error('Backend files should be in:');
    console.error('  ' + path.join(appPath, 'src/backend/dist/index.js'));
    console.error('OR');
    console.error('  ' + path.join(appPath, 'backend/dist/index.js'));
    logStream.write(`❌ BACKEND NOT FOUND\nApp path: ${appPath}\nChecked: ${possiblePaths.join(', ')}\n`);
    throw new Error('Backend executable not found - files not properly packaged');
  }

  console.log('🚀 Starting backend server from:', backendPath);
  console.log('📁 Backend working directory:', backendDir);

  // Use fork() to load backend as Node.js module
  // This uses Electron's bundled Node.js instead of trying to find external node.exe
  try {
    const nodeModulesPath = path.join(backendDir, 'node_modules');
    backendProcess = fork(backendPath, [], {
      cwd: backendDir,
      silent: true, // Capture stdout/stderr
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NODE_PATH: nodeModulesPath
      },
    });

    // Pipe backend output to file and console
    backendProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      console.log('[Backend]', msg);
      logStream.write(`[stdout] ${msg}`);
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      console.error('[Backend Error]', msg);
      logStream.write(`[stderr] ${msg}`);
    });
  } catch (err) {
    const errMsg = `Failed to fork backend process: ${err}`;
    console.error('❌ ' + errMsg);
    logStream.write(`[error] ${errMsg}\n`);
    throw err;
  }

  backendProcess.on('error', (error: any) => {
    console.error('❌ Backend process error:', error);
    logStream.write(`[error] ${JSON.stringify(error)}\n`);
  });

  backendProcess.on('exit', (code: number) => {
    console.warn(`⚠️ Backend process exited with code ${code}`);
    logStream.write(`[exit] Backend exited with code ${code}\n`);
    logStream.end();
  });

  // Wait for backend to be ready (up to 60 seconds with exponential backoff)
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds with 500ms intervals
    let lastError = '';

    const checkBackend = () => {
      attempts++;
      const progress = Math.round((attempts / maxAttempts) * 100);
      console.log(`⏳ Backend startup check... (${attempts}/${maxAttempts}) ${progress}%`);

      http.get('http://localhost:8765/api/health', { timeout: 5000 }, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Backend READY on port 8765! Starting UI...');
          resolve();
        } else {
          console.warn(`⚠️ Backend responded with status ${res.statusCode}, retrying...`);
          if (attempts < maxAttempts) {
            setTimeout(checkBackend, 500);
          } else {
            console.error('❌ Backend failed to respond after 60 seconds');
            console.error('📝 Check: C:\\Users\\[User]\\AppData\\Roaming\\KSeF Desktop\\backend.log');
            resolve(); // Proceed anyway for debugging
          }
        }
      }).on('error', (err) => {
        lastError = err.message;
        if (attempts < maxAttempts) {
          setTimeout(checkBackend, 500);
        } else {
          console.error(`❌ Backend unreachable after 60 seconds: ${lastError}`);
          console.error('💡 Make sure you wait 10-15 seconds after starting the app');
          resolve(); // Proceed anyway for debugging
        }
      });
    };

    // First check after 2 seconds to give backend time to start
    setTimeout(checkBackend, 2000);
  });
};

/**
 * Check if development server is ready (with retries)
 */
const waitForDevServer = (url: string, maxRetries: number = 30): Promise<void> => {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const attemptConnection = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200 || res.statusCode === 404) {
            console.log('✓ Dev server is ready');
            resolve();
          } else {
            retryConnection();
          }
        })
        .on('error', () => {
          retryConnection();
        });
    };

    const retryConnection = () => {
      retries++;
      if (retries < maxRetries) {
        console.log(`⏳ Waiting for dev server... (${retries}/${maxRetries})`);
        setTimeout(attemptConnection, 1000);
      } else {
        reject(new Error('Dev server did not start'));
      }
    };

    attemptConnection();
  });
};

/**
 * Create splash screen window
 */
const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#667eea',
  });

  const splashPath = isDev
    ? path.join(__dirname, '../../public/splash.html')
    : path.join(app.getAppPath(), 'public/splash.html');

  splashWindow.loadFile(splashPath);
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#667eea',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../../public/icon.png'),
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow!.show();
  });

  const startUrl = isDev
    ? 'http://localhost:4200'
    : (() => {
        const filePath = path.join(app.getAppPath(), 'dist/renderer/index.html');
        // On Windows, convert backslashes to forward slashes and add extra /
        const fileUrl = 'file://' + (process.platform === 'win32' ? '/' : '') + filePath.replace(/\\/g, '/');
        return fileUrl;
      })();

  // In dev mode, wait for Angular dev server to be ready
  if (isDev) {
    try {
      await waitForDevServer(startUrl);
    } catch (error) {
      console.error('❌ Dev server timeout, loading anyway...');
    }
  }

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Open external links (http/https) in default browser instead of in app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Handle failed loads in dev mode - retry
  mainWindow.webContents.on('did-fail-load', () => {
    if (isDev) {
      console.warn('⚠️ Failed to load URL, retrying in 2 seconds...');
      setTimeout(() => {
        mainWindow?.reload();
      }, 2000);
    }
  });

  // Register global shortcut to toggle dev tools (Ctrl+Shift+I / Cmd+Shift+I)
  globalShortcut.register('CmdOrCtrl+Shift+I', () => {
    if (mainWindow) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    // Unregister shortcut when window is closed
    globalShortcut.unregister('CmdOrCtrl+Shift+I');
  });
};

const createMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Plik',
      submenu: [
        {
          label: 'Wyjście',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Widok',
      submenu: [
        {
          label: 'Przeładuj',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow?.reload();
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

app.on('ready', async () => {
  try {
    console.log('📱 Starting KSeF Desktop application...');
    // Show splash screen immediately for better UX
    createSplashWindow();
    // Only start backend in production (when packaged)
    // In dev mode, backend runs separately via npm run dev:backend
    if (!isDev) {
      await startBackendServer();
    }
    await createWindow();
    createMenu();
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  // Graceful shutdown: give backend time to close properly
  console.log('🛑 Shutting down application...');

  if (backendProcess && !backendProcess.killed) {
    console.log('⏳ Waiting for backend to close gracefully (up to 5 seconds)...');

    // Send SIGTERM for graceful shutdown
    backendProcess.kill('SIGTERM');

    // Wait up to 5 seconds for process to exit naturally
    await new Promise(resolve => {
      const timeout = setTimeout(() => {
        if (backendProcess && !backendProcess.killed) {
          console.warn('⚠️ Backend not responding to SIGTERM, forcing kill...');
          backendProcess.kill('SIGKILL');
        }
        resolve(null);
      }, 5000);

      backendProcess.once('exit', () => {
        clearTimeout(timeout);
        console.log('✓ Backend shut down successfully');
        resolve(null);
      });
    });
  }

  // Ensure database and other resources are released
  console.log('✓ Shutdown complete. You can safely close the app.');

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
