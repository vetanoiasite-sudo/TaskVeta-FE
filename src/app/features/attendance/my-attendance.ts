import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { LocalDatePipe, WallTimePipe, addDays, isoDate, minutesToText, shortTime, startOfMonth } from '../../core/format';
import { problemMessage } from '../../core/http';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { AttendanceRecord, MyAttendanceStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent } from '../../shared/ui';
import { CheckKind, performCheck } from './check';
import { GeoError } from './geo';

@Component({
  selector: 'app-my-attendance',
  imports: [PageHeaderComponent, StatCardComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, MatButtonModule,
    MatIconModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressSpinnerModule, MatDatepickerModule,
    MatTableModule, MatPaginatorModule, FormsModule, ReactiveFormsModule, TranslatePipe, LocalDatePipe, WallTimePipe],
  template: `
    <app-page-header [title]="'attendance.my.title' | t" [subtitle]="'attendance.my.subtitle' | t" icon="fingerprint">
      <button mat-stroked-button (click)="loadStatus()"><mat-icon>refresh</mat-icon>{{ 'common.refresh' | t }}</button>
    </app-page-header>

    @if (status(); as s) {
      <div class="today card">
        <div class="today__clock">
          <span class="today__date">{{ s.today | ldate: 'weekday' }}</span>
          <span class="today__time">{{ clock() }}</span>
          <span class="muted">{{ 'attendance.my.schedule' | t: { start: short(s.scheduleStart), end: short(s.scheduleEnd) } }}</span>
        </div>

        <div class="today__main">
          @if (s.holidayName) { <div class="alert alert-info"><mat-icon>celebration</mat-icon>{{ 'attendance.my.holiday' | t: { name: s.holidayName } }}</div> }
          @else if (s.onLeave) { <div class="alert alert-info"><mat-icon>beach_access</mat-icon>{{ 'attendance.my.onLeave' | t }}</div> }
          @else if (!s.isWorkingDay) { <div class="alert alert-info"><mat-icon>weekend</mat-icon>{{ 'attendance.my.weekend' | t }}</div> }

          @if (s.currentRecord; as r) {
            <div class="today__state">
              <app-status-chip [value]="r.status" />
              <span>{{ 'attendance.checkIn' | t }}: <strong>{{ r.checkInTime | wallTime }}</strong></span>
              <span>{{ 'attendance.checkOut' | t }}: <strong>{{ r.checkOutTime | wallTime }}</strong></span>
              @if (r.lateMinutes) { <span class="warn">{{ 'attendance.my.lateBy' | t: { m: mins(r.lateMinutes) } }}</span> }
              @if (r.checkOutTime) { <span>{{ 'attendance.workingHours' | t }}: <strong>{{ r.workingHours }}</strong></span> }
            </div>
          } @else {
            <p class="muted">{{ 'attendance.my.notYet' | t }}</p>
          }

          @if (s.verification.required) {
            <div class="verify">
              <span class="muted">{{ (s.verification.policy === 'All' ? 'attendance.verify.all' : 'attendance.verify.any') | t }}</span>
              @if (s.verification.geofence) { <span class="chip tone-info"><mat-icon>location_on</mat-icon>{{ 'enums.verification.Geofence' | t }}</span> }
              @if (s.verification.network) { <span class="chip tone-info"><mat-icon>wifi</mat-icon>{{ 'enums.verification.Network' | t }}</span> }
              @if (s.verification.qrCode) { <span class="chip tone-info"><mat-icon>qr_code_2</mat-icon>{{ 'enums.verification.QrCode' | t }}</span> }
            </div>
            @if (s.verification.qrCode) { <p class="hint"><mat-icon>qr_code_scanner</mat-icon>{{ 'attendance.verify.qrHint' | t }}</p> }
          }

          <div class="today__form">
            <mat-form-field class="notes">
              <mat-label>{{ 'common.notes' | t }} ({{ 'common.optional' | t }})</mat-label>
              <input matInput [(ngModel)]="notes" maxlength="500" />
            </mat-form-field>
            @if (s.verification.remoteAllowed && s.canCheckIn) {
              <mat-slide-toggle [(ngModel)]="wfh">{{ 'attendance.my.wfh' | t }}</mat-slide-toggle>
            }
          </div>

          @if (error()) { <div class="alert alert-danger"><mat-icon>gpp_bad</mat-icon>{{ error() }}</div> }

          <div class="today__actions">
            <button mat-flat-button class="big in" [disabled]="!s.canCheckIn || busy()" (click)="check('in')">
              @if (busy() === 'in') { <mat-spinner diameter="22" /> } @else { <mat-icon>login</mat-icon> }
              {{ 'attendance.checkIn' | t }}
            </button>
            <button mat-flat-button class="big out" [disabled]="!s.canCheckOut || busy()" (click)="check('out')">
              @if (busy() === 'out') { <mat-spinner diameter="22" /> } @else { <mat-icon>logout</mat-icon> }
              {{ 'attendance.checkOut' | t }}
            </button>
          </div>
          @if (busy() && locating()) { <p class="muted">{{ 'attendance.geo.locating' | t }}</p> }

          @if (s.todayRecords.length > 1) {
            <div class="shifts">
              @for (r of s.todayRecords; track r.id) {
                <span class="chip tone-neutral">{{ 'attendance.shift' | t }} {{ r.shiftNumber }}: {{ r.checkInTime | wallTime }} – {{ r.checkOutTime | wallTime }}</span>
              }
            </div>
          }
        </div>
      </div>
    } @else {
      <app-loading-bar [loading]="true" />
    }

    <h3 class="section">{{ 'attendance.my.thisMonth' | t }}</h3>
    <div class="stats">
      <app-stat-card [label]="'attendance.my.daysPresent' | t" [value]="month().present" icon="event_available" tone="success" />
      <app-stat-card [label]="'attendance.my.daysLate' | t" [value]="month().late" icon="schedule" tone="warning" />
      <app-stat-card [label]="'attendance.my.daysAbsent' | t" [value]="month().absent" icon="event_busy" tone="danger" />
      <app-stat-card [label]="'attendance.my.hours' | t" [value]="month().hours" icon="timer" tone="primary" />
    </div>

    <div class="filters">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.dateRange' | t }}</mat-label>
        <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
          <input matStartDate formControlName="from" />
          <input matEndDate formControlName="to" (dateChange)="page.set(1); loadHistory()" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loadingHistory()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="history()">
          <ng-container matColumnDef="date"><th mat-header-cell *matHeaderCellDef>{{ 'common.date' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.attendanceDate | ldate: 'weekday' }}</td></ng-container>
          <ng-container matColumnDef="in"><th mat-header-cell *matHeaderCellDef>{{ 'attendance.checkIn' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.checkInTime | wallTime }}</td></ng-container>
          <ng-container matColumnDef="out"><th mat-header-cell *matHeaderCellDef>{{ 'attendance.checkOut' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.checkOutTime | wallTime }}</td></ng-container>
          <ng-container matColumnDef="hours"><th mat-header-cell *matHeaderCellDef>{{ 'attendance.workingHours' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.workingHours || '—' }}</td></ng-container>
          <ng-container matColumnDef="late"><th mat-header-cell *matHeaderCellDef>{{ 'attendance.late' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.lateMinutes ? mins(r.lateMinutes) : '—' }}</td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let r"><app-status-chip [value]="r.status" />
              @if (r.missingCheckOut) { <app-status-chip value="MissingCheckOut" /> }</td></ng-container>
          <ng-container matColumnDef="notes"><th mat-header-cell *matHeaderCellDef>{{ 'common.notes' | t }}</th>
            <td mat-cell *matCellDef="let r" class="muted">{{ r.notes }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="cols"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
      </div>
      @if (!loadingHistory() && history().length === 0) { <app-empty-state icon="event_note" [message]="'common.noData' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .today { display: grid; grid-template-columns: 240px 1fr; gap: 24px; margin-bottom: 24px; }
    .today__clock { display: flex; flex-direction: column; gap: 6px; justify-content: center; padding-inline-end: 24px;
      border-inline-end: 1px solid var(--border); }
    .today__date { color: var(--primary); font-weight: 600; }
    .today__time { font-size: 42px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .today__main { display: flex; flex-direction: column; gap: 10px; }
    .today__state { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; .warn { color: var(--warning); font-weight: 600; } }
    .today__form { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; .notes { flex: 1; min-width: 220px; } }
    .today__actions { display: flex; gap: 14px; flex-wrap: wrap; }
    .big { height: 56px; min-width: 180px; font-size: 16px; border-radius: 14px; mat-spinner { display: inline-block; margin-inline-end: 8px; } }
    .big.in:not(:disabled) { background: var(--success); color: #fff; }
    .big.out:not(:disabled) { background: var(--danger); color: #fff; }
    .verify { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; .chip mat-icon { font-size: 15px; width: 15px; height: 15px; } }
    .hint { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--text-muted); font-size: 13px; }
    .shifts { display: flex; gap: 8px; flex-wrap: wrap; }
    .section { margin: 8px 0 12px; font-size: 16px; }
    @media (max-width: 800px) { .today { grid-template-columns: 1fr; } .today__clock { border: none; padding: 0; } }
  `,
})
export class MyAttendanceComponent {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly toast = inject(ToastService);

