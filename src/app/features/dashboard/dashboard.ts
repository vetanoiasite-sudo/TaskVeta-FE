import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, shortTime, wallTime } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { Dashboard, Perm } from '../../core/models';
import { LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent } from '../../shared/ui';
import { ChartComponent } from '../../shared/chart';

@Component({
  selector: 'app-dashboard',
  imports: [PageHeaderComponent, StatCardComponent, ChartComponent, LoadingBarComponent, StatusChipComponent, MatButtonModule, MatIconModule,
    RouterLink, TranslatePipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'dashboard.greeting' | t: { name: firstName() }" [subtitle]="'dashboard.subtitle' | t" icon="waving_hand">
      <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon>{{ 'common.refresh' | t }}</button>
    </app-page-header>
    <app-loading-bar [loading]="loading()" />

    @if (data(); as d) {
      @if (d.me; as me) {
        <div class="card my-day">
          <div class="my-day__info">
            <span class="my-day__label">{{ 'dashboard.myDay' | t }} · {{ me.today | ldate: 'weekday' }}</span>
            <strong>
              @if (me.currentRecord?.checkInTime) {
                {{ 'dashboard.checkedInAt' | t: { time: wall(me.currentRecord!.checkInTime) } }}
                @if (me.currentRecord?.checkOutTime) { · {{ 'dashboard.checkedOutAt' | t: { time: wall(me.currentRecord!.checkOutTime) } }} }
              } @else if (me.holidayName) {
                {{ 'dashboard.holiday' | t: { name: me.holidayName } }}
              } @else if (!me.isWorkingDay) {
                {{ 'dashboard.weekend' | t }}
              } @else {
                {{ 'dashboard.notCheckedIn' | t }}
              }
            </strong>
            <span class="muted">{{ 'dashboard.schedule' | t: { start: short(me.scheduleStart), end: short(me.scheduleEnd) } }}</span>
          </div>
          @if (me.currentRecord) { <app-status-chip [value]="me.currentRecord.status" /> }
          <a mat-flat-button routerLink="/attendance/my"><mat-icon>fingerprint</mat-icon>{{ 'dashboard.goToAttendance' | t }}</a>
        </div>
      }

      @if (d.attendance; as a) {
        <div class="stats">
          <app-stat-card [label]="'dashboard.totalEmployees' | t" [value]="a.totalEmployees" icon="groups" tone="primary" />
          <app-stat-card [label]="'dashboard.presentToday' | t" [value]="a.present" icon="how_to_reg" tone="success"
                         [clickable]="true" (pressed)="go('/attendance/daily', 'present')" />
          <app-stat-card [label]="'dashboard.absentToday' | t" [value]="a.absent" icon="person_off" tone="danger"
                         [clickable]="true" (pressed)="go('/attendance/absences')" />
          <app-stat-card [label]="'dashboard.lateToday' | t" [value]="a.late" icon="schedule" tone="warning"
                         [clickable]="true" (pressed)="go('/attendance/daily', 'late')" />
          <app-stat-card [label]="'dashboard.onLeave' | t" [value]="a.onLeave" icon="beach_access" tone="info" />
          <app-stat-card [label]="'dashboard.insideNow' | t" [value]="a.insideNow" icon="meeting_room" tone="purple"
                         [clickable]="true" (pressed)="go('/attendance/daily', 'inside')" />
          <app-stat-card [label]="'dashboard.attendanceRate' | t" [value]="a.attendancePercentage + '%'" icon="percent" tone="success" />
        </div>
      }

      <div class="grid" [class.grid-2]="!!d.attendance">
        @if (d.attendance) {
          <div class="card">
            <h3 class="card__title">{{ 'dashboard.trend' | t }} <mat-icon>show_chart</mat-icon></h3>
            <app-chart type="line" [labels]="trendLabels()" [datasets]="trendSets()" [height]="290" />
          </div>
        }
        <div class="card">
          <h3 class="card__title">
            {{ 'dashboard.taskOverview' | t }}
            <a mat-button [routerLink]="canAssign() ? '/tasks' : '/tasks/my'">{{ 'dashboard.viewTasks' | t }}</a>
          </h3>
          <div class="task-stats">
            <div><span>{{ 'dashboard.totalTasks' | t }}</span><strong>{{ d.tasks.total }}</strong></div>
            <div><span>{{ 'dashboard.newTasks' | t }}</span><strong>{{ d.tasks.new + d.tasks.assigned }}</strong></div>
            <div><span>{{ 'dashboard.inProgress' | t }}</span><strong class="c-primary">{{ d.tasks.inProgress }}</strong></div>
            <div><span>{{ 'dashboard.pendingReview' | t }}</span><strong class="c-purple">{{ d.tasks.pendingReview }}</strong></div>
            <div><span>{{ 'dashboard.completed' | t }}</span><strong class="c-success">{{ d.tasks.completed }}</strong></div>
            <div><span>{{ 'dashboard.overdue' | t }}</span><strong class="c-danger">{{ d.tasks.overdue }}</strong></div>
          </div>
          <h4 class="sub">{{ 'dashboard.byPriority' | t }}</h4>
          <app-chart type="bar" [horizontal]="true" [labels]="priorityLabels()" [datasets]="prioritySets()" [height]="170" />
        </div>
      </div>
    }
  `,
  styles: `
    .my-day { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
      background: linear-gradient(120deg, var(--accent-soft), #ffffff); }
    .my-day__info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 220px; strong { font-size: 17px; } }
    .my-day__label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--primary); font-weight: 600; }
    .task-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
      div { background: var(--surface-2); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; }
      span { font-size: 12.5px; color: var(--text-muted); } strong { font-size: 22px; } }
    .sub { margin: 18px 0 6px; font-size: 13px; color: var(--text-muted); font-weight: 600; }
    .c-primary { color: var(--primary); } .c-purple { color: var(--purple); } .c-success { color: var(--success); } .c-danger { color: var(--danger); }
  `,
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(false);
  readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  readonly canAssign = computed(() => this.auth.hasPermission(Perm.TasksAssign));

  readonly trendLabels = computed(() => {
    this.i18n.lang();
    return (this.data()?.trend ?? []).map(p => new Date(p.date + 'T00:00:00').toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' }));
  });
  readonly trendSets = computed(() => {
    const t = this.data()?.trend ?? [];
    return [
      { label: this.i18n.t('dashboard.present'), data: t.map(p => p.present), color: '#31a24c', fill: true },
      { label: this.i18n.t('dashboard.late'), data: t.map(p => p.late), color: '#f7b928' },
      { label: this.i18n.t('dashboard.absent'), data: t.map(p => p.absent), color: '#e41e3f' },
    ];
  });
  readonly priorityLabels = computed(() => ['Low', 'Medium', 'High', 'Urgent'].map(p => this.i18n.enum('enums.status', p)));
  readonly prioritySets = computed(() => {
    const p = this.data()?.tasks.byPriority;
    return [{ label: this.i18n.t('common.total'), data: p ? [p.Low, p.Medium, p.High, p.Urgent] : [], color: '#1877f2' }];
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.dashboard().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  go(link: string, state?: string): void {
    this.router.navigate([link], { queryParams: state ? { state } : undefined });
  }

  wall = wallTime;
  short = shortTime;
}

