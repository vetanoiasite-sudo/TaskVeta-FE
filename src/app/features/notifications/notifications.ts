import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { LocalDatePipe } from '../../core/format';
import { TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { AppNotification } from '../../core/models';
import { NotificationHubService } from '../../core/notification-hub.service';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent } from '../../shared/ui';

const ICONS: Record<string, string> = {
  TaskAssigned: 'assignment_add', TaskDeadlineApproaching: 'alarm', TaskOverdue: 'running_with_errors', TaskApproved: 'task_alt',
  TaskRejected: 'assignment_return', TaskComment: 'chat', TaskMention: 'alternate_email', TaskStatusChanged: 'sync_alt', AttendanceUpdated: 'edit_calendar',
  AttendanceAttention: 'warning', LeaveRequest: 'beach_access', System: 'info',
};

@Component({
  selector: 'app-notifications',
  imports: [PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, MatButtonModule, MatIconModule, MatPaginatorModule,
    MatSlideToggleModule, MatTooltipModule, FormsModule, TranslatePipe, TranslateEnumPipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'notifications.title' | t" [subtitle]="'notifications.subtitle' | t" icon="notifications">
      <mat-slide-toggle [(ngModel)]="unreadOnly" (change)="page.set(1); load()">{{ 'notifications.unreadOnly' | t }}</mat-slide-toggle>
      <button mat-stroked-button (click)="markAll()" [disabled]="hub.unread() === 0">
        <mat-icon>done_all</mat-icon>{{ 'notifications.markAllRead' | t }}
      </button>
    </app-page-header>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      @for (n of items(); track n.id) {
        <div class="notif" [class.unread]="!n.isRead" (click)="open(n)">
          <div class="notif__icon"><mat-icon>{{ icon(n.type) }}</mat-icon></div>
          <div class="notif__body">
            <div class="notif__top">
              <strong>{{ hub.title(n) }}</strong>
              <span class="notif__type">{{ n.type | te: 'enums.notificationType' }}</span>
            </div>
            <p>{{ hub.message(n) }}</p>
            <span class="notif__time">{{ n.createdAt | ldate: 'datetime' }} · {{ n.createdAt | ldate: 'relative' }}</span>
          </div>
          <div class="notif__actions" (click)="$event.stopPropagation()">
            @if (!n.isRead) {
              <button mat-icon-button [matTooltip]="'notifications.markRead' | t" (click)="markRead(n)"><mat-icon>mark_email_read</mat-icon></button>
            }
            <button mat-icon-button [matTooltip]="'common.delete' | t" (click)="remove(n)"><mat-icon>delete_outline</mat-icon></button>
          </div>
        </div>
      } @empty {
        @if (!loading()) { <app-empty-state icon="notifications_off" [message]="'notifications.empty' | t" /> }
      }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50]"
                     (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .notif { display: flex; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border); cursor: pointer; align-items: flex-start;
      &:hover { background: var(--surface-2); } &.unread { background: var(--primary-soft); } }
    .notif__icon { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex: none; }
    .notif__body { flex: 1; min-width: 0; p { margin: 3px 0; color: var(--text); font-size: 13.5px; } }
    .notif__top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .notif__type { font-size: 11px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; color: var(--text-muted); }
    .notif__time { font-size: 12px; color: var(--text-muted); }
    .notif__actions { display: flex; }
  `,
})
export class NotificationsComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly hub = inject(NotificationHubService);

  readonly items = signal<AppNotification[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly loading = signal(false);
  unreadOnly = false;

  constructor() {
    this.load();
    this.hub.received$.pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }

  load(): void {
    this.loading.set(true);
    this.api.notifications({ page: this.page(), pageSize: this.pageSize(), unreadOnly: this.unreadOnly || null }).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  icon(type: string): string {
    return ICONS[type] ?? 'notifications';
  }

  open(n: AppNotification): void {
    if (!n.isRead) this.markRead(n);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  markRead(n: AppNotification): void {
    this.api.markNotificationRead(n.id).subscribe(() => {
      this.items.update(list => list.map(x => (x.id === n.id ? { ...x, isRead: true } : x)));
      this.hub.refreshCount();
    });
  }

  markAll(): void {
    this.api.markAllNotificationsRead().subscribe(() => { this.hub.unread.set(0); this.load(); });
  }

  remove(n: AppNotification): void {
    this.api.deleteNotification(n.id).subscribe(() => { this.load(); this.hub.refreshCount(); });
  }
}
