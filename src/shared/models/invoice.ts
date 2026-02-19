/**
 * Invoice model - wspólne typy dla faktur z KSeF
 */

export interface Invoice {
  id: string;
  number: string;
  type: 'received' | 'sent';
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'received' | 'paid' | 'cancelled';

  // Dla faktur odebranych
  sellerName?: string;
  sellerTaxId?: string;
  sellerAddress?: string;

  // Dla faktur wysłanych
  buyerName?: string;
  buyerTaxId?: string;
  buyerAddress?: string;

  // Dodatkowe dane
  description?: string;
  items?: InvoiceItem[];
  ksefId?: string; // ID z KSeF API
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vat: number;
  vatRate: number;
}

export interface InvoiceFilter {
  type?: 'received' | 'sent';
  status?: Invoice['status'];
  startDate?: string;
  endDate?: string;
  search?: string; // search po nazwie, numerze, itp
}

export interface InvoiceResponse {
  data: Invoice[];
  total: number;
  page: number;
  pageSize: number;
}
