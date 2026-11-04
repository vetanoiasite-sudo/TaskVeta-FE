import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { debounceTime, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, WallTimePipe, isoDate, minutesToText, startOfMonth } from '../../core/format';
import { TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { ATTENDANCE_STATUSES, AttendanceQuery, AttendanceRecord, AttendanceStatus, Perm } from '../../core/models';
import { EmptyStateComponent, ExportMenuComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent } from '../../shared/ui';
import { AttendanceDetailsDialogComponent } from './dialogs';

@Component({
  selector: 'app-attendance-history',
  imports: [PageHeaderComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, ExportMenuComponent, MatTableModule,
    MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatCheckboxModule,
    MatButtonModule, MatIconModule, MatTooltipModule, ReactiveFormsModule, TranslatePipe, TranslateEnumPipe, LocalDatePipe, WallTimePipe],
  template: `
    <app-page-header [title]="'attendance.history.title' | t" [subtitle]="'attendance.history.subtitle' | t" icon="history">
      @if (canExport) { <app-export-menu [disabled]="total() === 0" (export)="export($event)" /> }
    </app-page-header>

    <form class="filters" [formGroup]="form">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.dateRange' | t }}</mat-label>
        <mat-date-range-input [rangePicker]="picker">
          <input matStartDate formControlName="from" />
          <input matEndDate formControlName="to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'attendance.history.employeeName' | t }}</mat-label>
        <input matInput formControlName="employeeName" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'common.employeeCode' | t }}</mat-label>
        <input matInput formControlName="employeeCode" />
      </mat-form-field>
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
      <mat-form-field>
        <mat-label>{{ 'common.status' | t }}</mat-label>
        <mat-select formControlName="status">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ s | te: 'enums.status' }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-checkbox formControlName="late">{{ 'attendance.history.onlyLate' | t }}</mat-checkbox>
      <mat-checkbox formControlName="earlyLeave">{{ 'attendance.history.onlyEarly' | t }}</mat-checkbox>
      <mat-checkbox formControlName="missingCheckOut">{{ 'attendance.history.onlyMissing' | t }}</mat-checkbox>
      @if (employeeId()) {
        <span class="chip tone-primary">{{ 'attendance.history.oneEmployee' | t }}
          <button mat-icon-button type="button" class="chip-x" (click)="setEmployee(null)"><mat-icon>close</mat-icon></button></span>
      }
      <button mat-button type="button" (click)="reset()"><mat-icon>restart_alt</mat-icon>{{ 'common.reset' | t }}</button>
    </form>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="rows()" matSort matSortActive="attendanceDate" matSortDirection="desc" matSortDisableClear
               (matSortChange)="onSort($event)">
          <ng-container matColumnDef="attendanceDate">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.date' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.attendanceDate | ldate: 'weekday' }}</td>
          </ng-container>
          <ng-container matColumnDef="employeeName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.employee' | t }}</th>
            <td mat-cell *matCellDef="let r">
              <a class="emp-link" (click)="$event.stopPropagation(); setEmployee(r.employeeId)" [matTooltip]="'attendance.history.showEmployee' | t">{{ r.employeeName }}</a>
              <span class="cell-sub">{{ r.employeeCode }}</span>
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
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.checkOut' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.checkOutTime | wallTime }}</td>
          </ng-container>
          <ng-container matColumnDef="workingHours">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.workingHours' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.workingHours || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="lateMinutes">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.late' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.lateMinutes ? mins(r.lateMinutes) : '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="earlyLeaveMinutes">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'attendance.earlyLeave' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.earlyLeaveMinutes ? mins(r.earlyLeaveMinutes) : '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let r">
              <app-status-chip [value]="r.status" />
              @if (r.missingCheckOut) { <mat-icon class="flag danger" [matTooltip]="'enums.status.MissingCheckOut' | t">logout</mat-icon> }
              @if (r.isManuallyEdited) { <mat-icon class="flag" [matTooltip]="'attendance.history.edited' | t">edit_note</mat-icon> }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: cols" class="clickable" (click)="open(row)"></tr>
        </table>
      </div>
      @if (!loading() && rows().length === 0) { <app-empty-state icon="manage_search" [message]="'common.noData' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .emp-link { cursor: pointer; font-weight: 600; color: var(--text); &:hover { color: var(--primary); text-decoration: underline; } }
    .flag { font-size: 18px; width: 18px; height: 18px; vertical-align: middle; margin-inline-start: 4px; color: var(--text-muted); &.danger { color: var(--danger); } }
    .chip-x { width: 24px; height: 24px; padding: 0; mat-icon { font-size: 16px; width: 16px; height: 16px; } }
  `,
})
export class AttendanceHistoryComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly canExport = inject(AuthService).hasPermission(Perm.ReportsExport);
  readonly statuses = ATTENDANCE_STATUSES;
  readonly cols = ['attendanceDate', 'employeeName', 'departmentName', 'checkInTime', 'checkOutTime', 'workingHours', 'lateMinutes', 'earlyLeaveMinutes', 'status'];

  readonly form = inject(FormBuilder).group({
    from: [startOfMonth() as Date | null],
    to: [new Date() as Date | null],
    employeeName: [''],
    employeeCode: [''],
    departmentId: [null as number | null],
    teamId: [null as number | null],
    status: [null as AttendanceStatus | null],
    late: [false],
    earlyLeave: [false],
    missingCheckOut: [false],
  });

  readonly employeeId = signal<number | null>(Number(this.route.snapshot.queryParamMap.get('employeeId')) || null);
  readonly rows = signal<AttendanceRecord[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sort = signal<Sort>({ active: 'attendanceDate', direction: 'desc' });
  readonly loading = signal(false);
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  private readonly deptId = signal<number | null>(null);
  readonly teams = toSignal(toObservable(this.deptId).pipe(switchMap(id => this.lookups.teamsFor(id))), { initialValue: [] });

  constructor() {
    this.form.controls.departmentId.valueChanges.subscribe(id => { this.deptId.set(id); this.form.controls.teamId.setValue(null, { emitEvent: false }); });
    this.form.valueChanges.pipe(debounceTime(350)).subscribe(() => {
      const { from, to } = this.form.getRawValue();
      if ((from && !to) || (!from && to)) return; // wait for a complete range
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  private query(): AttendanceQuery {
    const v = this.form.getRawValue();
    const s = this.sort();
    return {
      from: isoDate(v.from), to: isoDate(v.to), employeeId: this.employeeId(), employeeName: v.employeeName?.trim(),
      employeeCode: v.employeeCode?.trim(), departmentId: v.departmentId, teamId: v.teamId, status: v.status,
      late: v.late || null, earlyLeave: v.earlyLeave || null, missingCheckOut: v.missingCheckOut || null,
      sortBy: s.active, sortDir: s.direction, page: this.page(), pageSize: this.pageSize(),
    };
  }

  load(): void {
    this.loading.set(true);
    this.api.attendance(this.query()).subscribe({
      next: r => { this.rows.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  setEmployee(id: number | null): void {
    this.employeeId.set(id);
    this.router.navigate([], { queryParams: { employeeId: id }, replaceUrl: true });
    this.page.set(1);
    this.load();
  }

  reset(): void {
    this.employeeId.set(null);
    this.form.reset({ from: startOfMonth(), to: new Date(), employeeName: '', employeeCode: '', departmentId: null, teamId: null,
      status: null, late: false, earlyLeave: false, missingCheckOut: false });
  }

  onSort(s: Sort): void {
    this.sort.set(s);
    this.page.set(1);
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  open(r: AttendanceRecord): void {
    this.dialog.open(AttendanceDetailsDialogComponent, { width: '600px', data: { id: r.id } })
      .afterClosed().subscribe(changed => { if (changed) this.load(); });
  }

  export(format: 'xlsx' | 'pdf'): void {
    this.api.exportAttendance(this.query(), format).subscribe();
  }

  mins = minutesToText;
}