  readonly status = signal<MyAttendanceStatus | null>(null);
  readonly busy = signal<CheckKind | null>(null);
  readonly locating = signal(false);
  readonly error = signal<string | null>(null);
  readonly now = signal(new Date());
  readonly clock = computed(() => this.now().toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  notes = '';
  wfh = false;

  readonly history = signal<AttendanceRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly loadingHistory = signal(false);
  readonly monthRecords = signal<AttendanceRecord[]>([]);
  readonly month = computed(() => {
    const r = this.monthRecords();
    const worked = r.filter(x => x.checkInTime);
    return {
      present: new Set(worked.map(x => x.attendanceDate)).size,
      late: worked.filter(x => x.lateMinutes > 0).length,
      absent: r.filter(x => x.status === 'Absent').length,
      hours: Math.round(worked.reduce((s, x) => s + x.workingHours, 0) * 10) / 10,
    };
  });
  readonly cols = ['date', 'in', 'out', 'hours', 'late', 'status', 'notes'];

  readonly range = inject(FormBuilder).group({ from: [addDays(new Date(), -30) as Date | null], to: [new Date() as Date | null] });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.loadStatus();
    this.loadHistory();
    this.loadMonth();
  }


  loadStatus(): void {
    // Accounts without an employee profile (e.g. a pure Super Admin) get 400 — handled by the global toast.
    this.api.myAttendanceStatus().subscribe({ next: s => this.status.set(s), error: () => this.status.set(null) });
  }

