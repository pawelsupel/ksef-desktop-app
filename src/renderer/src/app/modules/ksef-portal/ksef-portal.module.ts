import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { KsefPortalRoutingModule } from './ksef-portal-routing.module';
import { KsefPortalComponent } from './ksef-portal.component';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    KsefPortalRoutingModule,
    KsefPortalComponent // Import standalone component
  ]
})
export class KsefPortalModule { }
