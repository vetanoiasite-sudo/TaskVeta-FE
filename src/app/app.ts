import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationHubService } from './core/notification-hub.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  // Instantiated eagerly so the SignalR connection follows the login state.
  private readonly hub = inject(NotificationHubService);
}
