import { Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { debounceTime, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, addDays, isoDate } from '../../core/format';
import { TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Absence, AbsenceQuery, Perm } from '../../core/models';
import { EmptyStateComponent, ExportMenuComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent } from '../../shared/ui';

@Component({
  selector: 'app-absences',
  imports: [PageHeaderComponent, StatusChipComponent, StatCardComponent, LoadingBarComponent, EmptyStateComponent, ExportMenuComponent,
    MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatButtonToggleModule, MatButtonModule, MatIconModule, ReactiveFormsModule, FormsModule, TranslatePipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'attendance.absences.title' | t" [subtitle]="'attendance.absences.subtitle' | t" icon="person_off">
      @if (canExport) { <app-export-menu [disabled]="total() === 0" (export)="export($event)" /> }
    </app-page-header>

    <form class="filters" [formGroup]="form">
      <mat-button-toggle-group formControlName="mode">
        <mat-button-toggle value="day">{{ 'attendance.absences.singleDay' | t }}</mat-button-toggle>
        <mat-button-toggle value="range">{{ 'common.dateRange' | t }}</mat-button-toggle>
      </mat-button-toggle-group>
      @if (form.controls.mode.value === 'day') {
        <mat-form-field>
          <mat-label>{{ 'common.date' | t }}</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="date" [max]="today" />
          <mat-datepicker-toggle matIconSuffix [for]="dp" />
          <mat-datepicker #dp />
        </mat-form-field>
      } @else {
        <mat-form-field class="wide">
          <mat-label>{{ 'common.dateRange' | t }}</mat-label>
          <mat-date-range-input [rangePicker]="rp" [max]="today">
            <input matStartDate formControlName="from" />
            <input matEndDate formControlName="to" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="rp" />
          <mat-date-range-picker #rp />
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
      <mat-form-field>
        <mat-label>{{ 'common.employeeCode' | t }}</mat-label>
        <input matInput formControlName="employeeCode" />
      </mat-form-field>
      <mat-form-field class="wide">
        <mat-label>{{ 'common.search' | t }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput formControlName="search" [placeholder]="'attendance.searchHint' | t" />
      </mat-form-field>
    </form>

    <div class="stats">
      <app-stat-card [label]="'attendance.absences.total' | t" [value]="total()" icon="event_busy" tone="danger" />
      <app-stat-card [label]="'attendance.absences.employees' | t" [value]="distinctEmployees()" icon="group_off" tone="warning"
                     [hint]="'attendance.absences.onPage' | t" />
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="rows()" matSort matSortActive="date" matSortDirection="desc" matSortDisableClear (matSortChange)="onSort($event)">
          <ng-container matColumnDef="employeeName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.employee' | t }}</th>
            <td mat-cell *matCellDef="let r"><span class="cell-strong">{{ r.employeeName }}</span></td>
          </ng-container>
          <ng-container matColumnDef="employeeCode">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.employeeCode' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.employeeCode }}</td>
          </ng-container>
          <ng-container matColumnDef="departmentName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.department' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.departmentName }}</td>
          </ng-container>
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.date' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.date | ldate: 'weekday' }}</td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ 'attendance.absences.status' | t }}</th>
            <td mat-cell *matCellDef="let r"><app-status-chip [value]="r.absenceStatus" /></td>
          </ng-container>
          <ng-container matColumnDef="reason">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.reason' | t }}</th>
            <td mat-cell *matCellDef="let r" class="muted">{{ r.reason || '—' }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="cols; sticky: true"></tr>
          <tr mat-row *matRowDef="let row; columns: cols" class="clickable" (click)="openHistory(row)"></tr>
        </table>
      </div>
      @if (!loading() && rows().length === 0) { <app-empty-state icon="sentiment_satisfied" [message]="'attendance.absences.none' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
})
export class AbsencesComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  private readonly router = inject(Router);
  readonly canExport = inject(AuthService).hasPermission(Perm.ReportsExport);
  readonly today = new Date();
  readonly cols = ['employeeName', 'employeeCode', 'departmentName', 'date', 'status', 'reason'];

  readonly form = inject(FormBuilder).group({
    mode: ['day' as 'day' | 'range'],
    date: [new Date() as Date | null],
    from: [addDays(new Date(), -6) as Date | null],
    to: [new Date() as Date | null],
    departmentId: [null as number | null],
    teamId: [null as number | null],
    employeeCode: [''],
    search: [''],
  });

  readonly rows = signal<Absence[]>([]);
  readonly total = signal(0);
  readonly distinctEmployees = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly sort = signal<Sort>({ active: 'date', direction: 'desc' });
  readonly loading = signal(false);
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  private readonly deptId = signal<number | null>(null);
  readonly teams = toSignal(toObservable(this.deptId).pipe(switchMap(id => this.lookups.teamsFor(id))), { initialValue: [] });

  constructor() {
    this.form.controls.departmentId.valueChanges.subscribe(id => { this.deptId.set(id); this.form.controls.teamId.setValue(null, { emitEvent: false }); });
    this.form.valueChanges.pipe(debounceTime(350)).subscribe(() => {
      const v = this.form.getRawValue();
      if (v.mode === 'range' && (!v.from || !v.to)) return;
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  private query(): AbsenceQuery {
    const v = this.form.getRawValue();
    const s = this.sort();
    const single = v.mode === 'day';
    return {
      date: single ? isoDate(v.date) : null, from: single ? null : isoDate(v.from), to: single ? null : isoDate(v.to),
      departmentId: v.departmentId, teamId: v.teamId, employeeCode: v.employeeCode?.trim(), search: v.search?.trim(),
      sortBy: s.active, sortDir: s.direction, page: this.page(), pageSize: this.pageSize(),
    };
  }

  load(): void {
    this.loading.set(true);
    this.api.absences(this.query()).subscribe({
      next: r => {
        this.rows.set(r.items);
        this.total.set(r.totalCount);
        this.distinctEmployees.set(new Set(r.items.map(i => i.employeeId)).size);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSort(s: Sort): void { this.sort.set(s); this.page.set(1); this.load(); }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  openHistory(a: Absence): void {
    this.router.navigate(['/attendance/history'], { queryParams: { employeeId: a.employeeId } });
  }

  export(format: 'xlsx' | 'pdf'): void {
    const q = this.query();
    this.api.exportReport('absence', {
      from: q.date ?? q.from, to: q.date ?? q.to, departmentId: q.departmentId, teamId: q.teamId,
    }, format).subscribe();
  }
}
