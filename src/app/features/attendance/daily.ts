import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { WallTimePipe, isoDate, minutesToText, parseIsoDate } from '../../core/format';
import { TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { DailyRow, DailySummary, Perm } from '../../core/models';
import { AvatarComponent, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent, debounce } from '../../shared/ui';
import { AttendanceDetailsDialogComponent, CorrectionDialogComponent, CorrectionData } from './dialogs';

const STATES = ['present', 'late', 'inside', 'earlyleave', 'Absent', 'NotArrived', 'OnLeave', 'MissingCheckOut', 'CheckedOut', 'WorkFromHome', 'Holiday', 'Weekend'];

@Component({
  selector: 'app-daily-attendance',
  imports: [PageHeaderComponent, StatCardComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, AvatarComponent,
    MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatButtonModule, MatIconModule, MatTooltipModule, FormsModule, TranslatePipe, WallTimePipe],
  template: `
    <app-page-header [title]="'attendance.daily.title' | t" [subtitle]="'attendance.daily.subtitle' | t" icon="today">
      <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon>{{ 'common.refresh' | t }}</button>
    </app-page-header>

    @if (summary(); as s) {
      <div class="stats">
        <app-stat-card [label]="'dashboard.totalEmployees' | t" [value]="s.totalEmployees" icon="groups" tone="primary" [clickable]="true" (pressed)="setState(null)" />
        <app-stat-card [label]="'attendance.daily.present' | t" [value]="s.present" icon="how_to_reg" tone="success" [clickable]="true" (pressed)="setState('present')" />
        <app-stat-card [label]="'attendance.daily.absent' | t" [value]="s.absent" icon="person_off" tone="danger" [clickable]="true" (pressed)="setState('Absent')" />
        <app-stat-card [label]="'attendance.daily.late' | t" [value]="s.late" icon="schedule" tone="warning" [clickable]="true" (pressed)="setState('late')" />
        <app-stat-card [label]="'dashboard.onLeave' | t" [value]="s.onLeave" icon="beach_access" tone="info" [clickable]="true" (pressed)="setState('OnLeave')" />
        <app-stat-card [label]="'dashboard.insideNow' | t" [value]="s.insideNow" icon="meeting_room" tone="purple" [clickable]="true" (pressed)="setState('inside')" />
        <app-stat-card [label]="'attendance.daily.earlyLeave' | t" [value]="s.earlyLeave" icon="directions_walk" tone="warning" [clickable]="true" (pressed)="setState('earlyleave')" />
        <app-stat-card [label]="'dashboard.attendanceRate' | t" [value]="s.attendancePercentage + '%'" icon="percent" tone="success"
                       [hint]="'attendance.daily.expected' | t: { n: s.expected }" />
      </div>
    }

    <div class="filters">
      <mat-form-field>
        <mat-label>{{ 'common.date' | t }}</mat-label>
        <input matInput [matDatepicker]="dp" [ngModel]="date()" (ngModelChange)="date.set($event); reload()" [max]="today" />
        <mat-datepicker-toggle matIconSuffix [for]="dp" />
        <mat-datepicker #dp />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'common.department' | t }}</mat-label>
        <mat-select [ngModel]="departmentId()" (ngModelChange)="departmentId.set($event); teamId.set(null); reload()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'common.team' | t }}</mat-label>
        <mat-select [ngModel]="teamId()" (ngModelChange)="teamId.set($event); reload()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (t of teams(); track t.id) { <mat-option [value]="t.id">{{ t.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'attendance.daily.state' | t }}</mat-label>
        <mat-select [ngModel]="state()" (ngModelChange)="setState($event)">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (s of states; track s) { <mat-option [value]="s">{{ 'attendance.daily.states.' + s | t }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="wide">
        <mat-label>{{ 'common.search' | t }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="search()" (ngModelChange)="onSearch($event)" [placeholder]="'attendance.searchHint' | t" />
      </mat-form-field>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="rows()" matSort matSortDisableClear (matSortChange)="onSort($event)">
          <ng-container matColumnDef="employeeName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.employee' | t }}</th>
            <td mat-cell *matCellDef="let r">
              <div class="emp"><app-avatar [name]="r.employeeName" [size]="30" />
                <div><span class="cell-strong">{{ r.employeeName }}</span><span class="cell-sub">{{ r.employeeCode }}</span></div></div>
            </td>
          </ng-container>
          <ng-container matColumnDef="departmentName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.department' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.departmentName }}</td>
          </ng-container>
          <ng-container matColumnDef="checkInTime">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.checkIn' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.checkInTime | wallTime }}</td>
          </ng-container>
          <ng-container matColumnDef="checkOutTime">
            <th mat-header-cell *matHeaderCellDef>{{ 'attendance.checkOut' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.checkOutTime | wallTime }}</td>
          </ng-container>
          <ng-container matColumnDef="hours">
            <th mat-header-cell *matHeaderCellDef>{{ 'attendance.workingHours' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.workingHours || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="lateMinutes">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.late' | t }}</th>
            <td mat-cell *matCellDef="let r" [class.warn]="r.lateMinutes">{{ r.lateMinutes ? mins(r.lateMinutes) : '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="state">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let r">
              <app-status-chip [value]="r.state" />
              @if (r.status && r.status !== 'Absent' && r.status !== 'OnLeave' && r.status !== 'Holiday') { <app-status-chip [value]="r.status" /> }
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r" class="actions-cell">
              @if (r.recordId) {
                <button mat-icon-button [matTooltip]="'common.details' | t" (click)="details(r)"><mat-icon>visibility</mat-icon></button>
              }
              @if (canCorrect && r.state !== 'Upcoming') {
                <button mat-icon-button [matTooltip]="(r.recordId ? 'attendance.correct.action' : 'attendance.correct.manualTitle') | t" (click)="correct(r)">
                  <mat-icon>{{ r.recordId ? 'edit_calendar' : 'add_circle_outline' }}</mat-icon>
                </button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: cols"></tr>
        </table>
      </div>
      @if (!loading() && rows().length === 0) { <app-empty-state icon="event_busy" [message]="'common.noData' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .emp { display: flex; align-items: center; gap: 10px; }
    td.warn { color: var(--warning); font-weight: 600; }
    app-status-chip + app-status-chip { margin-inline-start: 4px; }
  `,
})
export class DailyAttendanceComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly canCorrect = inject(AuthService).hasPermission(Perm.AttendanceCorrect);
  readonly states = STATES;
  readonly today = new Date();

  readonly date = signal<Date>(parseIsoDate(this.route.snapshot.queryParamMap.get('date')) ?? new Date());
  readonly departmentId = signal<number | null>(null);
  readonly teamId = signal<number | null>(null);
  readonly state = signal<string | null>(this.route.snapshot.queryParamMap.get('state'));
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly sort = signal<Sort>({ active: 'employeeName', direction: 'asc' });

  readonly rows = signal<DailyRow[]>([]);
  readonly total = signal(0);
  readonly summary = signal<DailySummary | null>(null);
  readonly loading = signal(false);
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  readonly teams = toSignal(toObservable(this.departmentId).pipe(switchMap(id => this.lookups.teamsFor(id))), { initialValue: [] });
  readonly cols = ['employeeName', 'departmentName', 'checkInTime', 'checkOutTime', 'hours', 'lateMinutes', 'state', 'actions'];

  readonly onSearch = debounce((v: string) => { this.search.set(v); this.reload(); });

  constructor() {
    this.load();
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const s = this.sort();
    this.api.attendanceDaily({
      date: isoDate(this.date()), departmentId: this.departmentId(), teamId: this.teamId(), state: this.state(),
      search: this.search(), page: this.page(), pageSize: this.pageSize(), sortBy: s.active, sortDir: s.direction,
    }).subscribe({
      next: r => { this.summary.set(r.summary); this.rows.set(r.rows.items); this.total.set(r.rows.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setState(state: string | null): void {
    this.state.set(state);
    this.router.navigate([], { queryParams: { state: state || null }, queryParamsHandling: 'merge', replaceUrl: true });
    this.reload();
  }

  onSort(s: Sort): void {
    this.sort.set(s);
    this.reload();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  details(r: DailyRow): void {
    this.dialog.open(AttendanceDetailsDialogComponent, { width: '600px', data: { id: r.recordId } })
      .afterClosed().subscribe(changed => { if (changed) this.load(); });
  }

  correct(r: DailyRow): void {
    const data: CorrectionData = {
      recordId: r.recordId, employeeId: r.employeeId, employeeName: r.employeeName, date: isoDate(this.date())!,
      checkInTime: r.checkInTime, checkOutTime: r.checkOutTime, status: r.status, notes: r.notes,
    };
    this.dialog.open(CorrectionDialogComponent, { width: '560px', data }).afterClosed().subscribe(res => { if (res) this.load(); });
  }

  mins = minutesToText;
}


