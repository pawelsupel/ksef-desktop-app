import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'KSeF Desktop';
  sidebarCollapsed = false;

  ngOnInit(): void {
    // Load collapsed state from localStorage
    const saved = localStorage.getItem('sidebarCollapsed');
    this.sidebarCollapsed = saved === 'true';
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    // Persist state
    localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed));
  }
}
