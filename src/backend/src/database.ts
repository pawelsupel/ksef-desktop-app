import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';
import CryptoJS from 'crypto-js';

// Use AppData directory for database (Windows) or home/.ksef (other systems)
// This ensures invoices are persisted even when app is reinstalled
const dbDir = process.env.KSEF_DB_DIR ||
  (process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'KSeF Desktop')
    : path.join(os.homedir(), '.ksef'));

// Create directory if it doesn't exist
import fs from 'fs';
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'ksef.db');
const envFilePath = path.join(dbDir, '.env');
let dbReady = false;

// Load encryption key with fallback strategy
function loadEncryptionKey(): string {
  // 1. Check environment variable first (highest priority)
  if (process.env.KSEF_ENCRYPTION_KEY) {
    console.log('🔑 Using encryption key from environment variable');
    return process.env.KSEF_ENCRYPTION_KEY;
  }

  // 2. Check .env file in database directory
  if (fs.existsSync(envFilePath)) {
    try {
      const envContent = fs.readFileSync(envFilePath, 'utf-8');
      const match = envContent.match(/KSEF_ENCRYPTION_KEY=(.+)/);
      if (match && match[1]) {
        console.log('🔑 Using encryption key from .env file');
        return match[1].trim();
      }
    } catch (error) {
      console.warn('⚠️  Could not read .env file:', error);
    }
  }

  // 3. If database exists, we MUST have a key to decrypt it
  if (fs.existsSync(dbPath)) {
    throw new Error(
      '❌ FATAL: KSEF_ENCRYPTION_KEY not found and database already exists!\n\n' +
      'Your encrypted data cannot be accessed without the key.\n\n' +
      'Options:\n' +
      '1. Set environment variable: set KSEF_ENCRYPTION_KEY=your-key\n' +
      '2. Or create .env file in: ' + envFilePath + '\n' +
      '3. With content: KSEF_ENCRYPTION_KEY=your-key-here'
    );
  }

  // 4. New installation - generate random key and save to .env
  console.log('🔑 Generating new encryption key for first-time setup...');
  const crypto = require('crypto');
  const randomKey = crypto.randomBytes(32).toString('base64');

  try {
    fs.writeFileSync(envFilePath, `KSEF_ENCRYPTION_KEY=${randomKey}\n`, 'utf-8');
    fs.chmodSync(envFilePath, 0o600); // Read/write for owner only (security)
    console.log('✅ Generated and saved encryption key to:', envFilePath);
    console.log('⚠️  IMPORTANT: For production, change this key to something stronger!');
    console.log('   See README.md for instructions on generating a secure key.');
    return randomKey;
  } catch (error) {
    console.error('❌ Failed to save encryption key:', error);
    throw new Error('Could not create encryption key file: ' + error);
  }
}

const ENCRYPTION_KEY = loadEncryptionKey();

/**
 * Encrypt sensitive data (token, certificate password)
 */
function encryptData(plainText: string): string {
  if (!plainText) return '';
  try {
    return CryptoJS.AES.encrypt(plainText, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    return '';
  }
}

/**
 * Decrypt sensitive data
 * Backward compatible: if decryption fails, assume it's plain text (old data)
 */
function decryptData(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);

    // If decryption succeeded but result is empty, it was probably plain text
    if (!decrypted && encryptedText) {
      console.log('⚠️  Encryption key mismatch or plain text data - returning original');
      return encryptedText;
    }
    return decrypted;
  } catch (error) {
    console.warn('⚠️  Decryption failed - assuming plain text (old data format)');
    // Backward compatibility: return original text if decryption fails
    return encryptedText;
  }
}

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database at', dbPath, ':', err);
  } else {
    console.log('✓ Connected to SQLite database at:', dbPath);
    console.log('📁 Database location:', dbPath);
    initializeDatabase().then(() => {
      dbReady = true;
      console.log('✓ Database fully initialized and ready');
    }).catch((err) => {
      console.error('❌ Database initialization failed:', err);
    });
  }
});

