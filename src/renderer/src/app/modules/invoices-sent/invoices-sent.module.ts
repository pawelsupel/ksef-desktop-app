import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoicesSentRoutingModule } from './invoices-sent-routing.module';
import { InvoicesSentComponent } from './invoices-sent.component';

@NgModule({
  declarations: [InvoicesSentComponent],
  imports: [CommonModule, InvoicesSentRoutingModule],
})
export class InvoicesSentModule { }
