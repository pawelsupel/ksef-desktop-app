import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { load } from 'cheerio';
import http from 'http';
import { closeDatabase, getConfig, saveConfig, isDatabaseReady } from './database';
import { kSeFService } from './services/ksef.service';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 8765;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'KSeF Backend is running' });
});

// Config endpoints
app.get('/api/config', async (req: Request, res: Response) => {
  try {
    console.log('📖 GET /api/config requested');
    const config = await getConfig();

    if (!config) {
      console.log('❌ No configuration found in database');
      return res.json({ success: false, message: 'No configuration found' });
    }

    // Return config data
    // NOTE: Token is NOT returned to frontend for security - always empty string in response
    // But we send a flag hasToken so frontend knows if token was saved
    const configData = {
      authMethod: config.auth_method,
      nip: config.nip || '',
      token: '', // Always empty - for security, don't send actual token to frontend
      hasToken: !!config.token, // Flag to indicate if token exists in database
      certificatePath: config.certificate_path || '',
      certificatePassword: config.certificate_password || '',
      apiUrl: config.api_url,
    };
    console.log('✓ Config found:', { authMethod: configData.authMethod, nip: configData.nip ? '***' : 'empty' });
    res.json({ success: true, data: configData });
  } catch (error) {
    console.error('❌ Error fetching config:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/config/save', async (req: Request, res: Response) => {
  try {
    const { authMethod, nip, token, certificatePath, certificatePassword, skipTokenUpdate } = req.body;

    console.log('📝 POST /api/config/save received:', { authMethod, nip: nip ? '***' : 'empty', token: token ? '***' : 'empty', skipTokenUpdate });

    if (!authMethod || !['token', 'certificate'].includes(authMethod)) {
      console.warn('❌ Invalid authMethod:', authMethod);
      return res
        .status(400)
        .json({ success: false, message: 'Invalid authMethod' });
    }

    // If skipTokenUpdate is true, it means user kept the existing token (placeholder)
    // Check that a token exists in database in this case
    if (skipTokenUpdate) {
      const existing = await getConfig();
      if (!existing || !existing.token) {
        console.warn('❌ Token required but attempting to skip update with no existing token');
        return res
          .status(400)
          .json({ success: false, message: 'Token KSeF is required. Get it from https://ksef.mf.gov.pl panel' });
      }
      console.log('ℹ️ Skipping token update - keeping existing token');
    } else if (authMethod === 'token' && !token) {
      console.warn('❌ Token required but empty');
      return res
        .status(400)
        .json({ success: false, message: 'Token KSeF is required. Get it from https://ksef.mf.gov.pl panel' });
    }

    if (authMethod === 'certificate' && !certificatePath) {
      console.warn('❌ Certificate path required but empty');
      return res.status(400).json({
        success: false,
        message: 'Certificate path is required',
      });
    }

    const success = await saveConfig({
      auth_method: authMethod,
      nip,
      token: skipTokenUpdate ? undefined : token, // Don't update token if skipTokenUpdate is true
      certificate_path: certificatePath,
      certificate_password: certificatePassword,
    });

    if (success) {
      console.log('✓ Config saved successfully');

      // Reinitialize KSeF service with new credentials
      console.log('🔄 Reinitializing KSeF service with new config...');
      const reinitialized = await kSeFService.initialize();

      // Get updated config to send hasToken flag back to frontend
      const updatedConfig = await getConfig();
      const hasToken = !!updatedConfig?.token;

      if (reinitialized) {
        console.log('✓ KSeF service reinitialized successfully');
        res.json({
          success: true,
          message: 'Configuration saved and KSeF service reinitialized successfully',
          data: { hasToken }
        });
      } else {
        console.warn('⚠️ Config saved but KSeF service reinitialization failed - check credentials');
        res.json({
          success: true,
          message: 'Configuration saved successfully (KSeF connection will be tested on first use)',
          data: { hasToken }
        });
      }
    } else {
      console.error('❌ saveConfig returned false');
      res
        .status(500)
        .json({ success: false, message: 'Failed to save configuration' });
    }
  } catch (error) {
    console.error('❌ Error saving config:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Test connection endpoint
app.post('/api/config/test-connection', async (req: Request, res: Response) => {
  try {
    console.log('🔗 POST /api/config/test-connection requested');

    const config = await getConfig();
    if (!config) {
      console.warn('⚠️  No configuration found');
      return res.json({
        success: false,
        message: 'No configuration found. Please save settings first.',
      });
    }

    // Test by initializing KSeF service
    const isConnected = await kSeFService.initialize();

    if (isConnected) {
      console.log('✓ Connection test successful');
      res.json({
        success: true,
        message: 'Połączono z KSeF pomyślnie ✓',
      });
    } else {
      console.warn('❌ Connection test failed');
      res.json({
        success: false,
        message: 'Nie można połączyć się z KSeF. Sprawdź konfigurację.',
      });
    }
  } catch (error) {
    console.error('❌ Error testing connection:', error);
    res.json({
      success: false,
      message: `Błąd połączenia: ${error instanceof Error ? error.message : 'Nieznany błąd'}`,
    });
  }
});

// Invoice endpoints
app.get('/api/invoices/received', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    console.log('📖 GET /api/invoices/received requested');

    if (!kSeFService.isInitialized()) {
      console.warn('⚠️  KSeF service not initialized - no invoices available');
      return res.json({ success: false, message: 'KSeF not configured', invoices: [] });
    }

    const invoices = await kSeFService.getReceivedInvoices(limit, offset);
    res.json({ success: true, invoices });
  } catch (error) {
    console.error('❌ Error fetching received invoices:', error);
    res.status(500).json({ success: false, message: 'Error fetching invoices', invoices: [] });
  }
});

app.get('/api/invoices/sent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    console.log('📖 GET /api/invoices/sent requested');

    if (!kSeFService.isInitialized()) {
      console.warn('⚠️  KSeF service not initialized - no invoices available');
      return res.json({ success: false, message: 'KSeF not configured', invoices: [] });
    }

    const invoices = await kSeFService.getSentInvoices(limit, offset);
    res.json({ success: true, invoices });
  } catch (error) {
    console.error('❌ Error fetching sent invoices:', error);
    res.status(500).json({ success: false, message: 'Error fetching invoices', invoices: [] });
  }
});

app.get('/api/invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`📋 GET /api/invoices/:id requested for: ${id}`);

    if (!kSeFService.isInitialized()) {
      console.warn('⚠️  KSeF service not initialized - cannot fetch invoice details');
      return res.json({ success: false, message: 'KSeF not configured', invoice: null });
    }

    const invoiceDetails = await kSeFService.getInvoiceDetails(id);

    if (invoiceDetails) {
      res.json({ success: true, invoice: invoiceDetails });
    } else {
      res.status(404).json({ success: false, message: 'Invoice not found', invoice: null });
    }
  } catch (error) {
    console.error('❌ Error fetching invoice details:', error);
    res.status(500).json({ success: false, message: 'Error fetching invoice details', invoice: null });
  }
});

app.get('/api/invoices/:id/pdf', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`📄 GET /api/invoices/:id/pdf requested for: ${id}`);

    if (!kSeFService.isInitialized()) {
      console.warn('⚠️  KSeF service not initialized - cannot download PDF');
      return res.status(503).json({ success: false, message: 'KSeF not configured' });
    }

    const pdfBuffer = await kSeFService.downloadInvoicePdf(id);

    if (pdfBuffer && pdfBuffer.length > 0) {
      // Basic PDF signature check to avoid returning invalid files
      const isPdf = pdfBuffer.slice(0, 5).toString() === '%PDF-';
      if (!isPdf) {
        console.error(`❌ Generated buffer is not a valid PDF for invoice ${id}`);
        return res.status(500).json({ success: false, message: 'Nie udało się wygenerować poprawnego PDF' });
      }
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      console.log(`✓ Sending PDF for invoice ${id} (${pdfBuffer.length} bytes)`);
      res.send(pdfBuffer);
    } else {
      res.status(404).json({ success: false, message: 'PDF not found' });
    }
  } catch (error) {
    console.error('❌ Error downloading PDF:', error);
    res.status(500).json({ success: false, message: 'Error downloading PDF' });
  }
});