// Enable WAL mode for better concurrency
db.run('PRAGMA journal_mode=WAL', (err) => {
  if (err) console.warn('⚠️ Could not enable WAL mode:', err);
  else console.log('✓ WAL mode enabled for better reliability');
});

// Helper to check if database is ready
export function isDatabaseReady(): boolean {
  return dbReady;
}

// Wrapper functions for database operations
export function dbRun(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function dbGet(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

export function dbAll(sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

async function initializeDatabase(): Promise<void> {
  try {
    // Create config table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auth_method TEXT NOT NULL CHECK(auth_method IN ('token', 'certificate')),
        nip TEXT,
        token TEXT,
        certificate_path TEXT,
        certificate_password TEXT,
        api_url TEXT DEFAULT 'https://ksef.mf.gov.pl',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create invoices_cache table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS invoices_cache (
        id TEXT PRIMARY KEY,
        ksef_id TEXT UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('received', 'sent')),
        number TEXT,
        seller_name TEXT,
        seller_tax_id TEXT,
        buyer_name TEXT,
        buyer_tax_id TEXT,
        amount REAL,
        currency TEXT DEFAULT 'PLN',
        issue_date TEXT,
        due_date TEXT,
        status TEXT DEFAULT 'received',
        data TEXT NOT NULL,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes separately
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices_cache(type)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices_cache(status)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_invoices_cached_at ON invoices_cache(cached_at)`);

    // Migration: Add nip column if it doesn't exist (for existing databases)
    try {
      await dbRun(`ALTER TABLE config ADD COLUMN nip TEXT`);
      console.log('✓ Migration: Added nip column to config table');
    } catch (error: any) {
      // Ignore error if column already exists (duplicate column name)
      if (!error.message.includes('duplicate column')) {
        throw error;
      }
    }

    console.log('✓ Database schema initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Helper function to get single config record
export async function getConfig(): Promise<any> {
  try {
    const config = await dbGet('SELECT * FROM config LIMIT 1');
    if (config) {
      // Decrypt sensitive data
      const decryptedConfig = {
        ...config,
        token: config.token ? decryptData(config.token) : null,
        certificate_password: config.certificate_password
          ? decryptData(config.certificate_password)
          : null,
      };

      console.log('✓ getConfig() found config:', {
        id: decryptedConfig.id,
        auth_method: decryptedConfig.auth_method,
        token: decryptedConfig.token ? '***' : 'empty',
      });
      console.log('🔐 Sensitive data decrypted from database');
      return decryptedConfig;
    } else {
      console.log('⚠️ getConfig() - no config found in database');
    }
    return config || null;
  } catch (error) {
    console.error('❌ Error getting config:', error);
    return null;
  }
}

// Helper function to save or update config
export async function saveConfig(configData: {
  auth_method: string;
  nip?: string;
  token?: string;
  certificate_path?: string;
  certificate_password?: string;
}): Promise<boolean> {
  try {
    console.log('💾 saveConfig() called with:', {
      auth_method: configData.auth_method,
      nip: configData.nip ? '***' : 'empty',
      token: configData.token ? '***' : 'empty',
    });

    const existing = await getConfig();

    // Encrypt sensitive data before saving
    // If token is undefined, don't update it (keep existing)
    const encryptedToken = configData.token !== undefined ? (configData.token ? encryptData(configData.token) : null) : undefined;
    const encryptedCertPassword = configData.certificate_password
      ? encryptData(configData.certificate_password)
      : null;

    if (existing) {
      // Update existing config
      console.log('📝 Updating existing config (id:', existing.id, ')');

      // Build dynamic UPDATE query - only update fields that are provided
      let updateFields: string[] = ['auth_method = ?', 'nip = ?', 'certificate_path = ?', 'certificate_password = ?', 'updated_at = CURRENT_TIMESTAMP'];
      let updateValues: any[] = [
        configData.auth_method,
        configData.nip || null,
        configData.certificate_path || null,
        encryptedCertPassword,
      ];

      // Only update token if it was provided (not undefined)
      if (configData.token !== undefined) {
        updateFields.push('token = ?');
        updateValues.push(encryptedToken);
      }

      updateValues.push(existing.id);

      const updateQuery = `UPDATE config SET ${updateFields.join(', ')} WHERE id = ?`;
      console.log('🔐 Sensitive data will be encrypted in database');
      await dbRun(updateQuery, updateValues);
      console.log('✓ Config updated successfully (sensitive data encrypted)');

      // Force disk sync to ensure data is written
      await new Promise<void>((resolve, reject) => {
        db.exec('PRAGMA optimize', (err) => {
          if (err) console.warn('⚠️ PRAGMA optimize failed:', err);
          resolve();
        });
      });
    } else {
      // Insert new config
      console.log('➕ Creating new config');
      console.log('🔐 Token and certificate password will be encrypted in database');
      await dbRun(
        `INSERT INTO config (auth_method, nip, token, certificate_path, certificate_password)
         VALUES (?, ?, ?, ?, ?)`,
        [
          configData.auth_method,
          configData.nip || null,
          encryptedToken,
          configData.certificate_path || null,
          encryptedCertPassword,
        ]
      );
      console.log('✓ Config created successfully (sensitive data encrypted)');
    }

    return true;
  } catch (error) {
    console.error('❌ Error saving config:', error);
    return false;
  }
}

// Helper function to get invoices by type
export async function getInvoicesByType(
  type: 'received' | 'sent',
  limit = 50,
  offset = 0
): Promise<any[]> {
  try {
    const invoices = await dbAll(
      `SELECT * FROM invoices_cache
       WHERE type = ?
       ORDER BY cached_at DESC
       LIMIT ? OFFSET ?`,
      [type, limit, offset]
    );
    return invoices || [];
  } catch (error) {
    console.error('Error getting invoices:', error);
    return [];
  }
}

// Helper function to cache invoice
export async function cacheInvoice(invoiceData: {
  id: string;
  ksef_id?: string;
  type: 'received' | 'sent';
  number: string;
  seller_name?: string;
  seller_tax_id?: string;
  buyer_name?: string;
  buyer_tax_id?: string;
  amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  status: string;
  data: string; // JSON string
}): Promise<boolean> {
  try {
    await dbRun(
      `INSERT OR REPLACE INTO invoices_cache
       (id, ksef_id, type, number, seller_name, seller_tax_id, buyer_name, buyer_tax_id, amount, currency, issue_date, due_date, status, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceData.id,
        invoiceData.ksef_id || null,
        invoiceData.type,
        invoiceData.number,
        invoiceData.seller_name || null,
        invoiceData.seller_tax_id || null,
        invoiceData.buyer_name || null,
        invoiceData.buyer_tax_id || null,
        invoiceData.amount,
        invoiceData.currency,
        invoiceData.issue_date,
        invoiceData.due_date,
        invoiceData.status,
        invoiceData.data,
      ]
    );
    console.log(`✓ Invoice ${invoiceData.id.substring(0, 20)}... cached successfully`);

    // Ensure data is flushed to disk
    return await new Promise<boolean>((resolve) => {
      db.exec('PRAGMA optimize', () => {
        resolve(true);
      });
    });
  } catch (error) {
    console.error(`❌ Error caching invoice ${invoiceData.id}:`, error);
    return false;
  }
}

// Close database gracefully on app shutdown
export function closeDatabase(): Promise<void> {
  return new Promise((resolve) => {
    console.log('💾 Flushing database before closing...');
    db.exec('PRAGMA optimize', () => {
      db.close((err) => {
        if (err) {
          console.error('❌ Error closing database:', err);
        } else {
          console.log('✓ Database flushed and closed successfully');
        }
        resolve();
      });
    });
  });
}
