import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import puppeteer from 'puppeteer';
import { parseStringPromise } from 'xml2js';
import QRCode from 'qrcode';
import { getConfig, getInvoicesByType, cacheInvoice } from '../database';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const unzipper = require('unzipper');

interface KSeFInvoice {
  id: string;
  ksefNumber: string;
  invoiceNumber: string;
  number?: string; // Alias for invoiceNumber (used by frontend)
  issueDate: string;
  dueDate: string;
  amount: number; // Gross amount (used for display)
  netAmount?: number; // Net amount
  grossAmount?: number; // Gross amount
  currency: string;
  status: string;
  type: 'received' | 'sent';
  seller?: {
    name: string;
    taxId: string;
  };
  buyer?: {
    name: string;
    taxId: string;
  };
  description?: string;
}

interface ChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
}

interface ChallengeData {
  challenge: string;
  timestampMs: number;
}

interface AuthTokenResponse {
  referenceNumber: string;
  authenticationToken: {
    token: string;
    validUntil: string;
  };
}

interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  seller: {
    nip: string;
    name?: string;
  };
  buyer: {
    name?: string;
  };
  netAmount: number;
  grossAmount: number;
  currency: string;
  invoiceType: string;
}

interface QueryMetadataResponse {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceMetadata[];
}

interface ExportInitResponse {
  referenceNumber: string;
}

interface ExportStatusResponse {
  referenceNumber: string;
  processingCode: number;
  message?: string;
  packageUrl?: string;
  elementCount?: number;
}

export class KSeFService {
  private apiUrl = 'https://api.ksef.mf.gov.pl/api/v2';
  private axiosInstance: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiration: Date | null = null;
  private ksefToken: string | null = null;
  private nip: string | null = null;
  private publicKeyCertificate: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null; // Token refresh timer

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Add request interceptor to inject Bearer token
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  /**
   * Initialize service by loading token from database and performing authentication
   */
  async initialize(): Promise<boolean> {
    try {
      const config = await getConfig();
      console.log('📖 Loading KSeF configuration...');

      if (!config) {
        console.warn('⚠️  No configuration found - user needs to configure KSeF in Settings');
        return false;
      }

      console.log('   Auth method:', config.auth_method);

      if (config.auth_method === 'token' && config.token) {
        this.ksefToken = config.token;

        // Extract NIP from token if available (format: referenceNumber|nip-xxx|tokenValue)
        const tokenParts = config.token.split('|');
        if (tokenParts.length >= 2) {
          const nipPart = tokenParts[1];
          this.nip = nipPart.replace('nip-', '');
          console.log('✓ Extracted NIP from token:', this.nip);
        }

        // Perform KSeF authentication
        const authSuccess = await this.authenticateWithKSeF();
        if (authSuccess) {
          console.log('✓ KSeF service initialized with JWT accessToken');
          return true;
        } else {
          console.error('❌ KSeF authentication failed');
          return false;
        }
      } else {
        console.warn('⚠️  No token configured - please set up Token authentication in Settings');
        return false;
      }
    } catch (error) {
      console.error('❌ Error initializing KSeF service:', error);
      return false;
    }
  }

  /**
   * Perform 2-step KSeF authentication: challenge -> RSA-OAEP encrypt -> JWT
   */
  private async authenticateWithKSeF(): Promise<boolean> {
    try {
      console.log('🔐 Starting KSeF authentication flow...');

      // Step 1: Fetch public key certificate
      const certLoaded = await this.loadPublicKeyCertificate();
      if (!certLoaded) {
        console.error('❌ Failed to load public key certificate');
        return false;
      }

      // Step 2: Get challenge with timestamp
      const challengeData = await this.getChallenge();
      if (!challengeData) {
        console.error('❌ Failed to get challenge');
        return false;
      }

      // Step 3: Encrypt token with timestamp from challenge using RSA-OAEP
      const encryptedToken = this.encryptTokenWithChallenge(challengeData.timestampMs);
      if (!encryptedToken) {
        console.error('❌ Failed to encrypt token');
        return false;
      }

      // Step 4: Authenticate using challenge and encrypted token
      const authToken = await this.authenticateWithToken(challengeData.challenge, encryptedToken);
      if (!authToken) {
        console.error('❌ Failed to authenticate with KSeF');
        return false;
      }

      this.accessToken = authToken.token;
      this.tokenExpiration = new Date(authToken.validUntil);
      console.log('✓ Successfully authenticated with KSeF');
      console.log('   Token valid until:', this.tokenExpiration.toISOString());
      return true;
    } catch (error) {
      console.error('❌ Error during KSeF authentication:', error);
      return false;
    }
  }