app.get('/api/invoices/:id/xml', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log(`📋 GET /api/invoices/:id/xml requested for: ${id}`);

    if (!kSeFService.isInitialized()) {
      console.warn('⚠️  KSeF service not initialized - cannot download XML');
      return res.status(503).json({ success: false, message: 'KSeF not configured' });
    }

    const xmlBuffer = await kSeFService.downloadInvoiceXml(id);

    if (xmlBuffer && xmlBuffer.length > 0) {
      // Set response headers for XML download
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${id}.xml"`);
      res.setHeader('Content-Length', xmlBuffer.length);

      console.log(`✓ Sending XML for invoice ${id} (${xmlBuffer.length} bytes)`);
      res.send(xmlBuffer);
    } else {
      res.status(404).json({ success: false, message: 'XML not found' });
    }
  } catch (error) {
    console.error('❌ Error downloading XML:', error);
    res.status(500).json({ success: false, message: 'Error downloading XML' });
  }
});

// Store portal session cookies
let portalCookies: string[] = [];
let portalCookiesExpiry = 0;

/**
 * Try to authenticate to KSeF portal using API token
 */
async function authenticatePortalWithToken(token: string): Promise<string[]> {
  try {
    // Check if cookies are still valid
    if (portalCookies.length > 0 && portalCookiesExpiry > Date.now()) {
      console.log('✓ Portal cookies still valid');
      return portalCookies;
    }

    console.log('🔐 Attempting to authenticate portal with token...');

    // Try to login to portal with Authorization header
    const response = await axios.post('https://ap.ksef.mf.gov.pl/web/auth/login', {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      withCredentials: true,
      maxRedirects: 5,
    });

    // Extract cookies from response headers
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      portalCookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      portalCookiesExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
      console.log('✓ Portal authentication successful, cookies obtained');
      return portalCookies;
    }

    console.warn('⚠️  No cookies in portal response');
    return [];
  } catch (error: any) {
    console.warn('⚠️  Portal authentication with token failed:', error.message);
    // This is expected - portal might not support token-based auth
    return [];
  }
}

