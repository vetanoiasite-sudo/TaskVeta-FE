import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { ApiService } from '../../core/api.service';
import { LocalDatePipe, addDays, isoDate } from '../../core/format';
import { TranslatePipe } from '../../core/i18n.service';
import { AuditLog } from '../../core/models';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, debounce } from '../../shared/ui';

const ENTITIES = ['AttendanceRecord', 'Employee', 'User', 'Department', 'Team', 'Task', 'LeaveRequest', 'WorkSchedule', 'Holiday', 'SystemSettings'];
const ACTIONS = ['Create', 'Update', 'Delete', 'Deactivate', 'Correct', 'CreateManual', 'ChangeStatus', 'Approve', 'Reject', 'Cancel',
  'Login', 'LoginFailed', 'Logout', 'Register', 'PasswordChanged', 'ResetPassword', 'Unlock', 'RefreshTokenReuse', 'CheckInRejected',
  'CheckOutRejected', 'AddMember', 'RemoveMember', 'RegenerateQrSecret'];

function pretty(json: string | null): string {
  if (!json) return '—';
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; }
}

@Component({
  selector: 'app-audit-details',
  imports: [MatDialogModule, MatButtonModule, TranslatePipe, LocalDatePipe],
  template: `
    <h2 mat-dialog-title>{{ data.action }} · {{ data.entityName }} {{ data.entityId ? '#' + data.entityId : '' }}</h2>
    <mat-dialog-content>
      <dl class="meta">
        <dt>{{ 'admin.audit.time' | t }}</dt><dd>{{ data.createdAt | ldate: 'datetime' }}</dd>
        <dt>{{ 'admin.audit.user' | t }}</dt><dd>{{ data.userName || ('admin.audit.system' | t) }}</dd>
        <dt>IP</dt><dd dir="ltr">{{ data.ipAddress || '—' }}</dd>
        <dt>{{ 'common.reason' | t }}</dt><dd>{{ data.reason || '—' }}</dd>
      </dl>
      <div class="diff">
        <div><h4>{{ 'admin.audit.oldValues' | t }}</h4><pre>{{ old }}</pre></div>
        <div><h4>{{ 'admin.audit.newValues' | t }}</h4><pre>{{ next }}</pre></div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>{{ 'common.close' | t }}</button></mat-dialog-actions>
  `,
  styles: `
    .meta { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0 0 16px; dt { color: var(--text-muted); } dd { margin: 0; } }
    .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; h4 { margin: 0 0 6px; }
      @media (max-width: 700px) { grid-template-columns: 1fr; } }
    pre { direction: ltr; text-align: left; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 10px; font-size: 12px;
      overflow: auto; max-height: 360px; margin: 0; white-space: pre-wrap; word-break: break-word; }
  `,
})
export class AuditDetailsDialogComponent {
  readonly data = inject<AuditLog>(MAT_DIALOG_DATA);
  readonly old = pretty(this.data.oldValues);
  readonly next = pretty(this.data.newValues);
}

@Component({
  selector: 'app-audit',
  imports: [PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, MatTableModule, MatPaginatorModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatButtonModule, MatIconModule, FormsModule, TranslatePipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'admin.audit.title' | t" [subtitle]="'admin.audit.subtitle' | t" icon="policy" />

    <div class="filters">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.search' | t }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="search()" (ngModelChange)="search.set($event); searchLater()" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'admin.audit.entity' | t }}</mat-label>
        <mat-select [ngModel]="entity()" (ngModelChange)="entity.set($event); reload()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (e of entities; track e) { <mat-option [value]="e">{{ e }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'admin.audit.action' | t }}</mat-label>
        <mat-select [ngModel]="action()" (ngModelChange)="action.set($event); reload()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (a of actions; track a) { <mat-option [value]="a">{{ a }}</mat-option> }
        </mat-select>
      </mat-form-field>
      <mat-form-field class="wide">
        <mat-label>{{ 'common.dateRange' | t }}</mat-label>
        <mat-date-range-input [rangePicker]="picker">
          <input matStartDate [ngModel]="from()" (ngModelChange)="from.set($event)" [placeholder]="'common.from' | t" />
          <input matEndDate [ngModel]="to()" (ngModelChange)="to.set($event); reload()" [placeholder]="'common.to' | t" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-date-range-picker #picker />
      </mat-form-field>
      <span class="spacer"></span>
      <button mat-button (click)="reset()"><mat-icon>filter_alt_off</mat-icon>{{ 'common.reset' | t }}</button>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="items()">
          <ng-container matColumnDef="time">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.audit.time' | t }}</th>
            <td mat-cell *matCellDef="let a">{{ a.createdAt | ldate: 'datetime' }}</td>
          </ng-container>
          <ng-container matColumnDef="user">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.audit.user' | t }}</th>
            <td mat-cell *matCellDef="let a">{{ a.userName || ('admin.audit.system' | t) }}</td>
          </ng-container>
          <ng-container matColumnDef="action">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.audit.action' | t }}</th>
            <td mat-cell *matCellDef="let a"><span class="chip" [class]="tone(a.action)">{{ a.action }}</span></td>
          </ng-container>
          <ng-container matColumnDef="entity">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.audit.entity' | t }}</th>
            <td mat-cell *matCellDef="let a">{{ a.entityName }} @if (a.entityId) { <span class="muted">#{{ a.entityId }}</span> }</td>
          </ng-container>
          <ng-container matColumnDef="reason">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.reason' | t }}</th>
            <td mat-cell *matCellDef="let a" class="reason">{{ a.reason || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="ip">
            <th mat-header-cell *matHeaderCellDef>IP</th>
            <td mat-cell *matCellDef="let a" dir="ltr">{{ a.ipAddress || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="view">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let a" class="actions-cell"><mat-icon class="muted">chevron_right</mat-icon></td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns" class="clickable" (click)="open(row)"></tr>
        </table>
      </div>
      @if (!loading() && items().length === 0) { <app-empty-state icon="policy" [message]="'common.noData' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .reason { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    [dir='rtl'] .actions-cell mat-icon { transform: scaleX(-1); }
  `,
})
export class AuditComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  readonly entities = ENTITIES;
  readonly actions = ACTIONS;
  readonly columns = ['time', 'user', 'action', 'entity', 'reason', 'ip', 'view'];
  readonly items = signal<AuditLog[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly entity = signal<string | null>(null);
  readonly action = signal<string | null>(null);
  readonly from = signal<Date | null>(null);
  readonly to = signal<Date | null>(null);
  readonly searchLater = debounce(() => this.reload());

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    const to = this.to();
    this.api.auditLogs({
      page: this.page(), pageSize: this.pageSize(), search: this.search().trim() || undefined, entityName: this.entity(), action: this.action(),
      from: this.from() ? isoDate(this.from()) : null,
      to: to ? isoDate(addDays(to, 1)) : null,
    }).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  reset(): void {
    this.search.set('');
    this.entity.set(null);
    this.action.set(null);
    this.from.set(null);
    this.to.set(null);
    this.reload();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  tone(action: string): string {
    if (/Delete|Reject|Failed|Reuse|Rejected|Deactivate/.test(action)) return 'chip tone-danger';
    if (/Create|Approve|Register|Login$/.test(action)) return 'chip tone-success';
    if (/Correct|Update|Change|Reset|Regenerate/.test(action)) return 'chip tone-warning';
    return 'chip tone-neutral';
  }

  open(a: AuditLog): void {
    this.dialog.open(AuditDetailsDialogComponent, { data: a, width: '860px', maxWidth: '96vw', autoFocus: false });
  }
}
