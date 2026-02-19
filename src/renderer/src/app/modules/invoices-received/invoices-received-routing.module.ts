import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoicesReceivedComponent } from './invoices-received.component';

const routes: Routes = [
  {
    path: '',
    component: InvoicesReceivedComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InvoicesReceivedRoutingModule { }
