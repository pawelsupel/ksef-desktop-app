import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoicesSentComponent } from './invoices-sent.component';

const routes: Routes = [
  {
    path: '',
    component: InvoicesSentComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InvoicesSentRoutingModule { }