  /**
   * Load public key certificate from KSeF
   */
  private async loadPublicKeyCertificate(): Promise<boolean> {
    try {
      console.log('🔐 Loading public key certificate from KSeF...');

      const response = await this.axiosInstance.get('/security/public-key-certificates');

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Find certificate for KsefTokenEncryption
        const tokenEncryptionCert = response.data.find((cert: any) =>
          cert.usage && cert.usage.includes('KsefTokenEncryption')
        );

        if (tokenEncryptionCert) {
          this.publicKeyCertificate = tokenEncryptionCert.certificate;
          console.log('✓ Loaded public key certificate for token encryption');
          return true;
        } else {
          // Fallback to first certificate if no specific usage
          this.publicKeyCertificate = response.data[0].certificate;
          console.log('✓ Loaded public key certificate (fallback)');
          return true;
        }
      }

      console.error('❌ No certificates found in response');
      return false;
    } catch (error: any) {
      console.error('❌ Error loading public key certificate:', error.message);
      return false;
    }
  }

  /**
   * Get challenge from KSeF - returns both challenge and timestampMs
   */
  private async getChallenge(): Promise<ChallengeData | null> {
    try {
      console.log('🎲 Requesting challenge from KSeF...');

      const response = await this.axiosInstance.post('/auth/challenge', {});

      if (response.data && response.data.challenge) {
        console.log('✓ Received challenge:', response.data.challenge);

        // Extract timestampMs from response
        // Response may have: timestamp (ISO string) or timestampMs (number)
        let timestampMs: number;

        if (response.data.timestampMs) {
          // If response has timestampMs directly
          timestampMs = response.data.timestampMs;
        } else if (response.data.timestamp) {
          // If response has ISO timestamp, convert to milliseconds
          timestampMs = new Date(response.data.timestamp).getTime();
        } else {
          // Fallback: use current timestamp (shouldn't happen)
          console.warn('⚠️  No timestamp in challenge response, using current time');
          timestampMs = Date.now();
        }

        console.log('   Timestamp (ms):', timestampMs);
        return {
          challenge: response.data.challenge,
          timestampMs,
        };
      }

      console.error('❌ No challenge in response');
      return null;
    } catch (error: any) {
      console.error('❌ Error getting challenge:', error.message);
      return null;
    }
  }

  /**
   * Encrypt token using RSA-OAEP with public key certificate
   * Uses timestamp from challenge, not current time
   */
  private encryptTokenWithChallenge(timestampMs: number): string | null {
    try {
      if (!this.ksefToken || !this.publicKeyCertificate) {
        console.error('❌ Missing token or certificate for encryption');
        return null;
      }

      console.log('🔒 Encrypting token with RSA-OAEP...');

      // Format: token|timestampMs (using timestamp from challenge)
      const tokenToEncrypt = `${this.ksefToken}|${timestampMs}`;
      console.log('   Encrypting:', `${this.ksefToken.substring(0, 20)}...|${timestampMs}`);

      // Convert base64 certificate to PEM format
      // Node.js createPublicKey() can automatically extract public key from X.509 certificate in PEM format
      const certificatePEM = `-----BEGIN CERTIFICATE-----\n${this.publicKeyCertificate.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;

      // Create public key object from certificate
      // Node.js will automatically extract public key from X.509 certificate
      const publicKeyObject = crypto.createPublicKey({
        key: certificatePEM,
        format: 'pem',
      });

      // Encrypt using RSA-OAEP with SHA-256
      const encryptedBuffer = crypto.publicEncrypt(
        {
          key: publicKeyObject,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(tokenToEncrypt)
      );

      // Convert to Base64
      const encryptedToken = encryptedBuffer.toString('base64');
      console.log('✓ Token encrypted successfully');

      return encryptedToken;
    } catch (error: any) {
      console.error('❌ Error encrypting token:', error.message);
      return null;
    }
  }

  /**
   * Authenticate using encrypted token (4-step async process)
   */
  private async authenticateWithToken(challenge: string, encryptedToken: string): Promise<any> {
    try {
      console.log('🔑 Authenticating with KSeF...');

      if (!this.nip) {
        console.error('❌ NIP not available');
        return null;
      }

      // Step 1: POST /auth/ksef-token - submit authentication request
      const payload = {
        challenge,
        contextIdentifier: {
          type: 'Nip',
          value: this.nip,
        },
        encryptedToken,
      };

      console.log('📤 Step 1: Submitting authentication request...');
      const response = await this.axiosInstance.post('/auth/ksef-token', payload);

      if (!response.data || !response.data.authenticationToken) {
        console.error('❌ No authentication token in response');
        return null;
      }

      const tempAuthToken = response.data.authenticationToken.token;
      const referenceNumber = response.data.referenceNumber;
      console.log('✓ Temporary auth token received');
      console.log('   Reference:', referenceNumber);

      // Token auth might be asynchronous - check status with retry logic
      // Sometimes API returns status 100 (in progress) and we need to wait
      console.log('⏳ Step 2: Checking authentication status (with retry)...');
      const statusOk = await this.waitForTokenAuthStatus(referenceNumber, tempAuthToken);
      if (!statusOk) {
        console.error('❌ Authentication status check failed');
        return null;
      }

      // Step 3: POST /auth/token/redeem - get actual accessToken
      console.log('💳 Step 3: Redeeming access token...');
      const accessToken = await this.redeemAccessToken(tempAuthToken);
      if (!accessToken) {
        console.error('❌ Failed to redeem access token');
        return null;
      }

      console.log('✓ Authentication completed successfully');
      return accessToken;
    } catch (error: any) {
      console.error('❌ Error during authentication:', error.message);
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data).substring(0, 300));
      }
      return null;
    }
  }

  /**
   * Wait for authentication status to be ready for redemption
   * Polls the status endpoint until status indicates successful authentication or error
   */
  private async waitForAuthenticationStatus(referenceNumber: string, authToken: string, maxWaitMs: number = 30000): Promise<boolean> {
    try {
      const startTime = Date.now();
      const pollIntervalMs = 1000; // Check every 1 second
      let pollAttempt = 0;

      while (Date.now() - startTime < maxWaitMs) {
        pollAttempt++;
        try {
          console.log(`   Poll attempt ${pollAttempt}...`);
          console.log(`   Checking: GET /auth/${referenceNumber}`);
          console.log(`   Auth token (first 50 chars): ${authToken.substring(0, 50)}...`);

          const response = await this.axiosInstance.get(`/auth/${referenceNumber}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });

          console.log(`   Response status: ${response.status}`, JSON.stringify(response.data).substring(0, 200));

          // Response structure: { status: { code, description }, ... }
          if (response.data && response.data.status) {
            const status = response.data.status;
            console.log(`   Auth Status: ${status.code} - ${status.description}`);

            // Status 200 means authentication is complete and successful
            if (status.code === 200) {
              console.log('✓ Authentication status check successful');
              return true;
            }

            // Status 100 or similar means still in progress
            if (status.code === 100) {
              console.log('   ⏳ Authentication in progress, waiting...');
              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              continue;
            }

            // Status 450 or other failure codes = permanent error
            if (status.code !== 100 && status.code !== 200) {
              console.error(`❌ Authentication failed with status ${status.code}: ${status.description}`);
              return false;
            }

            // Check if description indicates completion
            if (status.description && status.description.toLowerCase().includes('sukces')) {
              console.log('✓ Authentication completed successfully');
              return true;
            }
          } else {
            console.log('   ℹ️  No status in response, waiting...');
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        } catch (pollError: any) {
          // If we get a 404, the operation might still be processing
          if (pollError.response?.status === 404) {
            console.log('   ⏳ Status not yet available (404), retrying...');
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            continue;
          }
          console.error(`   ❌ Poll error (attempt ${pollAttempt}):`, pollError.message);
          throw pollError;
        }
      }

      console.error('❌ Timeout waiting for authentication status');
      return false;
    } catch (error: any) {
      console.error('❌ Error checking authentication status:', error.message);
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data).substring(0, 300));
      }
      return false;
    }
  }

  /**
   * Wait for token auth status to be ready (with shorter timeout than XAdES)
   * Token auth sometimes requires waiting for status 200
   */
  private async waitForTokenAuthStatus(referenceNumber: string, authToken: string, maxWaitMs: number = 5000): Promise<boolean> {
    try {
      const startTime = Date.now();
      const pollIntervalMs = 500; // Check every 500ms (faster than XAdES)
      let pollAttempt = 0;

      while (Date.now() - startTime < maxWaitMs) {
        pollAttempt++;
        try {
          console.log(`   Poll attempt ${pollAttempt}...`);
          const response = await this.axiosInstance.get(`/auth/${referenceNumber}`, {
            headers: {
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (response.data && response.data.status) {
            const status = response.data.status;
            console.log(`   Auth Status: ${status.code} - ${status.description}`);

            // Status 200 = ready for redemption
            if (status.code === 200) {
              console.log('✓ Authentication status ready for redemption');
              return true;
            }

            // Status 100 = still in progress, continue polling
            if (status.code === 100) {
              console.log('   ⏳ Still in progress, retrying...');
              await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              continue;
            }

            // Other statuses = error
            console.error(`❌ Authentication status error: ${status.code} - ${status.description}`);
            return false;
          }

          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        } catch (pollError: any) {
          if (pollError.response?.status === 404) {
            console.log('   ⏳ Status not yet available (404), retrying...');
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            continue;
          }
          console.error(`   Poll error: ${pollError.message}`);
          // For token auth, retry on transient errors
          await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        }
      }

      console.warn('⚠️  Timeout waiting for status, proceeding to redemption anyway');
      return true; // Proceed anyway for token auth
    } catch (error: any) {
      console.error('❌ Error checking status:', error.message);
      return true; // Proceed anyway for token auth
    }
  }

  /**
   * Redeem temporary auth token to get actual accessToken and refreshToken
   */
  private async redeemAccessToken(tempAuthToken: string): Promise<any> {
    try {
      const response = await this.axiosInstance.post('/auth/token/redeem', {}, {
        headers: {
          'Authorization': `Bearer ${tempAuthToken}`,
        },
      });

      // Response contains: { accessToken: { token, validUntil }, refreshToken: { token, validUntil } }
      if (response.data && response.data.accessToken) {
        console.log('✓ Access token redeemed');
        // Return just the token object from accessToken
        return response.data.accessToken;
      }

      console.error('❌ No access token in redeem response');
      console.error('   Response:', JSON.stringify(response.data).substring(0, 300));
      return null;
    } catch (error: any) {
      console.error('❌ Error redeeming access token:', error.message);
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data).substring(0, 300));
      }
      return null;
    }
  }

  /**
   * Fetch received invoices metadata from KSeF (Subject2 = buyer - faktury zakupione)
   */
  async getReceivedInvoices(limit: number = 100, offset: number = 0): Promise<KSeFInvoice[]> {
    try {
      // Try to get from cache first
      const cacheExpiration = 5 * 60 * 1000; // 5 minutes
      const cachedInvoices = await getInvoicesByType('received', limit, offset);

      if (cachedInvoices && cachedInvoices.length > 0) {
        const lastCachedTime = new Date(cachedInvoices[0].cached_at).getTime();
        const now = Date.now();

        if (now - lastCachedTime < cacheExpiration) {
          console.log(`📦 Using cached RECEIVED invoices (${cachedInvoices.length} invoices)`);
          return cachedInvoices.map(inv => JSON.parse(inv.data));
        }
      }

      // Ensure we're initialized
      if (!this.isInitialized()) {
        console.log('⚠️  Service not initialized, attempting to initialize...');
        const initialized = await this.initialize();
        if (!initialized) {
          console.error('❌ KSeF service initialization failed - cannot fetch invoices');
          // Return cached invoices even if stale
          if (cachedInvoices && cachedInvoices.length > 0) {
            return cachedInvoices.map(inv => JSON.parse(inv.data));
          }
          return [];
        }
      }

      console.log(`📊 Fetching RECEIVED invoices from KSeF (limit: ${limit}, offset: ${offset})`);

      // Query params in URL, not body!
      const url = `/invoices/query/metadata?pageSize=${limit}&pageOffset=${offset}&sortOrder=Asc`;

      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const toDate = new Date().toISOString();
      console.log(`   Date range: ${fromDate} to ${toDate}`);

      const response = await this.axiosInstance.post(url, {
        subjectType: 'Subject2', // Nabywca (faktury zakupione)
        dateRange: {
          dateType: 'PermanentStorage',
          from: fromDate,
          to: toDate,
        },
      }) as any;

      if (response.data && response.data.invoices && Array.isArray(response.data.invoices)) {
        const invoices = response.data.invoices.map((inv: InvoiceMetadata) =>
          this.mapMetadataToInvoice(inv, 'received')
        );

        // Cache the invoices
        console.log(`💾 Caching ${invoices.length} received invoices to database...`);
        for (const invoice of invoices) {
          try {
            const cached = await cacheInvoice({
              id: invoice.id,
              ksef_id: invoice.ksefNumber,
              type: 'received',
              number: invoice.invoiceNumber,
              seller_name: invoice.seller?.name,
              seller_tax_id: invoice.seller?.taxId,
              buyer_name: invoice.buyer?.name,
              buyer_tax_id: invoice.buyer?.taxId,
              amount: invoice.grossAmount || invoice.amount,
              currency: invoice.currency,
              issue_date: invoice.issueDate,
              due_date: invoice.dueDate,
              status: invoice.status,
              data: JSON.stringify(invoice),
            });
            if (!cached) {
              console.warn(`⚠️  Failed to cache invoice: ${invoice.id}`);
            }
          } catch (cacheErr) {
            console.error(`❌ Error caching invoice ${invoice.id}:`, cacheErr);
          }
        }
        console.log(`✓ Invoices cached successfully`);

        console.log(`✓ Successfully fetched ${invoices.length} received invoices from KSeF and cached them`);
        return invoices;
      } else {
        console.warn('⚠️  Response invoices empty or malformed');
      }

      return [];
    } catch (error: any) {
      console.error('❌ Error fetching received invoices from KSeF:', error.message);
      if (error.response?.status === 401) {
        console.error('   ⚠️  Authentication failed - token may be invalid or expired');
        this.accessToken = null;
      }
      // Return cached invoices as fallback
      const cachedInvoices = await getInvoicesByType('received', limit, offset);
      if (cachedInvoices && cachedInvoices.length > 0) {
        console.log('📦 Returning cached invoices as fallback');
        return cachedInvoices.map(inv => JSON.parse(inv.data));
      }
      return [];
    }
  }

  /**
   * Fetch sent invoices metadata from KSeF (Subject1 = seller - faktury wydane)
   */
  async getSentInvoices(limit: number = 100, offset: number = 0): Promise<KSeFInvoice[]> {
    try {
      // Try to get from cache first
      const cacheExpiration = 5 * 60 * 1000; // 5 minutes
      const cachedInvoices = await getInvoicesByType('sent', limit, offset);

      if (cachedInvoices && cachedInvoices.length > 0) {
        const lastCachedTime = new Date(cachedInvoices[0].cached_at).getTime();
        const now = Date.now();

        if (now - lastCachedTime < cacheExpiration) {
          console.log(`📦 Using cached SENT invoices (${cachedInvoices.length} invoices)`);
          return cachedInvoices.map(inv => JSON.parse(inv.data));
        }
      }

      // Ensure we're initialized
      if (!this.isInitialized()) {
        console.log('⚠️  Service not initialized, attempting to initialize...');
        const initialized = await this.initialize();
        if (!initialized) {
          console.error('❌ KSeF service initialization failed - cannot fetch invoices');
          // Return cached invoices even if stale
          if (cachedInvoices && cachedInvoices.length > 0) {
            return cachedInvoices.map(inv => JSON.parse(inv.data));
          }
          return [];
        }
      }

      console.log(`📊 Fetching SENT invoices from KSeF (limit: ${limit}, offset: ${offset})`);

      // Query params in URL, not body!
      const url = `/invoices/query/metadata?pageSize=${limit}&pageOffset=${offset}&sortOrder=Asc`;

      const response = await this.axiosInstance.post(url, {
        subjectType: 'Subject1', // Sprzedawca (faktury wydane)
        dateRange: {
          dateType: 'PermanentStorage',
          from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
          to: new Date().toISOString(),
        },
      }) as any;

      if (response.data && response.data.invoices && Array.isArray(response.data.invoices)) {
        const invoices = response.data.invoices.map((inv: InvoiceMetadata) =>
          this.mapMetadataToInvoice(inv, 'sent')
        );

        // Cache the invoices
        console.log(`💾 Caching ${invoices.length} sent invoices to database...`);
        for (const invoice of invoices) {
          try {
            const cached = await cacheInvoice({
              id: invoice.id,
              ksef_id: invoice.ksefNumber,
              type: 'sent',
              number: invoice.invoiceNumber,
              seller_name: invoice.seller?.name,
              seller_tax_id: invoice.seller?.taxId,
              buyer_name: invoice.buyer?.name,
              buyer_tax_id: invoice.buyer?.taxId,
              amount: invoice.grossAmount || invoice.amount,
              currency: invoice.currency,
              issue_date: invoice.issueDate,
              due_date: invoice.dueDate,
              status: invoice.status,
              data: JSON.stringify(invoice),
            });
            if (!cached) {
              console.warn(`⚠️  Failed to cache invoice: ${invoice.id}`);
            }
          } catch (cacheErr) {
            console.error(`❌ Error caching invoice ${invoice.id}:`, cacheErr);
          }
        }
        console.log(`✓ Invoices cached successfully`);

        console.log(`✓ Successfully fetched ${invoices.length} sent invoices from KSeF and cached them`);
        return invoices;
      } else {
        console.warn('⚠️  Response invoices empty or malformed');
      }

      return [];
    } catch (error: any) {
      console.error('❌ Error fetching sent invoices from KSeF:', error.message);
      if (error.response?.status === 401) {
        console.error('   ⚠️  Authentication failed - token may be invalid or expired');
        this.accessToken = null;
      }
      // Return cached invoices as fallback
      const cachedInvoices = await getInvoicesByType('sent', limit, offset);
      if (cachedInvoices && cachedInvoices.length > 0) {
        console.log('📦 Returning cached invoices as fallback');
        return cachedInvoices.map(inv => JSON.parse(inv.data));
      }
      return [];
    }
  }

  /**
   * Map KSeF metadata to our Invoice interface
   */
  private mapMetadataToInvoice(metadata: InvoiceMetadata, type: 'received' | 'sent'): KSeFInvoice {
    const fallbackKsefNumber = (metadata as any).ksefReferenceNumber || metadata.ksefNumber;
    return {
      id: metadata.ksefNumber || fallbackKsefNumber,
      ksefNumber: metadata.ksefNumber || fallbackKsefNumber,
      invoiceNumber: metadata.invoiceNumber,
      number: metadata.invoiceNumber, // Frontend expects this field
      issueDate: metadata.issueDate,
      dueDate: metadata.invoicingDate || metadata.issueDate,
      amount: metadata.grossAmount, // Always show gross amount on list
      netAmount: metadata.netAmount,
      grossAmount: metadata.grossAmount,
      currency: metadata.currency || 'PLN',
      status: type,
      type,
      seller:
        type === 'received'
          ? {
              name: metadata.seller?.name || 'Unknown',
              taxId: metadata.seller?.nip || '',
            }
          : undefined,
      buyer:
        type === 'sent'
          ? {
              name: metadata.buyer?.name || 'Unknown',
              taxId: '',
            }
          : undefined,
    };
  }

  /**
   * Check if service has valid access token
   */
  isInitialized(): boolean {
    return !!this.accessToken && (!this.tokenExpiration || this.tokenExpiration > new Date());
  }

  /**
   * Get invoice details from KSeF
   */
  async getInvoiceDetails(ksefNumber: string): Promise<any> {
    try {
      if (!this.accessToken) {
        console.error('❌ KSeF service not authenticated');
        return null;
      }

      console.log(`📋 Fetching invoice details for: ${ksefNumber}`);

      const response = await this.axiosInstance.get(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
        responseType: 'arraybuffer'
      });

      const parsed = await this.extractInvoicePayload(response);

      if (parsed) {
        console.log(`✓ Retrieved invoice details for ${ksefNumber}`);
        return parsed;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Error fetching invoice details:', error.message);
      return null;
    }
  }

  /**
   * Download invoice as PDF
   * Generates PDF from invoice data fetched from KSeF
   */
  async downloadInvoicePdf(ksefNumber: string): Promise<Buffer | null> {
    try {
      if (!this.accessToken) {
        console.error('❌ KSeF service not authenticated');
        return null;
      }

      console.log(`📄 Generating PDF for invoice: ${ksefNumber}`);

      // Fetch invoice details from KSeF
      const invoiceData = await this.getInvoiceDetails(ksefNumber);

      if (!invoiceData) {
        console.error('❌ Could not fetch invoice details');
        return null;
      }

      // Debug: Log the raw data received from KSeF
      console.log('📦 Raw invoiceData type:', typeof invoiceData);
      console.log('📦 Raw invoiceData length:', invoiceData?.length || 'N/A');
      if (typeof invoiceData === 'string') {
        console.log('📦 First 500 chars of XML:', invoiceData.substring(0, 500));
      } else {
        console.log('📦 invoiceData keys:', Object.keys(invoiceData || {}).slice(0, 10));
        console.log('📦 invoiceData structure:', JSON.stringify(invoiceData).substring(0, 500));
      }

      // Generate PDF from invoice data (now returns Promise<Buffer>)
      // Pass ksefNumber explicitly since it's not in XML
      const pdfBuffer = await this.generateInvoicePdf(invoiceData, ksefNumber);

      if (pdfBuffer) {
        console.log(`✓ Generated PDF for ${ksefNumber} (${pdfBuffer.length} bytes)`);
        return pdfBuffer;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Error generating PDF:', error.message);
      return null;
    }
  }

  /**
   * Generate PDF document from invoice data using Puppeteer (HTML→PDF)
   */
  private async generateInvoicePdf(invoiceData: any, ksefNumberParam?: string): Promise<Buffer> {
    try {
      // Parse XML if needed (KSeF may omit XML declaration)
      let data = invoiceData;
      if (typeof invoiceData === 'string') {
        console.log('📋 Parsing XML invoice data...');

        // Save raw XML to file for debugging
        const tmpFile = path.join(__dirname, '../../', 'debug-invoice.xml');
        fs.writeFileSync(tmpFile, invoiceData);
        console.log(`✓ Raw XML saved to: ${tmpFile}`);

        data = await parseStringPromise(invoiceData);
        console.log('✓ XML parsed successfully');
        console.log('📊 Parsed XML structure keys:', Object.keys(data));

        // Save parsed structure for debugging
        const debugStructure = JSON.stringify(data, null, 2).substring(0, 5000);
        fs.writeFileSync(path.join(__dirname, '../../', 'debug-parsed.json'), debugStructure);
        console.log('✓ Parsed structure saved to debug-parsed.json');
      }

      // Debug: Log the structure to understand KSeF XML format
      console.log('📊 Data structure keys:', Object.keys(data || {}));

      // Helper to extract value from either array or direct value (xml2js converts elements to arrays)
      const getVal = (val: any): string => {
        if (Array.isArray(val)) return val[0]?.toString() || '';
        return val?.toString() || '';
      };

      // KSeF XML structure: root is Faktura (may have namespace like tns:Faktura)
      let faktura = null;
      const rootKeys = Object.keys(data || {});
      for (const key of rootKeys) {
        if (key.includes('Faktura')) {
          faktura = this.getFirstElement(data[key]);
          console.log(`✓ Found Faktura element: ${key}`);
          break;
        }
      }

      if (!faktura) {
        console.error('❌ No Faktura element found!');
        throw new Error('No Faktura element in XML');
      }

      // Extract main components (handle namespaces)
      const naglowek = this.findElementByName(faktura, 'Naglowek');
      const podmiot1 = this.findElementByName(faktura, 'Podmiot1');  // Seller
      const podmiot2 = this.findElementByName(faktura, 'Podmiot2');  // Buyer
      const faSection = this.findElementByName(faktura, 'Fa');      // Main invoice data

      console.log('✓ Found components:', { naglowek: !!naglowek, podmiot1: !!podmiot1, podmiot2: !!podmiot2, faSection: !!faSection });

      // KSeF uses field codes: P_1=issueDate, P_2=invoiceNumber, P_13_1=netAmount, P_15=grossAmount
      const invoiceNumber = getVal(this.findElementByName(faSection, 'P_2')) || 'N/A';
      // Use parameter if provided, otherwise try to find in XML
      const ksefNumber = ksefNumberParam || getVal(this.findElementByName(naglowek, 'NumerKSeF')) || 'N/A';
      const issueDate = getVal(this.findElementByName(faSection, 'P_1')) || 'N/A';
      const dueDate = getVal(this.findElementByName(faSection, 'P_6')) || 'N/A';

      // Extract seller info
      const podmiot1Dane = this.findElementByName(podmiot1, 'DaneIdentyfikacyjne');
      const sellerName = getVal(this.findElementByName(podmiot1Dane, 'Nazwa')) || 'N/A';
      const sellerNip = getVal(this.findElementByName(podmiot1Dane, 'NIP')) || 'N/A';
      const sellerAdres = this.findElementByName(podmiot1, 'Adres');

      // Extract buyer info
      const podmiot2Dane = this.findElementByName(podmiot2, 'DaneIdentyfikacyjne');
      const buyerName = getVal(this.findElementByName(podmiot2Dane, 'Nazwa')) || 'N/A';
      const buyerNip = getVal(this.findElementByName(podmiot2Dane, 'NIP')) || 'N/A';
      const buyerAdres = this.findElementByName(podmiot2, 'Adres');

      // Extract amounts from Fa section (KSeF field codes)
      const netAmount = parseFloat(getVal(this.findElementByName(faSection, 'P_13_1')) || '0');
      const grossAmount = parseFloat(getVal(this.findElementByName(faSection, 'P_15')) || '0');
      const taxAmount = (grossAmount - netAmount) || 0;

      // Extract payment information from Platnosc section
      const platnoscSection = this.findElementByName(faSection, 'P_Platnosc') || this.findElementByName(faSection, 'Platnosc');
      let paymentData: any = null;
      if (platnoscSection) {
        const zaplacono = getVal(this.findElementByName(platnoscSection, 'Zaplacono'));
        const dataZaplaty = getVal(this.findElementByName(platnoscSection, 'DataZaplaty'));
        const platnoscInna = getVal(this.findElementByName(platnoscSection, 'PlatnoscInna'));
        const opisPlatnosci = getVal(this.findElementByName(platnoscSection, 'OpisPlatnosci'));
        const formaPlat = getVal(this.findElementByName(platnoscSection, 'FormaPlatnosci'));

        // Extract TerminPlatnosci
        const terminPlatnosci = this.findElementByName(platnoscSection, 'TerminPlatnosci');
        let terminData: any = null;
        if (terminPlatnosci) {
          const termin = getVal(this.findElementByName(terminPlatnosci, 'Termin'));
          const terminOpisSection = this.findElementByName(terminPlatnosci, 'TerminOpis');
          let terminOpisText = '';
          if (terminOpisSection) {
            const ilosc = getVal(this.findElementByName(terminOpisSection, 'Ilosc'));
            const jednostka = getVal(this.findElementByName(terminOpisSection, 'Jednostka'));
            const zdarzenie = getVal(this.findElementByName(terminOpisSection, 'ZdarzeniePoczatkowe'));
            terminOpisText = `${ilosc} ${jednostka} ${zdarzenie}`;
          }
          terminData = {
            termin: this.formatDate(termin),
            opis: terminOpisText
          };
        }

        // Extract RachunekBankowy
        const rachunekSection = this.findElementByName(platnoscSection, 'RachunekBankowy');
        let rachunekData: any = null;
        if (rachunekSection) {
          rachunekData = {
            nrRB: getVal(this.findElementByName(rachunekSection, 'NrRB')) || '',
            swift: getVal(this.findElementByName(rachunekSection, 'SWIFT')) || '',
            nazwaBanku: getVal(this.findElementByName(rachunekSection, 'NazwaBanku')) || '',
            opisRachunku: getVal(this.findElementByName(rachunekSection, 'OpisRachunku')) || ''
          };
        }

        // Map FormaPlatnosci code to name
        const formaPlatnosciMap: any = {
          '1': 'Przelew',
          '2': 'Karta',
          '3': 'Gotówka',
          '4': 'Czek',
          '5': 'Weksel',
          '6': 'Przelew'
        };

        paymentData = {
          paid: zaplacono === '1',
          paymentDate: this.formatDate(dataZaplaty),
          isOtherPayment: platnoscInna === '1',
          paymentDescription: opisPlatnosci,
          dueDate: this.formatDate(terminPlatnosci ? getVal(this.findElementByName(terminPlatnosci, 'Termin')) : ''),
          formaPlatnosci: formaPlatnosciMap[formaPlat] || 'Inne',
          terminPlatnosci: terminData,
          rachunekBankowy: rachunekData
        };
        console.log('💳 Payment data extracted:', paymentData);
      }

      // Extract transaction conditions (Warunki transakcji)
      const warunkiSection = this.findElementByName(faSection, 'WarunkiTransakcji');
      let transactionData: any = null;
      if (warunkiSection) {
        const zamowieniaSection = this.findElementByName(warunkiSection, 'Zamowienia');
        if (zamowieniaSection) {
          const dataZamowienia = getVal(this.findElementByName(zamowieniaSection, 'DataZamowienia'));
          const nrZamowienia = getVal(this.findElementByName(zamowieniaSection, 'NrZamowienia'));
          transactionData = {
            orderDate: this.formatDate(dataZamowienia),
            orderNumber: nrZamowienia
          };
          console.log('📦 Transaction data extracted:', transactionData);
        }
      }

      // Extract footer information
      const stopkaSection = this.findElementByName(faktura, 'Stopka');
      let footerData: any = null;
      if (stopkaSection) {
        const informacjeSection = this.findElementByName(stopkaSection, 'Informacje');
        const rejestrySection = this.findElementByName(stopkaSection, 'Rejestry');

        let stopkaFaktury = '';
        if (informacjeSection) {
          stopkaFaktury = getVal(this.findElementByName(informacjeSection, 'StopkaFaktury')) || '';
        }

        let pelnaNazwa = '';
        let krs = '';
        let regon = '';
        let bdo = '';
        if (rejestrySection) {
          pelnaNazwa = getVal(this.findElementByName(rejestrySection, 'PelnaNazwa')) || '';
          krs = getVal(this.findElementByName(rejestrySection, 'KRS')) || '';
          regon = getVal(this.findElementByName(rejestrySection, 'REGON')) || '';
          bdo = getVal(this.findElementByName(rejestrySection, 'BDO')) || '';
        }

        footerData = {
          stopkaFaktury: stopkaFaktury.trim(),
          pelnaNazwa: pelnaNazwa,
          krs,
          regon,
          bdo
        };
        console.log('📝 Footer data extracted');
      }

      // Get invoice lines (FaWiersz = row/line item)
      // XML uses namespace: tns:FaWiersz
      let pozycje: any[] = [];

      console.log('📍 Faktura keys:', Object.keys(faktura || {}).slice(0, 20));

      // FaWiersz is inside Fa section, not at root faktura level
      let rawFaWiersze = null;
      if (faSection) {
        console.log('📍 Checking within Fa section...');
        console.log('📍 Fa section keys:', Object.keys(faSection || {}).slice(0, 20));

        // Try with namespace first (tns:FaWiersz)
        rawFaWiersze = faSection?.['tns:FaWiersz'] ||
                      faSection?.['FaWiersz'] ||
                      faSection?.FaWiersz ||
                      null;
      }

      console.log('📍 rawFaWiersze type:', typeof rawFaWiersze, 'isArray:', Array.isArray(rawFaWiersze));

      if (Array.isArray(rawFaWiersze)) {
        console.log(`✓ FaWiersz is array with ${rawFaWiersze.length} items`);
        pozycje = rawFaWiersze;
      } else if (rawFaWiersze) {
        console.log('✓ FaWiersz is single item');
        pozycje = [rawFaWiersze];
      } else {
        console.error('❌ No FaWiersz found in Fa section!');
      }

      // Save structure for debugging
      fs.writeFileSync(path.join(__dirname, '../../', 'debug-struktura.json'),
        JSON.stringify({ faKeys: Object.keys(faktura || {}), pozycjeCount: pozycje.length }, null, 2));

      console.log(`✓ Found ${pozycje.length} invoice lines`);


      // Map invoice lines using KSeF field codes
      // P_7=description, P_8A=unit, P_8B=quantity, P_9A=unitPrice, P_11=netValue, P_12=taxRate, P_11A=grossValue
      const items = pozycje.map((item: any) => {
        const taxRate = getVal(this.findElementByName(item, 'P_12')) || '23';
        const uuId = getVal(this.findElementByName(item, 'UU_ID')) || '';
        const indeks = getVal(this.findElementByName(item, 'Indeks')) || '';
        return {
          name: getVal(this.findElementByName(item, 'P_7')) || '',
          quantity: getVal(this.findElementByName(item, 'P_8B')) || '1',
          unit: getVal(this.findElementByName(item, 'P_8A')) || 'szt.',
          priceNet: getVal(this.findElementByName(item, 'P_9A')) || '0',
          rate: taxRate + '%',
          valueNet: getVal(this.findElementByName(item, 'P_11')) || '0',
          valueGross: getVal(this.findElementByName(item, 'P_11A')) || getVal(this.findElementByName(item, 'P_11')) || '0',
          uuId,
          indeks
        };
      });

      // Extract WZ (Numery dokumentów)
      const wzNumbers = getVal(this.findElementByName(faSection, 'WZ')) || '';

      // Extract DodatkowyOpis (Dodatkowe informacje)
      let dodatkowyOpisArray: any[] = [];
      if (faSection) {
        const rawDodatkowy = faSection?.['DodatkowyOpis'];
        if (Array.isArray(rawDodatkowy)) {
          dodatkowyOpisArray = rawDodatkowy;
        } else if (rawDodatkowy) {
          dodatkowyOpisArray = [rawDodatkowy];
        }
      }
      const dodatkowyOpis = dodatkowyOpisArray.map((item: any) => ({
        nrWiersza: getVal(this.findElementByName(item, 'NrWiersza')) || '',
        klucz: getVal(this.findElementByName(item, 'Klucz')) || '',
        wartosc: getVal(this.findElementByName(item, 'Wartosc')) || ''
      }));
      console.log(`✓ Extracted ${dodatkowyOpis.length} additional descriptions and WZ: ${wzNumbers}`);

      console.log('📊 Extracted data:', {
        invoiceNumber,
        ksefNumber,
        issueDate,
        sellerName,
        buyerName,
        netAmount,
        grossAmount,
        itemCount: items.length
      });

      // Generate QR code for KSeF number
      let qrCodeDataUrl = '';
      try {
        qrCodeDataUrl = await QRCode.toDataURL(ksefNumber, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 200,
          margin: 2
        });
        console.log('✓ QR code generated successfully');
      } catch (qrError) {
        console.warn('⚠️  QR code generation failed, continuing without QR:', qrError);
      }

      // Generate HTML (both pages)
      const html = this.generateInvoiceHtml({
        invoiceNumber,
        ksefNumber,
        issueDate: this.formatDate(issueDate),
        dueDate: this.formatDate(dueDate),
        sellerName,
        sellerNip,
        sellerAddress: this.formatAddress(sellerAdres),
        buyerName,
        buyerNip,
        buyerAddress: this.formatAddress(buyerAdres),
        netAmount,
        taxAmount,
        grossAmount,
        currency: 'PLN',
        items,
        paymentData,
        transactionData,
        footerData,
        qrCodeDataUrl,
        wzNumbers,
        dodatkowyOpis
      });

      // Generate PDF using Puppeteer
      console.log('🖥️  Starting Puppeteer to generate PDF...');
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log('✓ Puppeteer browser launched');

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        console.log('✓ HTML content loaded');

        const pdfUint8Array = await page.pdf({
          format: 'A4',
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
          displayHeaderFooter: false
        });

        // Convert Uint8Array to Buffer
        const pdfBuffer = Buffer.from(pdfUint8Array);

        console.log(`✓ PDF generated successfully (${pdfBuffer.length} bytes)`);
        console.log(`✓ PDF buffer is Buffer type: ${Buffer.isBuffer(pdfBuffer)}`);

        await browser.close();
        return pdfBuffer;
      } catch (puppeteerError) {
        console.error('❌ Puppeteer error:', puppeteerError);
        if (browser) {
          await browser.close();
        }
        throw puppeteerError;
      }
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      throw error;
    }
  }

  /**
   * Get first element from array or return as-is
   * xml2js converts XML elements to arrays, this helper unwraps them
   */
  private getFirstElement(val: any): any {
    if (Array.isArray(val)) {
      return val[0];
    }
    return val;
  }

  /**
   * Find element by name, handling XML namespaces and case sensitivity
   * KSeF XML may or may not have namespaces (tns:Faktura or just Faktura)
   */
  private findElementByName(obj: any, name: string): any {
    if (!obj) return null;

    // Direct match (no namespace)
    if (obj[name] !== undefined) {
      return this.getFirstElement(obj[name]);
    }

    // Case-insensitive match
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === lowerName || lowerKey.endsWith(`:${lowerName}`)) {
        return this.getFirstElement(obj[key]);
      }
    }

    return null;
  }

  /**
   * Format address from XML structure
   * KSeF may have AdresL1 (single line) or separate fields (UlicaNumer, KodPocztowy, Miasto)
   */
  private formatAddress(address: any): string {
    if (!address) return 'N/A';

    // Try AdresL1 first (full address in one field)
    const adresL1 = this.findElementByName(address, 'AdresL1');
    if (adresL1) {
      return adresL1;
    }

    // Fallback to separate fields
    const parts = [
      this.findElementByName(address, 'UlicaNumer') || '',
      this.findElementByName(address, 'KodPocztowy') || '',
      this.findElementByName(address, 'Miasto') || ''
    ];
    return parts.filter(p => p).join(' ').trim() || 'N/A';
  }

  /**
   * Format date from YYYY-MM-DD to DD.MM.YYYY (Polish format)
   */
  private formatDate(dateStr: string): string {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}.${match[2]}.${match[1]}`;
    }
    return dateStr;
  }

  /**
   * Generate HTML for invoice (KSeF style) - 2 pages
   */
  private generateInvoiceHtml(data: any): string {
    const itemsHtml = data.items.map((item: any) => `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; font-size: 7px;">${item.name}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right; font-size: 7px;">${item.priceNet}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; font-size: 7px;">${item.quantity}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; font-size: 7px;">${item.unit}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: center; font-size: 7px;">${item.rate}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right; font-size: 7px;">${item.valueNet}</td>
        <td style="padding: 6px; border-bottom: 1px solid #ddd; text-align: right; font-size: 7px;">${item.valueGross}</td>
      </tr>
    `).join('');

    const page2Content = `
      <div class="page-break"></div>
      <div class="page2">
        ${data.footerData?.stopkaFaktury ? `
        <div class="section">
          <div class="section-title">Pozostałe informacje</div>
          <div style="border: 1px solid #ddd; padding: 12px; font-size: 8px;">
            <div style="white-space: pre-wrap; line-height: 1.4;">
${data.footerData.stopkaFaktury}
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Dodatkowe informacje -->
        ${data.dodatkowyOpis && data.dodatkowyOpis.length > 0 ? `
        <div class="section">
          <div class="section-title">Dodatkowe informacje</div>
          <div style="font-weight: bold; margin-bottom: 8px; font-size: 8px;">Dodatkowy opis</div>
          <table style="font-size: 7px;">
            <thead>
              <tr>
                <th style="width: 10%; text-align: center;">Lp.</th>
                <th style="width: 25%;">Numer wiersza</th>
                <th style="width: 35%;">Rodzaj informacji</th>
                <th style="width: 30%;">Treść informacji</th>
              </tr>
            </thead>
            <tbody>
              ${data.dodatkowyOpis.map((item: any, idx: number) => `
              <tr>
                <td style="text-align: center; padding: 4px; border: 1px solid #ddd;">${idx + 1}</td>
                <td style="padding: 4px; border: 1px solid #ddd;">${item.nrWiersza}</td>
                <td style="padding: 4px; border: 1px solid #ddd;">${item.klucz}</td>
                <td style="padding: 4px; border: 1px solid #ddd;">${item.wartosc}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <!-- Numery WZ -->
        ${data.wzNumbers ? `
        <div class="section">
          <div class="section-title">Numery dokumentów magazynowych WZ</div>
          <p style="font-size: 8px; margin: 5px 0;"><strong>Numer WZ</strong></p>
          <p style="font-size: 8px; margin: 5px 0; padding: 8px; border: 1px solid #ddd; background: #f9f9f9;">${data.wzNumbers}</p>
        </div>
        ` : ''}

        <!-- Numer rachunku bankowego -->
        ${data.paymentData?.rachunekBankowy ? `
        <div class="section">
          <div class="section-title">Numer rachunku bankowego</div>
          <table style="font-size: 7px;">
            <tr>
              <td style="padding: 4px; border: 1px solid #ddd; width: 40%; font-weight: bold;">Pełny numer rachunku</td>
              <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.nrRB}</td>
            </tr>
            <tr>
              <td style="padding: 4px; border: 1px solid #ddd; font-weight: bold;">Kod SWIFT</td>
              <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.swift}</td>
            </tr>
            <tr>
              <td style="padding: 4px; border: 1px solid #ddd; font-weight: bold;">Nazwa banku</td>
              <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.nazwaBanku}</td>
            </tr>
            <tr>
              <td style="padding: 4px; border: 1px solid #ddd; font-weight: bold;">Opis rachunku</td>
              <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.opisRachunku}</td>
            </tr>
          </table>
        </div>
        ` : ''}

        <!-- Rejestry -->
        ${data.footerData && (data.footerData.krs || data.footerData.regon || data.footerData.bdo) ? `
        <div class="section">
          <div class="section-title">Rejestry</div>
          <table style="font-size: 7px;">
            <thead>
              <tr>
                <th>Pełna nazwa</th>
                <th style="text-align: center;">KRS</th>
                <th style="text-align: center;">REGON</th>
                <th style="text-align: center;">BDO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 4px; border: 1px solid #ddd;">${data.footerData.pelnaNazwa}</td>
                <td style="text-align: center; padding: 4px; border: 1px solid #ddd;">${data.footerData.krs}</td>
                <td style="text-align: center; padding: 4px; border: 1px solid #ddd;">${data.footerData.regon}</td>
                <td style="text-align: center; padding: 4px; border: 1px solid #ddd;">${data.footerData.bdo}</td>
              </tr>
            </tbody>
          </table>
        </div>
        ` : ''}

        ${data.qrCodeDataUrl ? `
        <div class="section">
          <div class="section-title">Sprawdź, czy Twoja faktura znajduje się w KSeF!</div>
          <div style="text-align: center; padding: 20px;">
            <img src="${data.qrCodeDataUrl}" style="max-width: 200px; margin: 0 auto;">
            <p style="font-size: 10px; margin-top: 10px; color: #666;">
              ${data.ksefNumber}
            </p>
          </div>
        </div>
        ` : ''}

        <div class="footer">
          <p>Wytworzona w: ${data.sellerName}</p>
        </div>
      </div>
    `;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Faktura ${data.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      background: white;
    }
    .page-break { page-break-after: always; }
    .page2 { page-break-before: always; padding-top: 20px; }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 20px;
    }
    .header-left h1 {
      margin: 0;
      font-size: 20px;
      color: #333;
    }
    .header-left h1 .red { color: #d32f2f; }
    .header-right {
      text-align: right;
      margin-top: 12px;
    }
    .header-right p {
      margin: 2px 0;
      font-size: 13px;
    }
    .header-right .invoice-num {
      font-weight: bold;
      font-size: 16px;
      margin-bottom: 8px;
    }

    .content { margin: 20px 0; font-size: 8px; }
    .section { margin-bottom: 20px; }
    .section-title {
      font-weight: bold;
      font-size: 10px;
      text-transform: uppercase;
      margin-bottom: 10px;
      border-bottom: 2px solid #333;
      padding-bottom: 5px;
      font-weight: 900;
    }

    .two-columns { display: flex; gap: 40px; margin-bottom: 20px; }
    .column { flex: 1; }
    .column p { margin: 3px 0; font-size: 9px; }
    .column-title { font-weight: bold; margin-bottom: 10px; font-size: 9px; }

    table { width: 100%; border-collapse: collapse; font-size: 7px; margin-bottom: 20px; }
    th { background: #f5f5f5; padding: 6px; text-align: left; font-weight: bold; border-bottom: 1px solid #333; font-size: 7px; }
    td { padding: 6px; border-bottom: 1px solid #ddd; font-size: 7px; }

    .summary { margin: 20px 0; }
    .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 8px; }
    .summary-total { font-weight: bold; font-size: 10px; border-top: 2px solid #333; padding-top: 8px; }

    .payment-section {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #333;
    }
    .payment-section .section-title { font-size: 8px; }
    .payment-section p { font-size: 8px; margin: 2px 0; }

    .footer { text-align: center; font-size: 9px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <!-- PAGE 1 -->
  <div class="header">
    <div class="header-left">
      <h1>Krajowy System <span class="red">e</span>-Faktur</h1>
    </div>
    <div class="header-right">
      <div class="invoice-num">Numer Faktury:</div>
      <p>${data.invoiceNumber}</p>
      <p style="margin-top: 8px; font-weight: bold;">Numer KSEF:</p>
      <p>${data.ksefNumber}</p>
      <p style="font-size: 11px; color: #666; margin-top: 6px;">Faktura podstawowa</p>
    </div>
  </div>

  <div class="content">
    <div class="two-columns">
      <div class="column">
        <div class="section-title">Sprzedawca</div>
        <div class="column-title">${data.sellerName}</div>
        <p><strong>NIP:</strong> ${data.sellerNip}</p>
        <p>${data.sellerAddress}</p>
      </div>
      <div class="column">
        <div class="section-title">Nabywca</div>
        <div class="column-title">${data.buyerName}</div>
        <p><strong>NIP:</strong> ${data.buyerNip}</p>
        <p>${data.buyerAddress}</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Szczegóły</div>
      <p><strong>Data wystawienia z zastrzeżeniem art. 106na ust. 1 ustawy:</strong> ${data.issueDate}</p>
      <p><strong>Termin płatności:</strong> ${data.dueDate}</p>
      <p style="font-size: 7px; color: #666; margin-top: 10px;">Niniejsza faktura wystawiona jest na podstawie art. 106a i art. 106na ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług.</p>
    </div>

    <div class="section">
      <div class="section-title">Pozycje</div>
      <p style="font-size: 7px; margin-bottom: 10px;">Faktura wystawiona w cenach netto w walucie PLN</p>
      <table>
        <thead>
          <tr>
            <th style="word-wrap: break-word;">Nazwa towaru lub usługi</th>
            <th style="text-align: right; word-wrap: break-word;">Cena jedn. netto</th>
            <th style="text-align: center; word-wrap: break-word;">Ilość</th>
            <th style="text-align: center; word-wrap: break-word;">Miara</th>
            <th style="text-align: center; word-wrap: break-word;">Stawka podatku</th>
            <th style="text-align: right; word-wrap: break-word;">Wartość sprzedaży netto</th>
            <th style="text-align: right; word-wrap: break-word;">Wartość sprzedaży brutto</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.length > 0 ? itemsHtml : '<tr><td colspan="7" style="text-align: center; padding: 20px; color: red;">⚠️ Brak pozycji faktury</td></tr>'}
        </tbody>
      </table>
    </div>

    <div style="text-align: right; margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; background: #f9f9f9;">
      <p style="margin: 0; font-size: 10px; font-weight: bold;">Kwota należności ogółem: ${data.grossAmount.toFixed(2)} ${data.currency}</p>
    </div>


    <div class="section">
      <div class="section-title">Podsumowanie stawek podatku</div>
      <table style="margin-bottom: 0;">
        <thead>
          <tr>
            <th style="width: 30%;">Stawka podatku</th>
            <th style="text-align: right; width: 23%;">Kwota netto</th>
            <th style="text-align: right; width: 23%;">Kwota podatku</th>
            <th style="text-align: right; width: 24%;">Kwota brutto</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>23% lub 22%</td>
            <td style="text-align: right;">${data.netAmount.toFixed(2)}</td>
            <td style="text-align: right;">${data.taxAmount.toFixed(2)}</td>
            <td style="text-align: right;">${data.grossAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>


    <!-- PŁATNOŚĆ - przenieśliśmy na dół -->
    ${data.paymentData ? `
    <div class="payment-section">
      <div class="section-title">Płatność</div>
      <p><strong>Informacja o płatności:</strong> ${data.paymentData.paid ? '✓ Zapłacono' : '⧖ Nie zapłacono'}</p>
      ${data.paymentData.paymentDate ? `<p><strong>Data zapłaty:</strong> ${data.paymentData.paymentDate}</p>` : ''}
      ${data.paymentData.formaPlatnosci ? `<p><strong>Forma płatności:</strong> ${data.paymentData.formaPlatnosci}</p>` : ''}

      ${data.paymentData.terminPlatnosci ? `
      <div style="margin-top: 10px;">
        <p style="margin: 3px 0;"><strong>Termin płatności</strong></p>
        <table style="font-size: 7px; margin-top: 5px;">
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd;"><strong>Data termin</strong></td>
            <td style="padding: 4px; border: 1px solid #ddd;">Opis płatności</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.terminPlatnosci.termin}</td>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.terminPlatnosci.opis}</td>
          </tr>
        </table>
      </div>
      ` : ''}

      ${data.paymentData.rachunekBankowy ? `
      <div style="margin-top: 10px;">
        <p style="margin: 3px 0;"><strong>Numer rachunku bankowego</strong></p>
        <table style="font-size: 7px; margin-top: 5px;">
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd; width: 40%;"><strong>Pełny numer rachunku</strong></td>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.nrRB}</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd;"><strong>Kod SWIFT</strong></td>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.swift}</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd;"><strong>Nazwa banku</strong></td>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.nazwaBanku}</td>
          </tr>
          <tr>
            <td style="padding: 4px; border: 1px solid #ddd;"><strong>Opis rachunku</strong></td>
            <td style="padding: 4px; border: 1px solid #ddd;">${data.paymentData.rachunekBankowy.opisRachunku}</td>
          </tr>
        </table>
      </div>
      ` : ''}
    </div>
    ` : ''}

  </div>

  <!-- PAGE 2 -->
  ${page2Content}

</body>
</html>`;
  }

  /**
   * Download invoice as XML
   * Returns raw invoice data in XML/JSON format
   */
  async downloadInvoiceXml(ksefNumber: string): Promise<Buffer | null> {
    try {
      if (!this.accessToken) {
        console.error('❌ KSeF service not authenticated');
        return null;
      }

      console.log(`📋 Downloading invoice XML for: ${ksefNumber}`);

      const response = await this.axiosInstance.get(`/invoices/ksef/${encodeURIComponent(ksefNumber)}`, {
        responseType: 'arraybuffer'
      });
      const parsed = await this.extractInvoicePayload(response);

      if (parsed) {
        console.log(`✓ Downloaded invoice XML for ${ksefNumber}`);

        const dataStr = typeof parsed === 'string'
          ? parsed
          : JSON.stringify(parsed, null, 2);

        const buffer = Buffer.from(dataStr, 'utf-8');
        console.log(`   Size: ${buffer.length} bytes`);

        return buffer;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Error downloading invoice XML:', error.message);
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Error: ${error.response?.data?.message || error.response?.data || 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Extract invoice payload from KSeF response, handling packaged base64/gzip/zip
   */
  private async extractInvoicePayload(response: any): Promise<any> {
    try {
      const buffer = Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data);

      const contentType = (response.headers?.['content-type'] || '').toLowerCase();
      let textPayload = '';
      let jsonPayload: any = null;

      // Try to decode as UTF-8 text
      try {
        textPayload = buffer.toString('utf-8');
        if (contentType.includes('application/json')) {
          jsonPayload = JSON.parse(textPayload);
        }
      } catch {
        // ignore text parse errors
      }

      // If we have JSON, check for packaged invoice content
      if (jsonPayload) {
        const base64Package =
          jsonPayload.invoicePackage ||
          jsonPayload.invoiceFile ||
          jsonPayload.invoiceFileContent ||
          jsonPayload.invoiceBinaryContent ||
          jsonPayload.invoiceBase64;

        if (base64Package && typeof base64Package === 'string') {
          const xmlFromPackage = await this.decodeInvoicePackage(base64Package);
          if (xmlFromPackage) {
            console.log('��" Extracted XML from packaged invoice payload');
            return xmlFromPackage;
          }
        }

        // Sometimes XML is embedded directly as string field
        if (typeof jsonPayload === 'string' && jsonPayload.trim().startsWith('<?xml')) {
          return jsonPayload;
        }

        return jsonPayload;
      }

      // Not JSON: if looks like XML, return as string
      if (textPayload.trim().startsWith('<?xml')) {
        return textPayload;
      }

      // Fallback: return raw text or buffer
      return textPayload || buffer;
    } catch (err) {
      console.warn('������  Could not extract invoice payload:', err);
      return null;
    }
  }

  /**
   * Decode base64-encoded invoice package (gzip/zip/plain) to XML string
   */
  private async decodeInvoicePackage(base64Data: string): Promise<string | null> {
    try {
      const packageBuffer = Buffer.from(base64Data, 'base64');

      // Try gzip first
      try {
        const gunzipped = zlib.gunzipSync(packageBuffer);
        const xml = gunzipped.toString('utf-8');
        if (xml.trim().startsWith('<?xml')) {
          return xml;
        }
      } catch {
        // not gzip
      }

      // Try zip (first entry)
      try {
        const zip = await unzipper.Open.buffer(packageBuffer);
        if (zip.files && zip.files.length > 0) {
          const first = zip.files[0];
          const content = await first.buffer();
          const xml = content.toString('utf-8');
          if (xml.trim()) {
            return xml;
          }
        }
      } catch {
        // not zip
      }

      // Fallback: assume plain XML text
      const xml = packageBuffer.toString('utf-8');
      if (xml.trim()) {
        return xml;
      }
    } catch (error) {
      console.warn('������  Failed to decode invoice package:', error);
    }
    return null;
  }

  /**
   * Start automatic token refresh timer
   * Refreshes token 5 minutes before expiration to prevent service interruption
   */
  startTokenRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Check token every 60 seconds and refresh if needed
    this.refreshTimer = setInterval(async () => {
      try {
        if (!this.accessToken || !this.tokenExpiration) {
          return; // Service not initialized
        }

        const now = new Date();
        const timeUntilExpiry = this.tokenExpiration.getTime() - now.getTime();
        const fiveMinutesMs = 5 * 60 * 1000;

        // If token expires in less than 5 minutes, refresh it
        if (timeUntilExpiry < fiveMinutesMs) {
          console.log('⏳ Token expiring soon, refreshing...');
          const success = await this.initialize();

          if (success) {
            console.log('✅ Token refreshed successfully');
          } else {
            console.warn('⚠️  Token refresh failed - service will attempt re-auth on next request');
          }
        }
      } catch (error) {
        console.warn('⚠️  Error in token refresh timer:', error);
      }
    }, 60000); // Check every 60 seconds
  }

  /**
   * Stop automatic token refresh timer
   */
  stopTokenRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Export singleton instance
export const kSeFService = new KSeFService();
