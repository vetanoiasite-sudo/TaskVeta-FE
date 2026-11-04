import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { LocalDatePipe } from '../core/format';
import { I18nService, TranslatePipe } from '../core/i18n.service';
import { AppNotification, Perm } from '../core/models';
import { NotificationHubService } from '../core/notification-hub.service';
import { AvatarComponent } from '../shared/ui';
import { ChangePasswordDialogComponent } from './change-password.dialog';

interface NavItem { label: string; icon: string; link: string; permissions?: string[]; exact?: boolean; }
interface NavGroup { label: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  {
    label: 'nav.overview',
    items: [
      { label: 'nav.dashboard', icon: 'space_dashboard', link: '/', exact: true },
      { label: 'nav.notifications', icon: 'notifications', link: '/notifications' },
    ],
  },
  {
    label: 'nav.attendance',
    items: [
      { label: 'nav.myAttendance', icon: 'fingerprint', link: '/attendance/my', permissions: [Perm.AttendanceSelf] },
      { label: 'nav.leave', icon: 'beach_access', link: '/attendance/leave' },
      { label: 'nav.dailyAttendance', icon: 'today', link: '/attendance/daily', permissions: [Perm.AttendanceViewTeam] },
      { label: 'nav.attendanceHistory', icon: 'history', link: '/attendance/history', permissions: [Perm.AttendanceViewTeam] },
      { label: 'nav.absences', icon: 'person_off', link: '/attendance/absences', permissions: [Perm.AttendanceViewTeam] },
      { label: 'nav.analytics', icon: 'insights', link: '/attendance/analytics', permissions: [Perm.ReportsView] },
      { label: 'nav.kiosk', icon: 'qr_code_2', link: '/kiosk', permissions: [Perm.AttendanceKiosk] },
    ],
  },
  {
    label: 'nav.tasks',
    items: [
      { label: 'nav.myTasks', icon: 'assignment_ind', link: '/tasks/my' },
      { label: 'nav.taskManagement', icon: 'assignment', link: '/tasks', exact: true, permissions: [Perm.TasksAssign] },
      { label: 'nav.kanban', icon: 'view_kanban', link: '/tasks/board' },
    ],
  },
  {
    label: 'nav.administration',
    items: [
      { label: 'nav.employees', icon: 'badge', link: '/admin/employees', permissions: [Perm.EmployeesView] },
      { label: 'nav.departments', icon: 'domain', link: '/admin/departments', permissions: [Perm.EmployeesView] },
      { label: 'nav.teams', icon: 'groups', link: '/admin/teams', permissions: [Perm.EmployeesView] },
      { label: 'nav.users', icon: 'manage_accounts', link: '/admin/users', permissions: [Perm.UsersManage] },
      { label: 'nav.settings', icon: 'settings', link: '/admin/settings', permissions: [Perm.SettingsManage, Perm.HolidaysManage] },
      { label: 'nav.audit', icon: 'policy', link: '/admin/audit', permissions: [Perm.AuditView] },
    ],
  },
];

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule, MatButtonModule,
    MatMenuModule, MatBadgeModule, MatTooltipModule, MatDividerModule, TranslatePipe, LocalDatePipe, AvatarComponent,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly i18n = inject(I18nService);
  readonly hub = inject(NotificationHubService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly isHandset = toSignal(
    inject(BreakpointObserver).observe('(max-width: 960px)').pipe(map(r => r.matches)), { initialValue: false });
  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
  readonly recent = signal<AppNotification[]>([]);

  readonly nav = computed(() =>
    NAV.map(g => ({ ...g, items: g.items.filter(i => !i.permissions || this.auth.hasAny(i.permissions)) }))
      .filter(g => g.items.length > 0));

  readonly roleLabel = computed(() => {
    const roles = this.auth.user()?.roles ?? [];
    return roles.map(r => this.i18n.enum('enums.role', r)).join(' · ');
  });

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.mobileOpen.set(false));
  }

  toggleNav(): void {
    if (this.isHandset()) this.mobileOpen.update(v => !v);
    else this.collapsed.update(v => !v);
  }

  loadRecent(): void {
    this.api.notifications({ pageSize: 6 }).subscribe(r => this.recent.set(r.items));
  }

  openNotification(n: AppNotification): void {
    if (!n.isRead) {
      this.api.markNotificationRead(n.id).subscribe(() => this.hub.refreshCount());
    }
    if (n.link) this.router.navigateByUrl(n.link);
  }

  markAllRead(): void {
    this.api.markAllNotificationsRead().subscribe(() => {
      this.hub.unread.set(0);
      this.recent.update(list => list.map(n => ({ ...n, isRead: true })));
    });
  }

  async toggleLanguage(): Promise<void> {
    await this.i18n.toggle();
    this.api.setLanguage(this.i18n.lang()).subscribe({ error: () => undefined });
  }

  changePassword(): void {
    this.dialog.open(ChangePasswordDialogComponent, { width: '420px' });
  }

  logout(): void {
    this.auth.logout();
  }
}