// KSeF Portal HTTP Proxy - all requests
app.use('/api/ksef-portal/', async (req: Request, res: Response) => {
  try {
    // Try to get portal cookies
    const config = await getConfig();
    if (config && config.token) {
      const cookies = await authenticatePortalWithToken(config.token);
      // Cookies will be reused for next requests
      if (cookies.length > 0 && !req.headers['cookie']) {
        req.headers['cookie'] = cookies.join('; ');
      }
    }

    // Build target URL - remove /api/ksef-portal from path
    const pathWithoutProxy = req.url.replace(/^\/api\/ksef-portal/, '');
    const targetPath = pathWithoutProxy.startsWith('/') ? pathWithoutProxy : '/' + pathWithoutProxy;
    const targetUrl = `https://ap.ksef.mf.gov.pl${targetPath}`;

    console.log(`🌐 Proxy ${req.method} ${req.url} → ${targetUrl}`);

    // Check if token is configured (already done above)
    if (!config || !config.token) {
      console.warn('❌ No token configured');
      return res.status(401).send('<html><body><h2>Token KSeF nie skonfigurowany</h2></body></html>');
    }

    // Forward request to KSeF (GET, POST, etc.)
    let axiosConfig: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      },
      maxRedirects: 5,
      withCredentials: true,
    };

    // Copy relevant headers from client request
    if (req.headers['authorization']) {
      axiosConfig.headers['authorization'] = req.headers['authorization'];
    }
    if (req.headers['cookie']) {
      axiosConfig.headers['cookie'] = req.headers['cookie'];
    }
    if (req.headers['content-type']) {
      axiosConfig.headers['content-type'] = req.headers['content-type'];
    }

    // Handle different HTTP methods
    let response: any;
    if (req.method === 'GET') {
      response = await axios.get(targetUrl, axiosConfig);
    } else if (req.method === 'POST') {
      response = await axios.post(targetUrl, req.body, axiosConfig);
    } else if (req.method === 'PUT') {
      response = await axios.put(targetUrl, req.body, axiosConfig);
    } else if (req.method === 'DELETE') {
      response = await axios.delete(targetUrl, axiosConfig);
    } else {
      return res.status(405).send('Method Not Allowed');
    }

    let content = response.data;
    const contentType = response.headers['content-type'] || 'application/octet-stream';

    // If it's HTML, modify it to work in iframe
    if (typeof content === 'string' && contentType.includes('text/html')) {
      try {
        const $ = load(content);

        // Fix all URLs to go through proxy
        $('script[src]').each((i, el) => {
          const src = $(el).attr('src');
          if (src && !src.startsWith('http') && !src.startsWith('//')) {
            $(el).attr('src', `/api/ksef-portal${src.startsWith('/') ? '' : '/'}${src}`);
          } else if (src && src.startsWith('//')) {
            $(el).attr('src', `https:${src}`);
          }
        });

        $('link[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('data:') && !href.startsWith('mailto:')) {
            $(el).attr('href', `/api/ksef-portal${href.startsWith('/') ? '' : '/'}${href}`);
          } else if (href && href.startsWith('//')) {
            $(el).attr('href', `https:${href}`);
          }
        });

        $('img[src]').each((i, el) => {
          const src = $(el).attr('src');
          if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
            $(el).attr('src', `/api/ksef-portal${src.startsWith('/') ? '' : '/'}${src}`);
          } else if (src && src.startsWith('//')) {
            $(el).attr('src', `https:${src}`);
          }
        });

        // Fix base href to include proxy path
        const baseHref = $('base[href]');
        if (baseHref.length > 0) {
          const href = baseHref.attr('href');
          if (href && !href.startsWith('/api/ksef-portal')) {
            baseHref.attr('href', `/api/ksef-portal${href.startsWith('/') ? '' : '/'}${href}`);
          }
        }

        // Replace inline JavaScript that might have hardcoded paths
        // This regex finds strings like "/assets/...", "/webs/..." etc
        let html = $.html();
        html = html.replace(/(['"])\/(?!\/)(assets|webs|rb_|_Incapsula)([^'"]*)\1/g, '$1/api/ksef-portal/$2$3$1');

        content = $.html();
      } catch (parseError) {
        console.log('Could not parse HTML with cheerio, returning as-is');
      }
    }

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' file: http://localhost http://127.0.0.1");

    const origin = req.headers.origin || '';
    const isAllowedOrigin = (value: string) =>
      value === '' ||
      value.startsWith('file://') ||
      value.startsWith('http://localhost') ||
      value.startsWith('http://127.0.0.1');

    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || 'file://');
      res.setHeader('Vary', 'Origin');
    }

    // Copy cookies from response if present
    if (response.headers['set-cookie']) {
      res.setHeader('Set-Cookie', response.headers['set-cookie']);
    }

    res.send(content);
  } catch (error: any) {
    console.error('❌ Error proxying KSeF:', error.message);
    if (error.response?.status === 404) {
      return res.status(404).send('<html><body><h2>Not Found</h2></body></html>');
    }
    res.status(error.response?.status || 500).send({
      error: error.message,
      status: error.response?.status || 500,
    });
  }
});

