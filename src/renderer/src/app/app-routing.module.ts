import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/invoices-received',
    pathMatch: 'full',
  },
  {
    path: 'ksef-portal',
    loadChildren: () =>
      import('./modules/ksef-portal/ksef-portal.module').then(
        (m) => m.KsefPortalModule
      ),
  },
  {
    path: 'invoices-received',
    loadChildren: () =>
      import('./modules/invoices-received/invoices-received.module').then(
        (m) => m.InvoicesReceivedModule
      ),
  },
  {
    path: 'invoices-sent',
    loadChildren: () =>
      import('./modules/invoices-sent/invoices-sent.module').then(
        (m) => m.InvoicesSentModule
      ),
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('./modules/settings/settings.module').then(
        (m) => m.SettingsModule
      ),
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule { }
