import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { LeaveRequest, LeaveStatus, Perm } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent } from '../../shared/ui';
import { LeaveRequestDialogComponent } from './dialogs';

type Tab = 'mine' | 'review';

@Component({
  selector: 'app-leave',
  imports: [PageHeaderComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, MatTabsModule, MatTableModule,
    MatPaginatorModule, MatButtonModule, MatIconModule, MatTooltipModule, MatFormFieldModule, MatSelectModule, FormsModule,
    TranslatePipe, TranslateEnumPipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'attendance.leave.title' | t" [subtitle]="'attendance.leave.subtitle' | t" icon="beach_access">
      @if (hasEmployee()) {
        <button mat-flat-button (click)="create()"><mat-icon>add</mat-icon>{{ 'attendance.leave.new' | t }}</button>
      }
    </app-page-header>

    @if (canReview) {
      <mat-tab-group [selectedIndex]="tab() === 'mine' ? 0 : 1" (selectedIndexChange)="switchTab($event === 0 ? 'mine' : 'review')" animationDuration="0">
        <mat-tab [label]="'attendance.leave.mine' | t" />
        <mat-tab [label]="'attendance.leave.toReview' | t" />
      </mat-tab-group>
    }

    <div class="filters">
      <mat-form-field>
        <mat-label>{{ 'common.status' | t }}</mat-label>
        <mat-select [ngModel]="status()" (ngModelChange)="status.set($event); page.set(1); load()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ s | te: 'enums.status' }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="rows()">
          <ng-container matColumnDef="employee"><th mat-header-cell *matHeaderCellDef>{{ 'common.employee' | t }}</th>
            <td mat-cell *matCellDef="let r"><span class="cell-strong">{{ r.employeeName }}</span><span class="cell-sub">{{ r.employeeCode }} · {{ r.departmentName }}</span></td></ng-container>
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>{{ 'attendance.leave.type' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.type | te: 'enums.leaveType' }}</td></ng-container>
          <ng-container matColumnDef="period"><th mat-header-cell *matHeaderCellDef>{{ 'common.period' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.startDate | ldate }} – {{ r.endDate | ldate }}<span class="cell-sub">{{ r.days }} {{ 'common.days' | t }}</span></td></ng-container>
          <ng-container matColumnDef="reason"><th mat-header-cell *matHeaderCellDef>{{ 'common.reason' | t }}</th>
            <td mat-cell *matCellDef="let r" class="muted">{{ r.reason || '—' }}</td></ng-container>
          <ng-container matColumnDef="status"><th mat-header-cell *matHeaderCellDef>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let r"><app-status-chip [value]="r.status" />
              @if (r.reviewedBy) { <span class="cell-sub">{{ r.reviewedBy }}@if (r.reviewNotes) { : {{ r.reviewNotes }} }</span> }</td></ng-container>
          <ng-container matColumnDef="created"><th mat-header-cell *matHeaderCellDef>{{ 'common.createdAt' | t }}</th>
            <td mat-cell *matCellDef="let r">{{ r.createdAt | ldate: 'relative' }}</td></ng-container>
          <ng-container matColumnDef="actions"><th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let r" class="actions-cell">
              @if (tab() === 'review' && r.status === 'Pending' && r.employeeId !== myEmployeeId) {
                <button mat-icon-button class="ok" [matTooltip]="'attendance.leave.approve' | t" (click)="review(r, true)"><mat-icon>check_circle</mat-icon></button>
                <button mat-icon-button class="no" [matTooltip]="'attendance.leave.reject' | t" (click)="review(r, false)"><mat-icon>cancel</mat-icon></button>
              }
              @if (tab() === 'mine' && (r.status === 'Pending' || r.status === 'Approved')) {
                <button mat-icon-button [matTooltip]="'attendance.leave.cancel' | t" (click)="cancel(r)"><mat-icon>block</mat-icon></button>
              }
            </td></ng-container>
          <tr mat-header-row *matHeaderRowDef="cols()"></tr>
          <tr mat-row *matRowDef="let row; columns: cols()"></tr>
        </table>
      </div>
      @if (!loading() && rows().length === 0) { <app-empty-state icon="beach_access" [message]="'attendance.leave.empty' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    mat-tab-group { margin-bottom: 12px; }
    .ok { color: var(--success); } .no { color: var(--danger); }
  `,
})
export class LeaveComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  readonly canReview = this.auth.hasPermission(Perm.LeaveApprove);
  readonly myEmployeeId = this.auth.user()?.employeeId ?? null;
  readonly hasEmployee = computed(() => !!this.auth.user()?.employeeId);
  readonly statuses: LeaveStatus[] = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

  readonly tab = signal<Tab>('mine');
  readonly status = signal<LeaveStatus | null>(null);
  readonly rows = signal<LeaveRequest[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly loading = signal(false);
  readonly cols = computed(() => this.tab() === 'mine'
    ? ['type', 'period', 'reason', 'status', 'created', 'actions']
    : ['employee', 'type', 'period', 'reason', 'status', 'created', 'actions']);

  constructor() {
    if (!this.hasEmployee() && this.canReview) this.switchTab('review');
    else this.load();
  }

  switchTab(t: Tab): void {
    this.tab.set(t);
    this.status.set(t === 'review' ? 'Pending' : null);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.leaveRequests({ mine: this.tab() === 'mine', status: this.status(), page: this.page(), pageSize: this.pageSize() }).subscribe({
      next: r => { this.rows.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  create(): void {
    this.dialog.open(LeaveRequestDialogComponent, { width: '480px' }).afterClosed().subscribe(r => {
      if (r) { if (this.tab() !== 'mine') this.switchTab('mine'); else this.load(); }
    });
  }

  review(r: LeaveRequest, approve: boolean): void {
    this.confirm.ask({
      title: this.i18n.t(approve ? 'attendance.leave.approve' : 'attendance.leave.reject'),
      message: `${r.employeeName} · ${this.i18n.enum('enums.leaveType', r.type)} · ${r.startDate} – ${r.endDate}`,
      inputLabel: this.i18n.t(approve ? 'attendance.leave.noteOptional' : 'attendance.leave.rejectReason'),
      inputRequired: !approve,
      danger: !approve,
      confirmText: this.i18n.t(approve ? 'attendance.leave.approve' : 'attendance.leave.reject'),
    }).subscribe(note => {
      this.api.reviewLeave(r.id, approve, typeof note === 'string' && note ? note : null).subscribe(() => {
        this.toast.success(this.i18n.t(approve ? 'attendance.leave.approved' : 'attendance.leave.rejected'));
        this.load();
      });
    });
  }

  cancel(r: LeaveRequest): void {
    this.confirm.ask({ title: this.i18n.t('attendance.leave.cancel'), message: this.i18n.t('attendance.leave.cancelConfirm'), danger: true })
      .subscribe(() => this.api.cancelLeave(r.id).subscribe(() => { this.toast.success(this.i18n.t('common.saved')); this.load(); }));
  }
}
