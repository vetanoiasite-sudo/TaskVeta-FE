import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { debounceTime, forkJoin, switchMap } from 'rxjs';
import { ApiService, ExportFormat } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { addDays, isoDate, parseIsoDate, startOfMonth } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { AttendanceReport, EmployeeAttendanceSummary, EmployeePerformance, Perm, ReportQuery } from '../../core/models';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, Tone } from '../../shared/ui';
import { ChartComponent } from '../../shared/chart';

interface Kpi { label: string; value: string; icon: string; tone: Tone; hint: string | null; }

@Component({
  selector: 'app-attendance-analytics',
  imports: [PageHeaderComponent, StatCardComponent, ChartComponent, LoadingBarComponent, EmptyStateComponent, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatSlideToggleModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatTableModule, MatSortModule, ReactiveFormsModule, TranslatePipe],
  template: `
    <app-page-header [title]="'attendance.analytics.title' | t" [subtitle]="'attendance.analytics.subtitle' | t" icon="insights">
      @if (canExport) {
        <button mat-stroked-button [matMenuTriggerFor]="exp" [disabled]="!report()"><mat-icon>download</mat-icon>{{ 'common.export' | t }}</button>
        <mat-menu #exp="matMenu">
          <button mat-menu-item (click)="export('attendance', 'xlsx')"><mat-icon>grid_on</mat-icon>{{ 'attendance.analytics.summaryReport' | t }} (Excel)</button>
          <button mat-menu-item (click)="export('attendance', 'pdf')"><mat-icon>picture_as_pdf</mat-icon>{{ 'attendance.analytics.summaryReport' | t }} (PDF)</button>
          <button mat-menu-item (click)="export('employee-performance', 'xlsx')"><mat-icon>grid_on</mat-icon>{{ 'attendance.analytics.performanceReport' | t }} (Excel)</button>
          <button mat-menu-item (click)="export('employee-performance', 'pdf')"><mat-icon>picture_as_pdf</mat-icon>{{ 'attendance.analytics.performanceReport' | t }} (PDF)</button>
        </mat-menu>
      }
    </app-page-header>

    <form class="filters" [formGroup]="form">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.period' | t }}</mat-label>
        <mat-date-range-input [rangePicker]="p1">
          <input matStartDate formControlName="from" />
          <input matEndDate formControlName="to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="p1" />
        <mat-date-range-picker #p1 />
      </mat-form-field>
      <mat-slide-toggle formControlName="compare">{{ 'common.comparePeriod' | t }}</mat-slide-toggle>
      @if (form.controls.compare.value) {
        <mat-form-field class="wide">
          <mat-label>{{ 'attendance.analytics.comparison' | t }}</mat-label>
          <mat-date-range-input [rangePicker]="p2">
            <input matStartDate formControlName="compareFrom" />
            <input matEndDate formControlName="compareTo" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="p2" />
          <mat-date-range-picker #p2 />
        </mat-form-field>
      }
      <mat-form-field>
        <mat-label>{{ 'common.department' | t }}</mat-label>
        <mat-select formControlName="departmentId">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'common.team' | t }}</mat-label>
        <mat-select formControlName="teamId">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (t of teams(); track t.id) { <mat-option [value]="t.id">{{ t.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </form>
    <app-loading-bar [loading]="loading()" />

    @if (report(); as r) {
      <div class="stats">
        @for (k of kpis(); track k.label) { <app-stat-card [label]="k.label" [value]="k.value" [icon]="k.icon" [tone]="k.tone" [hint]="k.hint" /> }
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h3 class="card__title">{{ 'attendance.analytics.trend' | t }} <mat-icon>show_chart</mat-icon></h3>
          <app-chart type="line" [labels]="trendLabels()" [datasets]="trendSets()" [height]="300" />
        </div>
        <div class="card">
          <h3 class="card__title">{{ 'attendance.analytics.byDepartment' | t }} <mat-icon>domain</mat-icon></h3>
          <app-chart type="bar" [labels]="deptLabels()" [datasets]="deptSets()" [height]="300" />
        </div>
      </div>

      <div class="grid grid-2 mt">
        <div class="card">
          <h3 class="card__title">{{ 'attendance.analytics.top' | t }} <mat-icon>emoji_events</mat-icon></h3>
          @for (p of top(); track p.employeeId; let i = $index) {
            <div class="perf"><span class="rank">{{ i + 1 }}</span><span class="perf__name">{{ p.employeeName }}<small>{{ p.departmentName }}</small></span>
              <span class="perf__score good">{{ p.score }}</span></div>
          } @empty { <app-empty-state [message]="'common.noData' | t" /> }
        </div>
        <div class="card">
          <h3 class="card__title">{{ 'attendance.analytics.bottom' | t }} <mat-icon>trending_down</mat-icon></h3>
          @for (p of bottom(); track p.employeeId) {
            <div class="perf"><span class="perf__name">{{ p.employeeName }}<small>{{ p.departmentName }}</small></span>
              <span class="muted">{{ 'attendance.analytics.absentLate' | t: { a: p.absentDays, l: p.lateDays } }}</span>
              <span class="perf__score bad">{{ p.score }}</span></div>
          } @empty { <app-empty-state [message]="'common.noData' | t" /> }
        </div>
      </div>

      <h3 class="section">{{ 'attendance.analytics.perEmployee' | t }}</h3>
      <div class="table-card">
        <div class="table-scroll">
          <table mat-table [dataSource]="table" matSort>
            <ng-container matColumnDef="employeeName"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.employee' | t }}</th>
              <td mat-cell *matCellDef="let r"><span class="cell-strong">{{ r.employeeName }}</span><span class="cell-sub">{{ r.employeeCode }} · {{ r.departmentName }}</span></td></ng-container>
            <ng-container matColumnDef="expectedDays"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.analytics.expected' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.expectedDays }}</td></ng-container>
            <ng-container matColumnDef="presentDays"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.analytics.present' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.presentDays }}</td></ng-container>
            <ng-container matColumnDef="absentDays"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.analytics.absent' | t }}</th>
              <td mat-cell *matCellDef="let r" [class.bad]="r.absentDays">{{ r.absentDays }}</td></ng-container>
            <ng-container matColumnDef="lateDays"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.analytics.late' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.lateDays }} <span class="cell-sub">{{ r.totalLateMinutes }} {{ 'common.minutes' | t }}</span></td></ng-container>
            <ng-container matColumnDef="onLeaveDays"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'dashboard.onLeave' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.onLeaveDays }}</td></ng-container>
            <ng-container matColumnDef="totalHours"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.workingHours' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.totalHours }} <span class="cell-sub">{{ 'attendance.analytics.avg' | t }} {{ r.averageHours }}</span></td></ng-container>
            <ng-container matColumnDef="attendanceRate"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'dashboard.attendanceRate' | t }}</th>
              <td mat-cell *matCellDef="let r"><div class="progress-mini"><div class="bar"><div class="fill" [style.width.%]="r.attendanceRate"></div></div><span>{{ r.attendanceRate }}%</span></div></td></ng-container>
            <ng-container matColumnDef="punctualityRate"><th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.analytics.punctuality' | t }}</th>
              <td mat-cell *matCellDef="let r">{{ r.punctualityRate }}%</td></ng-container>
            <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
        </div>
        @if (table.data.length === 0) { <app-empty-state [message]="'common.noData' | t" /> }
      </div>
    }
  `,
  styles: `
    .mt { margin-top: 16px; }
    .section { margin: 24px 0 12px; font-size: 16px; }
    .perf { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); &:last-child { border: none; } }
    .rank { width: 26px; height: 26px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-weight: 700; font-size: 12px; }
    .perf__name { flex: 1; display: flex; flex-direction: column; font-weight: 600; small { font-weight: 400; color: var(--text-muted); } }
    .perf__score { font-weight: 700; font-size: 16px; &.good { color: var(--success); } &.bad { color: var(--danger); } }
    td.bad { color: var(--danger); font-weight: 600; }
  `,
})
export class AnalyticsComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  private readonly i18n = inject(I18nService);
  readonly canExport = inject(AuthService).hasPermission(Perm.ReportsExport);
  readonly cols = ['employeeName', 'expectedDays', 'presentDays', 'absentDays', 'lateDays', 'onLeaveDays', 'totalHours', 'attendanceRate', 'punctualityRate'];

  private readonly sorter = viewChild(MatSort);
  readonly table = new MatTableDataSource<EmployeeAttendanceSummary>([]);

  readonly form = inject(FormBuilder).group({
    from: [startOfMonth() as Date | null],
    to: [new Date() as Date | null],
    compare: [false],
    compareFrom: [null as Date | null],
    compareTo: [null as Date | null],
    departmentId: [null as number | null],
    teamId: [null as number | null],
  });

  readonly report = signal<AttendanceReport | null>(null);
  readonly performance = signal<EmployeePerformance[]>([]);
  readonly loading = signal(false);
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  private readonly deptId = signal<number | null>(null);
  readonly teams = toSignal(toObservable(this.deptId).pipe(switchMap(id => this.lookups.teamsFor(id))), { initialValue: [] });

  readonly kpis = computed<Kpi[]>(() => {
    const r = this.report();
    if (!r) return [];
    const t = r.totals, c = r.comparison;
    const delta = (cur: number, prev: number | undefined, unit = '') => {
      if (c === null || prev === undefined) return null;
      const d = Math.round((cur - prev) * 10) / 10;
      return `${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '± '}${d}${unit} ${this.i18n.t('attendance.analytics.vsPrevious')}`;
    };
    return [
      { label: this.i18n.t('dashboard.attendanceRate'), value: `${t.attendanceRate}%`, icon: 'percent', tone: 'success', hint: delta(t.attendanceRate, c?.attendanceRate, '%') },
      { label: this.i18n.t('attendance.analytics.punctuality'), value: `${t.punctualityRate}%`, icon: 'alarm_on', tone: 'primary', hint: delta(t.punctualityRate, c?.punctualityRate, '%') },
      { label: this.i18n.t('attendance.analytics.present'), value: String(t.presentDays), icon: 'event_available', tone: 'success', hint: delta(t.presentDays, c?.presentDays) },
      { label: this.i18n.t('attendance.analytics.absent'), value: String(t.absentDays), icon: 'event_busy', tone: 'danger', hint: delta(t.absentDays, c?.absentDays) },
      { label: this.i18n.t('attendance.analytics.late'), value: String(t.lateDays), icon: 'schedule', tone: 'warning', hint: delta(t.lateDays, c?.lateDays) },
      { label: this.i18n.t('attendance.workingHours'), value: String(Math.round(t.totalHours)), icon: 'timer', tone: 'info', hint: delta(t.totalHours, c?.totalHours) },
    ];
  });

  readonly trendLabels = computed(() => (this.report()?.trend ?? []).map(p =>
    parseIsoDate(p.date)!.toLocaleDateString(this.i18n.locale(), { day: 'numeric', month: 'short' })));
  readonly trendSets = computed(() => {
    const t = this.report()?.trend ?? [];
    return [
      { label: this.i18n.t('attendance.analytics.present'), data: t.map(p => p.present), color: '#117c57', fill: true },
      { label: this.i18n.t('attendance.analytics.late'), data: t.map(p => p.late), color: '#a8740f' },
      { label: this.i18n.t('attendance.analytics.absent'), data: t.map(p => p.absent), color: '#c8102e' },
      { label: this.i18n.t('dashboard.onLeave'), data: t.map(p => p.onLeave), color: '#2f5f7d' },
    ];
  });
  readonly deptLabels = computed(() => (this.report()?.byDepartment ?? []).map(d => d.departmentName));
  readonly deptSets = computed(() => {
    const d = this.report()?.byDepartment ?? [];
    return [
      { label: this.i18n.t('dashboard.attendanceRate') + ' %', data: d.map(x => x.attendanceRate), color: '#743014' },
      { label: this.i18n.t('attendance.analytics.absent'), data: d.map(x => x.absentDays), color: '#c8102e' },
      { label: this.i18n.t('attendance.analytics.late'), data: d.map(x => x.lateDays), color: '#a8740f' },
    ];
  });
  readonly top = computed(() => this.performance().slice(0, 5));
  readonly bottom = computed(() => [...this.performance()].sort((a, b) => a.score - b.score).slice(0, 5));

  constructor() {
    effect(() => { const s = this.sorter(); if (s) this.table.sort = s; });
    this.form.controls.departmentId.valueChanges.subscribe(id => { this.deptId.set(id); this.form.controls.teamId.setValue(null, { emitEvent: false }); });
    this.form.controls.compare.valueChanges.subscribe(on => {
      if (!on) return;
      const { from, to } = this.form.getRawValue();
      if (from && to) {
        const len = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
        this.form.patchValue({ compareFrom: addDays(from, -len), compareTo: addDays(from, -1) }, { emitEvent: false });
      }
    });
    this.form.valueChanges.pipe(debounceTime(400)).subscribe(() => this.load());
    this.load();
  }

  private query(): ReportQuery {
    const v = this.form.getRawValue();
    return {
      from: isoDate(v.from), to: isoDate(v.to), departmentId: v.departmentId, teamId: v.teamId,
      compareFrom: v.compare ? isoDate(v.compareFrom) : null, compareTo: v.compare ? isoDate(v.compareTo) : null,
    };
  }

  load(): void {
    const q = this.query();
    if (!q.from || !q.to) return;
    if ((q.compareFrom && !q.compareTo) || (!q.compareFrom && q.compareTo)) return;
    this.loading.set(true);
    forkJoin([this.api.attendanceReport(q), this.api.performanceReport({ ...q, compareFrom: null, compareTo: null })]).subscribe({
      next: ([r, p]) => {
        this.report.set(r);
        this.performance.set(p);
        this.table.data = r.rows;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  export(kind: 'attendance' | 'employee-performance', format: ExportFormat): void {
    this.api.exportReport(kind, this.query(), format).subscribe();
  }
}

