import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoicesReceivedRoutingModule } from './invoices-received-routing.module';
import { InvoicesReceivedComponent } from './invoices-received.component';

@NgModule({
  declarations: [InvoicesReceivedComponent],
  imports: [CommonModule, InvoicesReceivedRoutingModule],
})
export class InvoicesReceivedModule { }
