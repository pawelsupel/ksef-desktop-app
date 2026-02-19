import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of, from, throwError } from 'rxjs';
import { catchError, tap, mergeMap } from 'rxjs/operators';

export interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  amount: number; // Gross amount
  netAmount?: number;
  grossAmount?: number;
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

export interface InvoicesResponse {
  success: boolean;
  invoices: Invoice[];
  message?: string;
}

export interface InvoiceDetailsResponse {
  success: boolean;
  invoice: any;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvoicesService {
  private apiUrl = 'http://localhost:8765/api';

  // Observable streams for invoices
  private receivedInvoicesSubject = new BehaviorSubject<Invoice[]>([]);
  private sentInvoicesSubject = new BehaviorSubject<Invoice[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  public receivedInvoices$ = this.receivedInvoicesSubject.asObservable();
  public sentInvoices$ = this.sentInvoicesSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();
  public error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Fetch received invoices from backend
   */
  getReceivedInvoices(limit: number = 100, offset: number = 0): Observable<InvoicesResponse> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.get<InvoicesResponse>(`${this.apiUrl}/invoices/received`, {
      params: { limit, offset }
    }).pipe(
      tap((response) => {
        if (response.success && response.invoices) {
          this.receivedInvoicesSubject.next(response.invoices);
          console.log(`✓ Loaded ${response.invoices.length} received invoices`);
        } else {
          this.errorSubject.next(response.message || 'Failed to load invoices');
        }
        this.loadingSubject.next(false);
      }),
      catchError((error) => {
        const errorMessage = error.error?.message || error.message || 'Error fetching invoices';
        this.errorSubject.next(errorMessage);
        this.loadingSubject.next(false);
        console.error('Error fetching received invoices:', error);
        return of({ success: false, invoices: [], message: errorMessage });
      })
    );
  }

  /**
   * Fetch sent invoices from backend
   */
  getSentInvoices(limit: number = 100, offset: number = 0): Observable<InvoicesResponse> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.get<InvoicesResponse>(`${this.apiUrl}/invoices/sent`, {
      params: { limit, offset }
    }).pipe(
      tap((response) => {
        if (response.success && response.invoices) {
          this.sentInvoicesSubject.next(response.invoices);
          console.log(`✓ Loaded ${response.invoices.length} sent invoices`);
        } else {
          this.errorSubject.next(response.message || 'Failed to load invoices');
        }
        this.loadingSubject.next(false);
      }),
      catchError((error) => {
        const errorMessage = error.error?.message || error.message || 'Error fetching invoices';
        this.errorSubject.next(errorMessage);
        this.loadingSubject.next(false);
        console.error('Error fetching sent invoices:', error);
        return of({ success: false, invoices: [], message: errorMessage });
      })
    );
  }

  /**
   * Get current received invoices
   */
  getReceivedInvoicesValue(): Invoice[] {
    return this.receivedInvoicesSubject.value;
  }

  /**
   * Get current sent invoices
   */
  getSentInvoicesValue(): Invoice[] {
    return this.sentInvoicesSubject.value;
  }

  /**
   * Get current loading state
   */
  isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.errorSubject.next(null);
  }

  /**
   * Clear all invoices
   */
  clearInvoices(): void {
    this.receivedInvoicesSubject.next([]);
    this.sentInvoicesSubject.next([]);
  }

  /**
   * Fetch invoice details by ID (ksefNumber)
   */
  getInvoiceDetails(id: string): Observable<InvoiceDetailsResponse> {
    console.log(`Fetching details for invoice: ${id}`);

    return this.http.get<InvoiceDetailsResponse>(`${this.apiUrl}/invoices/${id}`).pipe(
      tap((response) => {
        if (response.success && response.invoice) {
          console.log(`✓ Loaded invoice details for ${id}`);
        } else {
          console.error(`Failed to load invoice details: ${response.message || 'Unknown error'}`);
        }
      }),
      catchError((error) => {
        const errorMessage = error.error?.message || error.message || 'Error fetching invoice details';
        console.error('Error fetching invoice details:', error);
        return of({ success: false, invoice: null, message: errorMessage });
      })
    );
  }

  /**
   * Download invoice as PDF by ID (ksefNumber)
   */
  downloadInvoicePdf(id: string): Observable<Blob> {
    console.log(`Downloading PDF for invoice: ${id}`);

    const safeId = encodeURIComponent(id);

    return this.http.get(`${this.apiUrl}/invoices/${safeId}/pdf`, {
      responseType: 'blob',
    }).pipe(
      mergeMap((blob: Blob) => from(this.ensureValidDownload(blob, 'application/pdf', 'PDF'))),
      tap((blob) => {
        console.log(`✓ Downloaded PDF for ${id} (${blob.size} bytes)`);
        // Trigger browser download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }),
      catchError((error) => {
        const errorMessage = error.error?.message || error.message || 'Error downloading PDF';
        console.error('Error downloading PDF:', error);
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Download invoice as XML by ID (ksefNumber)
   */
  downloadInvoiceXml(id: string): Observable<Blob> {
    console.log(`Downloading XML for invoice: ${id}`);

    const safeId = encodeURIComponent(id);

    return this.http.get(`${this.apiUrl}/invoices/${safeId}/xml`, {
      responseType: 'blob',
    }).pipe(
      mergeMap((blob: Blob) => from(this.ensureValidDownload(blob, 'application/xml', 'XML'))),
      tap((blob) => {
        console.log(`✓ Downloaded XML for ${id} (${blob.size} bytes)`);
        // Trigger browser download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `invoice-${id}.xml`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }),
      catchError((error) => {
        const errorMessage = error.error?.message || error.message || 'Error downloading XML';
        console.error('Error downloading XML:', error);
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Validate download blob and surface backend errors instead of saving broken files.
   */
  private async ensureValidDownload(blob: Blob, expectedType: string, label: string): Promise<Blob> {
    const type = (blob.type || '').toLowerCase();
    const isJson = type.includes('application/json');
    const isHtml = type.includes('text/html');
    const isXml = type.includes('application/xml') || type.includes('text/xml');
    const isExpected = expectedType === 'application/pdf' ? type.includes('application/pdf') : isXml;

    if (!isExpected || isJson || isHtml) {
      let bodyText = '';
      try {
        bodyText = await blob.text();
      } catch {
        // ignore
      }

      let message = `Backend returned invalid ${label} file.`;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.message) {
          message = parsed.message;
        } else if (parsed?.error) {
          message = parsed.error;
        }
      } catch {
        if (bodyText) {
          message = bodyText.substring(0, 200);
        }
      }

      throw new Error(message);
    }

    return blob;
  }
}
