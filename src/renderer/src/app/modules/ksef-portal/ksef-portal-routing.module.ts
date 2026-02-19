import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { KsefPortalComponent } from './ksef-portal.component';

const routes: Routes = [
  {
    path: '',
    component: KsefPortalComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class KsefPortalRoutingModule { }