// Default KSeF portal route (without path)
app.get('/api/ksef-portal-html', async (req: Request, res: Response) => {
  res.redirect('/api/ksef-portal/web/invoice-list');
});

// Catch-all proxy for KSeF portal assets and API requests
// This handles /assets, /webs, etc that get rewritten by cheerio
app.use(async (req: Request, res: Response, next) => {
  // Only proxy specific paths that belong to KSeF
  const ksefPaths = ['/assets', '/webs', '/rb_', '/_Incapsula', '/config.json', '/error-codes.json', '/feature-flags'];

  if (!ksefPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  try {
    const targetUrl = `https://ap.ksef.mf.gov.pl${req.url}`;
    console.log(`🌐 Catch-all proxy: ${req.method} ${req.url} → ${targetUrl}`);

    // Check if token is configured
    const config = await getConfig();
    if (!config || !config.token) {
      console.warn('❌ No token configured');
      return res.status(401).json({ error: 'Token not configured' });
    }

    let axiosConfig: any = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      maxRedirects: 5,
    };

    // Copy relevant headers
    if (req.headers['authorization']) {
      axiosConfig.headers['authorization'] = req.headers['authorization'];
    }
    if (req.headers['cookie']) {
      axiosConfig.headers['cookie'] = req.headers['cookie'];
    }
    if (req.headers['content-type']) {
      axiosConfig.headers['content-type'] = req.headers['content-type'];
    }

    // Handle different HTTP methods
    let response: any;
    if (req.method === 'GET') {
      response = await axios.get(targetUrl, axiosConfig);
    } else if (req.method === 'POST') {
      response = await axios.post(targetUrl, req.body, axiosConfig);
    } else if (req.method === 'OPTIONS') {
      return res.status(200).end();
    } else {
      return res.status(405).send('Method Not Allowed');
    }

    // Forward response headers
    res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
    const origin = req.headers.origin || '';
    const isAllowedOrigin = (value: string) =>
      value === '' ||
      value.startsWith('file://') ||
      value.startsWith('http://localhost') ||
      value.startsWith('http://127.0.0.1');

    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || 'file://');
      res.setHeader('Vary', 'Origin');
    }

    if (response.headers['set-cookie']) {
      res.setHeader('Set-Cookie', response.headers['set-cookie']);
    }

    res.send(response.data);
  } catch (error: any) {
    console.error('❌ Error in catch-all proxy:', error.message);
    res.status(error.response?.status || 500).json({ error: error.message });
  }
});

// Debug endpoint - test received invoices and show what KSeF returns
app.get('/api/debug/test-received', async (req: Request, res: Response) => {
  try {
    console.log('🔍 DEBUG: Testing received invoices endpoint...');

    if (!kSeFService.isInitialized()) {
      return res.json({ error: 'KSeF not initialized', success: false });
    }

    console.log('📊 Calling getReceivedInvoices...');
    const invoices = await kSeFService.getReceivedInvoices(5, 0);

    console.log(`📊 Got ${invoices.length} invoices back from service`);

    res.json({
      debug: true,
      invoiceCount: invoices.length,
      invoices: invoices,
      message: 'Check server console for detailed logs above'
    });
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({ error: String(error), success: false });
  }
});

// Start server - wait for database and KSeF service before listening
let server: any;

(async () => {
  // Wait for database to be ready (max 5 seconds)
  let dbWaitAttempts = 0;
  while (!isDatabaseReady() && dbWaitAttempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    dbWaitAttempts++;
  }

  if (!isDatabaseReady()) {
    console.warn('⚠️  Database initialization timeout');
  }

  // Check if old token exists from previous installation
  // Reset to empty if needed for fresh start
  const existingConfig = await getConfig();
  if (existingConfig && existingConfig.token) {
    console.log('📋 Found existing configuration with token');
    // Token will be preserved - user can update it in settings if needed
  }

  // Initialize KSeF service BEFORE starting server
  const kSeFReady = await kSeFService.initialize();
  if (kSeFReady) {
    console.log('✓ KSeF service ready to fetch invoices');
  } else {
    console.warn('⚠️  KSeF service not initialized - configure credentials in Settings');
  }

  // NOW start the server with SO_REUSEADDR
  const httpServer = http.createServer(app);

  let retryCount = 0;
  const maxRetries = 10;

  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE' && retryCount < maxRetries) {
      retryCount++;
      const waitTime = 2000 * retryCount; // Exponential backoff: 2s, 4s, 6s, etc
      console.error(`❌ Port ${PORT} in use. Retry ${retryCount}/${maxRetries} in ${waitTime}ms...`);
      setTimeout(() => {
        httpServer.listen(PORT);
      }, waitTime);
    } else if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} still in use after ${maxRetries} retries. Backend cannot start.`);
    } else {
      console.error('❌ Server error:', err);
    }
  });

  server = httpServer;

  httpServer.listen(PORT, () => {
    console.log(`✓ KSeF Backend running on port ${PORT}`);
    // Start token refresh timer to prevent token expiration during app use
    kSeFService.startTokenRefreshTimer();
  });

  // Set SO_REUSEADDR option
  httpServer.on('listening', () => {
    try {
      const addr = httpServer.address() as any;
      if (addr && typeof addr === 'object') {
        // Enable SO_REUSEADDR via native handle
        const handle = (httpServer as any)._handle;
        if (handle && typeof handle.setKeepAlive === 'function') {
          handle.setKeepAlive(true);
        }
      }
    } catch (e) {
      // Ignore socket option errors
    }
  });

})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n✓ Received SIGINT, shutting down gracefully...');
  kSeFService.stopTokenRefreshTimer(); // Stop token refresh timer
  if (server) {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  } else {
    await closeDatabase();
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n✓ Received SIGTERM, shutting down gracefully...');
  kSeFService.stopTokenRefreshTimer(); // Stop token refresh timer
  if (server) {
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
  } else {
    await closeDatabase();
    process.exit(0);
  }
});