  loadHistory(): void {
    const { from, to } = this.range.getRawValue();
    this.loadingHistory.set(true);
    this.api.myAttendanceHistory({ from: isoDate(from), to: isoDate(to), page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: r => { this.history.set(r.items); this.total.set(r.totalCount); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false),
    });
  }

  private loadMonth(): void {
    this.api.myAttendanceHistory({ from: isoDate(startOfMonth()), to: isoDate(new Date()), pageSize: 200 })
      .subscribe(r => this.monthRecords.set(r.items));
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.loadHistory();
  }

  async check(kind: CheckKind): Promise<void> {
    const s = this.status();
    if (!s) return;
    this.error.set(null);
    this.busy.set(kind);
    this.locating.set(s.verification.geofence);
    try {
      await performCheck(this.api, kind, s.verification, { notes: this.notes.trim() || null, workFromHome: kind === 'in' && this.wfh });
      this.toast.success(this.i18n.t(kind === 'in' ? 'attendance.my.checkedIn' : 'attendance.my.checkedOut'));
      this.notes = '';
      this.loadStatus();
      this.loadHistory();
      this.loadMonth();
    } catch (e) {
      this.error.set(e instanceof GeoError ? this.i18n.t(e.message) : problemMessage(e, this.i18n));
    } finally {
      this.busy.set(null);
      this.locating.set(false);
    }
  }

  mins = minutesToText;
  short = shortTime;
}

