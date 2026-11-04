import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Employee, EmployeeQuery, Perm } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  AvatarComponent, ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent, debounce,
} from '../../shared/ui';
import { EmployeeDialogComponent } from './employee-dialog';

@Component({
  selector: 'app-employees',
  imports: [
    FormsModule, MatTableModule, MatSortModule, MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatMenuModule, MatTooltipModule, PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, StatusChipComponent,
    AvatarComponent, TranslatePipe, LocalDatePipe,
  ],
  template: `
    <app-page-header [title]="'admin.employees.title' | t" [subtitle]="'admin.employees.subtitle' | t" icon="badge">
      @if (canManage()) {
        <button mat-flat-button (click)="openDialog()"><mat-icon>person_add</mat-icon>{{ 'admin.employees.add' | t }}</button>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.search' | t }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="search()" (ngModelChange)="onSearch($event)" [placeholder]="'admin.employees.searchHint' | t" />
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
        <mat-label>{{ 'common.status' | t }}</mat-label>
        <mat-select [ngModel]="isActive()" (ngModelChange)="isActive.set($event); reload()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          <mat-option [value]="true">{{ 'common.active' | t }}</mat-option>
          <mat-option [value]="false">{{ 'common.inactive' | t }}</mat-option>
        </mat-select>
      </mat-form-field>
      <span class="spacer"></span>
      <button mat-button (click)="resetFilters()"><mat-icon>filter_alt_off</mat-icon>{{ 'common.reset' | t }}</button>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="items()" matSort (matSortChange)="onSort($event)" [matSortActive]="sort().active" [matSortDirection]="sort().direction">
          <ng-container matColumnDef="employeeCode">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.code' | t }}</th>
            <td mat-cell *matCellDef="let e" class="cell-strong">{{ e.employeeCode }}</td>
          </ng-container>
          <ng-container matColumnDef="fullName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.name' | t }}</th>
            <td mat-cell *matCellDef="let e">
              <div class="person">
                <app-avatar [name]="e.fullName" [size]="34" />
                <div><span class="cell-strong">{{ e.fullName }}</span><span class="cell-sub">{{ e.email }}</span></div>
              </div>
            </td>
          </ng-container>
          <ng-container matColumnDef="departmentName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.department' | t }}</th>
            <td mat-cell *matCellDef="let e">{{ e.departmentName }}</td>
          </ng-container>
          <ng-container matColumnDef="teams">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.employees.teams' | t }}</th>
            <td mat-cell *matCellDef="let e">
              @for (t of e.teams; track t.id) { <span class="chip tone-neutral team-chip">{{ t.name }}</span> } @empty { <span class="muted">—</span> }
            </td>
          </ng-container>
          <ng-container matColumnDef="jobTitle">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'admin.employees.jobTitle' | t }}</th>
            <td mat-cell *matCellDef="let e">{{ e.jobTitle || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="hireDate">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'admin.employees.hireDate' | t }}</th>
            <td mat-cell *matCellDef="let e">{{ e.hireDate | ldate }}</td>
          </ng-container>
          <ng-container matColumnDef="account">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.employees.account' | t }}</th>
            <td mat-cell *matCellDef="let e">
              @if (e.userId) {
                <mat-icon class="ok" [matTooltip]="'admin.employees.hasAccount' | t">verified_user</mat-icon>
              } @else {
                <mat-icon class="muted" [matTooltip]="'admin.employees.noAccount' | t">no_accounts</mat-icon>
              }
              @if (e.allowRemoteCheckIn) { <mat-icon class="muted" [matTooltip]="'admin.employees.remoteAllowed' | t">home_work</mat-icon> }
            </td>
          </ng-container>
          <ng-container matColumnDef="isActive">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let e"><app-status-chip [value]="'' + e.isActive" [tone]="e.isActive ? 'success' : 'neutral'" /></td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let e" class="actions-cell">
              <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'common.actions' | t"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu" xPosition="before">
                <button mat-menu-item (click)="history(e)"><mat-icon>history</mat-icon>{{ 'admin.employees.attendanceHistory' | t }}</button>
                @if (canManage()) {
                  <button mat-menu-item (click)="openDialog(e)"><mat-icon>edit</mat-icon>{{ 'common.edit' | t }}</button>
                  <button mat-menu-item (click)="remove(e)"><mat-icon class="danger">delete</mat-icon>{{ 'common.delete' | t }}</button>
                }
              </mat-menu>
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
      @if (!loading() && items().length === 0) { <app-empty-state icon="badge" [message]="'common.noData' | t" /> }
      <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50, 100]" (page)="onPage($event)" />
    </div>
  `,
  styles: `
    .person { display: flex; align-items: center; gap: 10px; }
    .team-chip { margin-inline-end: 4px; margin-block: 2px; }
    .ok { color: var(--success); }
    .danger { color: var(--danger); }
    mat-icon { vertical-align: middle; }
  `,
})
export class EmployeesComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly lookup = inject(LookupService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly columns = ['employeeCode', 'fullName', 'departmentName', 'teams', 'jobTitle', 'hireDate', 'account', 'isActive', 'actions'];
  readonly items = signal<Employee[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly departmentId = signal<number | null>(null);
  readonly teamId = signal<number | null>(null);
  readonly isActive = signal<boolean | null>(null);
  readonly sort = signal<Sort>({ active: 'employeeCode', direction: 'asc' });
  readonly canManage = computed(() => this.auth.hasPermission(Perm.EmployeesManage));

  readonly departments = toSignal(this.lookup.departments(), { initialValue: [] });
  private readonly deptForTeams = signal<number | null>(null);
  readonly teams = signal<{ id: number; name: string }[]>([]);

  private readonly searchDebounced = debounce(() => this.reload());

  constructor() {
    const dept = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('departmentId'));
    if (dept) this.departmentId.set(dept);
    this.loadTeams();
    this.load();
  }

  load(): void {
    const q: EmployeeQuery = {
      page: this.page(), pageSize: this.pageSize(), search: this.search().trim() || undefined,
      departmentId: this.departmentId(), teamId: this.teamId(), isActive: this.isActive(),
      sortBy: this.sort().direction ? this.sort().active : undefined, sortDir: this.sort().direction || undefined,
    };
    this.loading.set(true);
    this.api.employees(q).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  reload(): void {
    if (this.deptForTeams() !== this.departmentId()) this.loadTeams();
    this.page.set(1);
    this.load();
  }

  private loadTeams(): void {
    this.deptForTeams.set(this.departmentId());
    this.lookup.teamsFor(this.departmentId()).subscribe(t => this.teams.set(t));
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.searchDebounced();
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

  resetFilters(): void {
    this.search.set('');
    this.departmentId.set(null);
    this.teamId.set(null);
    this.isActive.set(null);
    this.reload();
  }

  history(e: Employee): void {
    this.router.navigate(['/attendance/history'], { queryParams: { employeeId: e.id } });
  }

  openDialog(employee?: Employee): void {
    this.dialog.open(EmployeeDialogComponent, { data: employee ?? null, width: '760px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(saved => {
        if (saved) {
          this.lookup.invalidate();
          this.load();
        }
      });
  }

  remove(e: Employee): void {
    this.confirm.ask({
      title: this.i18n.t('admin.employees.deleteTitle'),
      message: this.i18n.t('admin.employees.deleteMessage', { name: e.fullName }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteEmployee(e.id)), switchMap(() => of(true))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.load();
    });
  }
}

