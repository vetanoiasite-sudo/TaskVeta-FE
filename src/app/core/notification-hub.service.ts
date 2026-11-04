import { Injectable, effect, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AppNotification } from './models';
import { ToastService } from './toast.service';
import { I18nService } from './i18n.service';

/** Real-time notifications over SignalR, plus the unread counter shown in the top bar. */
@Injectable({ providedIn: 'root' })
export class NotificationHubService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private connection?: HubConnection;

  readonly unread = signal(0);
  readonly connected = signal(false);
  /** Emits every notification pushed by the server. */
  readonly received$ = new Subject<AppNotification>();

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) void this.start();
      else void this.stop();
    });
  }

  refreshCount(): void {
    if (!this.auth.isAuthenticated()) return;
    this.api.unreadCount().subscribe({ next: c => this.unread.set(c), error: () => undefined });
  }

  title(n: AppNotification): string {
    return this.i18n.lang() === 'ar' && n.titleAr ? n.titleAr : n.title;
  }

  message(n: AppNotification): string {
    return this.i18n.lang() === 'ar' && n.messageAr ? n.messageAr : n.message;
  }

  private async start(): Promise<void> {
    this.refreshCount();
    if (this.connection && this.connection.state !== HubConnectionState.Disconnected) return;
    this.connection = new HubConnectionBuilder()
      .withUrl('/hubs/notifications', { accessTokenFactory: () => this.auth.token ?? '' })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.on('notification', (n: AppNotification) => {
      this.unread.update(c => c + 1);
      this.received$.next(n);
      this.toast.info(this.title(n) + ' — ' + this.message(n));
    });
    this.connection.onreconnected(() => { this.connected.set(true); this.refreshCount(); });
    this.connection.onclose(() => this.connected.set(false));

    try {
      await this.connection.start();
      this.connected.set(true);
    } catch {
      this.connected.set(false); // falls back to the REST counter; automatic reconnect handles transient failures
    }
  }

  private async stop(): Promise<void> {
    this.unread.set(0);
    if (this.connection) {
      const c = this.connection;
      this.connection = undefined;
      await c.stop().catch(() => undefined);
    }
  }
}
