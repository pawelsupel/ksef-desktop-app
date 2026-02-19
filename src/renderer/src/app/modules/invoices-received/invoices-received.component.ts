import { Component, OnInit } from '@angular/core';
import { InvoicesService, Invoice } from '../../services/invoices.service';

@Component({
  selector: 'app-invoices-received',
  templateUrl: './invoices-received.component.html',
  styleUrls: ['./invoices-received.component.scss'],
})
export class InvoicesReceivedComponent implements OnInit {
  invoices: Invoice[] = [];
  loading$ = this.invoicesService.loading$;
  error$ = this.invoicesService.error$;
  selectedInvoice: Invoice | null = null;
  isDownloadingPdf = false;
  viewType: 'cards' | 'list' = 'list'; // Toggle between card and list view - default: list
  sortBy: 'date' | 'amount' = 'date'; // Sort field - default: by date
  sortOrder: 'asc' | 'desc' = 'desc'; // Sort direction - default: newest first (desc)

  constructor(private invoicesService: InvoicesService) {}

  ngOnInit(): void {
    // Subscribe to invoices stream
    this.invoicesService.receivedInvoices$.subscribe(
      (invoices) => {
        this.invoices = invoices;
      }
    );
    // User must click "Refresh" button to load invoices
  }

  /**
   * Load received invoices from backend
   */
  loadReceivedInvoices(): void {
    this.invoicesService.getReceivedInvoices().subscribe();
  }

  /**
   * Refresh invoices
   */
  refresh(): void {
    this.loadReceivedInvoices();
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.invoicesService.clearError();
  }

  /**
   * View invoice details in modal
   */
  viewInvoiceDetails(invoice: Invoice): void {
    this.selectedInvoice = invoice;
  }

  /**
   * Close invoice details modal
   */
  closeInvoiceDetails(): void {
    this.selectedInvoice = null;
  }

  /**
   * Download invoice as PDF
   */
  downloadPdf(invoice: Invoice, event: Event): void {
    event.stopPropagation();
    this.isDownloadingPdf = true;
    this.invoicesService.downloadInvoicePdf(invoice.id).subscribe(
      () => {
        this.isDownloadingPdf = false;
      },
      (error) => {
        console.error('Error downloading PDF:', error);
        this.isDownloadingPdf = false;
      }
    );
  }

  /**
   * Download invoice as XML
   */
  downloadXml(invoice: Invoice, event: Event): void {
    event.stopPropagation(); // Prevent triggering viewInvoiceDetails
    this.isDownloadingPdf = true;
    this.invoicesService.downloadInvoiceXml(invoice.id).subscribe(
      () => {
        this.isDownloadingPdf = false;
      },
      (error) => {
        console.error('Error downloading XML:', error);
        this.isDownloadingPdf = false;
      }
    );
  }

  /**
   * Calculate VAT from gross and net amounts
   */
  calculateVat(invoice: Invoice | null): number {
    if (!invoice) return 0;
    return (invoice.grossAmount || 0) - (invoice.netAmount || 0);
  }

  /**
   * Toggle between card and list view
   */
  toggleView(): void {
    this.viewType = this.viewType === 'cards' ? 'list' : 'cards';
  }

  /**
   * Change sort field
   */
  changeSortBy(field: 'date' | 'amount'): void {
    if (this.sortBy === field) {
      // Toggle sort order if same field clicked
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // Change field and reset to desc
      this.sortBy = field;
      this.sortOrder = 'desc';
    }
  }

  /**
   * Get sorted invoices
   */
  getSortedInvoices(): Invoice[] {
    const sorted = [...this.invoices];

    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (this.sortBy === 'date') {
        aValue = new Date(a.issueDate || 0).getTime();
        bValue = new Date(b.issueDate || 0).getTime();
      } else {
        aValue = a.grossAmount || a.amount || 0;
        bValue = b.grossAmount || b.amount || 0;
      }

      if (this.sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    return sorted;
  }
}
