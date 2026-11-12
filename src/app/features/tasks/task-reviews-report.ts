import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, of, startWith, switchMap } from 'rxjs';
import { ApiService, ExportFormat } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, isoDate, startOfMonth } from '../../core/format';
import { TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Perm, ReportQuery, TaskReviewReport } from '../../core/models';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent } from '../../shared/ui';

/** Approvals / rejections and 1–10 ratings given by department heads and team leaders in a chosen period. */
@Component({
  selector: 'app-task-reviews-report',
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule,
    MatIconModule, MatMenuModule, MatTableModule, MatTooltipModule, PageHeaderComponent, StatCardComponent, LoadingBarComponent,
    EmptyStateComponent, TranslatePipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'tasks.reviewReport.title' | t" [subtitle]="'tasks.reviewReport.subtitle' | t" icon="grade">
      @if (canExport) {
        <button mat-stroked-button [matMenuTriggerFor]="exp" [disabled]="!report()"><mat-icon>download</mat-icon>{{ 'common.export' | t }}</button>
        <mat-menu #exp="matMenu">
          <button mat-menu-item (click)="export('xlsx', 'summary')"><mat-icon>grid_on</mat-icon>{{ 'tasks.reviewReport.byEmployee' | t }} (Excel)</button>
          <button mat-menu-item (click)="export('pdf', 'summary')"><mat-icon>picture_as_pdf</mat-icon>{{ 'tasks.reviewReport.byEmployee' | t }} (PDF)</button>
          <button mat-menu-item (click)="export('xlsx', 'items')"><mat-icon>grid_on</mat-icon>{{ 'tasks.reviewReport.allReviews' | t }} (Excel)</button>
          <button mat-menu-item (click)="export('pdf', 'items')"><mat-icon>picture_as_pdf</mat-icon>{{ 'tasks.reviewReport.allReviews' | t }} (PDF)</button>
        </mat-menu>
      }
    </app-page-header>

    <form class="filters" [formGroup]="form">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.period' | t }}</mat-label>
        <mat-date-range-input [rangePicker]="rp">
          <input matStartDate formControlName="from" />
          <input matEndDate formControlName="to" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="rp" />
        <mat-date-range-picker #rp />
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
        <mat-label>{{ 'common.employee' | t }}</mat-label>
        <mat-select formControlName="employeeId">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (e of employees(); track e.id) { <mat-option [value]="e.id">{{ e.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </form>

    <app-loading-bar [loading]="loading()" />
    @if (report(); as r) {
      <div class="stats">
        <app-stat-card [label]="'tasks.reviewReport.reviews' | t" [value]="r.reviews" icon="rate_review" tone="primary" />
        <app-stat-card [label]="'tasks.reviewReport.approved' | t" [value]="r.approved" icon="task_alt" tone="success" />
        <app-stat-card [label]="'tasks.reviewReport.rejected' | t" [value]="r.rejected" icon="block" tone="danger" />
        <app-stat-card [label]="'tasks.reviewReport.averageRating' | t" [value]="r.averageRating !== null ? ltr(r.averageRating + ' / 10') : '—'"
                       icon="grade" tone="warning" />
      </div>

      <div class="table-card">
        <h3 class="card__title pad">{{ 'tasks.reviewReport.byEmployee' | t }}</h3>
        <div class="table-scroll">
          <table mat-table [dataSource]="r.byEmployee">
            <ng-container matColumnDef="employee">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.employee' | t }}</th>
              <td mat-cell *matCellDef="let e"><span class="cell-strong">{{ e.employeeName }}</span>
                <span class="cell-sub">{{ e.employeeCode }} · {{ e.departmentName }}</span></td>
            </ng-container>
            <ng-container matColumnDef="reviews">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.reviewReport.reviews' | t }}</th>
              <td mat-cell *matCellDef="let e">{{ e.reviews }}</td>
            </ng-container>
            <ng-container matColumnDef="approved">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.reviewReport.approved' | t }}</th>
              <td mat-cell *matCellDef="let e" class="ok">{{ e.approved }}</td>
            </ng-container>
            <ng-container matColumnDef="rejected">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.reviewReport.rejected' | t }}</th>
              <td mat-cell *matCellDef="let e" [class.bad]="e.rejected > 0">{{ e.rejected }}</td>
            </ng-container>
            <ng-container matColumnDef="approvalRate">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.reviewReport.approvalRate' | t }}</th>
              <td mat-cell *matCellDef="let e">{{ e.approvalRate }}%</td>
            </ng-container>
            <ng-container matColumnDef="rating">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.reviewReport.averageRating' | t }}</th>
              <td mat-cell *matCellDef="let e">
                @if (e.averageRating !== null) {
                  <div class="rating-bar" [matTooltip]="('tasks.reviewReport.range' | t) + ': ' + e.minRating + ' – ' + e.maxRating">
                    <div class="bar"><div class="fill" [style.width.%]="e.averageRating * 10" [class]="'fill ' + tone(e.averageRating)"></div></div>
                    <strong>{{ e.averageRating }}</strong>
                  </div>
                } @else { — }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="employeeColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: employeeColumns"></tr>
          </table>
        </div>
        @if (!r.byEmployee.length) { <app-empty-state icon="grade" [message]="'tasks.reviewReport.empty' | t" /> }
      </div>

      <div class="table-card">
        <h3 class="card__title pad">{{ 'tasks.reviewReport.allReviews' | t }}</h3>
        <div class="table-scroll">
          <table mat-table [dataSource]="r.items">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>{{ 'common.date' | t }}</th>
              <td mat-cell *matCellDef="let i" class="nowrap">{{ i.reviewedAt | ldate: 'datetime' }}</td>
            </ng-container>
            <ng-container matColumnDef="task">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.fields.title' | t }}</th>
              <td mat-cell *matCellDef="let i"><a class="cell-strong" [routerLink]="['/tasks', i.taskId]">{{ i.taskTitle }}</a>
                <span class="cell-sub">{{ i.assignees }}@if (i.projectName) { · {{ i.projectName }} }</span></td>
            </ng-container>
            <ng-container matColumnDef="reviewer">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.review.reviewer' | t }}</th>
              <td mat-cell *matCellDef="let i">{{ i.reviewerName }}</td>
            </ng-container>
            <ng-container matColumnDef="decision">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.review.decision' | t }}</th>
              <td mat-cell *matCellDef="let i">
                <span class="chip" [class.tone-success]="i.approved" [class.tone-danger]="!i.approved">
                  {{ (i.approved ? 'tasks.reviewReport.approvedOne' : 'tasks.reviewReport.rejectedOne') | t }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="rating">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.review.rating' | t }}</th>
              <td mat-cell *matCellDef="let i">@if (i.rating !== null) { <strong>{{ i.rating }}</strong>/10 } @else { — }</td>
            </ng-container>
            <ng-container matColumnDef="notes">
              <th mat-header-cell *matHeaderCellDef>{{ 'tasks.review.notes' | t }}</th>
              <td mat-cell *matCellDef="let i" class="notes">{{ i.notes ?? '—' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="itemColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: itemColumns"></tr>
          </table>
        </div>
        @if (!r.items.length) { <app-empty-state icon="rate_review" [message]="'tasks.reviewReport.empty' | t" /> }
      </div>
    }
  `,
  styles: `
    .stats { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-bottom: 16px; }
    .table-card { margin-bottom: 16px; }
    .pad { padding: 16px 16px 0; margin: 0; }
    .ok { color: var(--success); font-weight: 600; }
    .bad { color: var(--danger); font-weight: 600; }
    .nowrap { white-space: nowrap; }
    .notes { max-width: 360px; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
    a.cell-strong { color: inherit; text-decoration: none; &:hover { color: var(--primary); text-decoration: underline; } }
    .rating-bar { display: flex; align-items: center; gap: 8px; min-width: 140px;
      .bar { flex: 1; height: 8px; border-radius: 999px; background: var(--neutral-soft); overflow: hidden; }
      .fill { height: 100%; border-radius: 999px; }
      .fill.high { background: var(--success); } .fill.mid { background: var(--warning); } .fill.low { background: var(--danger); } }
  `,
})
export class TaskReviewsReportComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  /** Data is scoped to the people the user manages, so everyone who can open the report may export it. */
  readonly canExport = inject(AuthService).hasPermission(Perm.TaskReviewsView);
  readonly employeeColumns = ['employee', 'reviews', 'approved', 'rejected', 'approvalRate', 'rating'];
  readonly itemColumns = ['date', 'task', 'reviewer', 'decision', 'rating', 'notes'];

  readonly form = inject(FormBuilder).group({
    from: [startOfMonth() as Date | null],
    to: [new Date() as Date | null],
    departmentId: [null as number | null],
    teamId: [null as number | null],
    employeeId: [null as number | null],
  });

  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  readonly employees = toSignal(this.lookups.employees(), { initialValue: [] });
  readonly teams = toSignal(this.form.controls.departmentId.valueChanges.pipe(
    startWith(null), switchMap(d => this.lookups.teamsFor(d))), { initialValue: [] });

  readonly loading = signal(false);
  readonly report = signal<TaskReviewReport | null>(null);

  constructor() {
    this.form.controls.departmentId.valueChanges.subscribe(() => this.form.controls.teamId.setValue(null, { emitEvent: false }));
    this.form.valueChanges.pipe(debounceTime(350), startWith(null), switchMap(() => {
      const q = this.query();
      if (!q.from || !q.to) return of(null);
      this.loading.set(true);
      return this.api.taskReviewReport(q).pipe(catchError(() => of(null)));
    })).subscribe({
      next: r => { if (r) this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private query(): ReportQuery {
    const v = this.form.getRawValue();
    return { from: isoDate(v.from), to: isoDate(v.to), departmentId: v.departmentId, teamId: v.teamId, employeeId: v.employeeId };
  }

  /** Keeps "6 / 10" in that order inside RTL text (Unicode left-to-right isolate). */
  ltr(text: string): string {
    return `⁦${text}⁩`;
  }

  tone(avg: number): string {
    return avg >= 7.5 ? 'high' : avg >= 5 ? 'mid' : 'low';
  }

  export(format: ExportFormat, view: 'summary' | 'items'): void {
    this.api.exportTaskReviews(this.query(), format, view).subscribe();
  }
}
