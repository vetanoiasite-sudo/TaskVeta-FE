import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Observable, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Role, Roles, User } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  AvatarComponent, ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent, debounce,
} from '../../shared/ui';
import { applyServerErrors, serverError } from './form-errors';

const ALL_ROLES = [Roles.SuperAdmin, Roles.Admin, Roles.Manager, Roles.Employee];
const PASSWORD_VALIDATORS = [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)];

// ---------------------------------------------------------------- create / edit user dialog

@Component({
  selector: 'app-user-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    TranslatePipe, TranslateEnumPipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.users.edit' : 'admin.users.create') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'admin.users.fullName' | t }}</mat-label>
            <input matInput formControlName="fullName" maxlength="150" />
            @if (err('fullName')) { <mat-error>{{ err('fullName') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'auth.email' | t }}</mat-label>
            <input matInput formControlName="email" type="email" maxlength="256" />
            @if (err('email')) { <mat-error>{{ err('email') }}</mat-error> }
          </mat-form-field>
          @if (data) {
            <mat-form-field>
              <mat-label>{{ 'admin.users.roles' | t }}</mat-label>
              <mat-select formControlName="roles" multiple>
                @for (r of allRoles; track r) { <mat-option [value]="r">{{ r | te: 'enums.role' }}</mat-option> }
              </mat-select>
              @if (err('roles')) { <mat-error>{{ err('roles') }}</mat-error> }
            </mat-form-field>
          } @else {
            <mat-form-field>
              <mat-label>{{ 'admin.users.role' | t }}</mat-label>
              <mat-select formControlName="role">
                @for (r of allRoles; track r) { <mat-option [value]="r">{{ r | te: 'enums.role' }}</mat-option> }
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'auth.password' | t }}</mat-label>
              <input matInput formControlName="password" type="password" autocomplete="new-password" />
              <mat-hint>{{ 'auth.passwordHint' | t }}</mat-hint>
              @if (err('password')) { <mat-error>{{ err('password') }}</mat-error> }
            </mat-form-field>
          }
          <mat-form-field [class.span-2]="!data">
            <mat-label>{{ 'admin.users.linkedEmployee' | t }}</mat-label>
            <mat-select formControlName="employeeId">
              <mat-option [value]="null">{{ 'common.none' | t }}</mat-option>
              @for (e of employees(); track e.id) { <mat-option [value]="e.id">{{ e.name }} ({{ e.code }})</mat-option> }
            </mat-select>
          </mat-form-field>
          @if (data) { <mat-slide-toggle formControlName="isActive">{{ 'common.active' | t }}</mat-slide-toggle> }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class UserDialogComponent {
  readonly data = inject<User | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly employees = toSignal(inject(LookupService).employees(), { initialValue: [] });
  readonly allRoles = ALL_ROLES;
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).group({
    fullName: [this.data?.fullName ?? '', [Validators.required, Validators.maxLength(150)]],
    email: [this.data?.email ?? '', [Validators.required, Validators.email]],
    roles: [this.data?.roles ?? ([] as string[])],
    role: [Roles.Employee as string],
    password: ['', this.data ? [] : PASSWORD_VALIDATORS],
    employeeId: [this.data?.employeeId ?? (null as number | null)],
    isActive: [this.data?.isActive ?? true],
  });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    if (this.data && !(v.roles ?? []).length) {
      this.form.controls.roles.setErrors({ server: this.i18n.t('admin.users.roleRequired') });
      return;
    }
    const request: Observable<unknown> = this.data
      ? this.api.updateUser(this.data.id, {
          fullName: v.fullName!.trim(), email: v.email!.trim(), roles: v.roles ?? [], isActive: !!v.isActive, employeeId: v.employeeId ?? null,
        })
      : this.api.register({ email: v.email!.trim(), fullName: v.fullName!.trim(), password: v.password!, role: v.role!, employeeId: v.employeeId ?? null });
    this.saving.set(true);
    request.subscribe({
      next: () => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}

// ---------------------------------------------------------------- reset password dialog

@Component({
  selector: 'app-reset-password-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'admin.users.resetPassword' | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form-col">
        <p class="muted">{{ 'admin.users.resetPasswordFor' | t: { name: data.fullName } }}</p>
        <mat-form-field>
          <mat-label>{{ 'auth.newPassword' | t }}</mat-label>
          <input matInput formControlName="newPassword" type="password" autocomplete="new-password" />
          <mat-hint>{{ 'auth.passwordHint' | t }}</mat-hint>
          @if (err('newPassword')) { <mat-error>{{ err('newPassword') }}</mat-error> }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ResetPasswordDialogComponent {
  readonly data = inject<User>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ResetPasswordDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly saving = signal(false);
  readonly form = inject(FormBuilder).group({ newPassword: ['', PASSWORD_VALIDATORS] });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    this.saving.set(true);
    this.api.resetPassword(this.data.id, this.form.getRawValue().newPassword!).subscribe({
      next: () => { this.toast.success(this.i18n.t('admin.users.passwordReset')); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}

// ---------------------------------------------------------------- page

@Component({
  selector: 'app-users',
  imports: [PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, StatusChipComponent, AvatarComponent, MatTabsModule, MatTableModule,
    MatPaginatorModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatMenuModule, FormsModule,
    TranslatePipe, TranslateEnumPipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'admin.users.title' | t" [subtitle]="'admin.users.subtitle' | t" icon="manage_accounts">
      <button mat-flat-button (click)="openUser()"><mat-icon>person_add</mat-icon>{{ 'admin.users.create' | t }}</button>
    </app-page-header>

    <mat-tab-group animationDuration="150ms" (selectedTabChange)="$event.index === 1 && loadRoles()">
      <mat-tab [label]="'admin.users.usersTab' | t">
        <div class="tab-body">
          <div class="filters">
            <mat-form-field class="wide">
              <mat-label>{{ 'common.search' | t }}</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [ngModel]="search()" (ngModelChange)="search.set($event); searchLater()" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'admin.users.role' | t }}</mat-label>
              <mat-select [ngModel]="role()" (ngModelChange)="role.set($event); reload()">
                <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
                @for (r of allRoles; track r) { <mat-option [value]="r">{{ r | te: 'enums.role' }}</mat-option> }
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
          </div>

          <div class="table-card">
            <app-loading-bar [loading]="loading()" />
            <div class="table-scroll">
              <table mat-table [dataSource]="items()">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.name' | t }}</th>
                  <td mat-cell *matCellDef="let u">
                    <div class="person">
                      <app-avatar [name]="u.fullName" [size]="34" />
                      <div><span class="cell-strong">{{ u.fullName }}</span><span class="cell-sub">{{ u.email }}</span></div>
                    </div>
                  </td>
                </ng-container>
                <ng-container matColumnDef="roles">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.roles' | t }}</th>
                  <td mat-cell *matCellDef="let u">
                    @for (r of u.roles; track r) { <span class="chip role-chip" [class]="'role-' + r">{{ r | te: 'enums.role' }}</span> }
                  </td>
                </ng-container>
                <ng-container matColumnDef="employee">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.employeeCode' | t }}</th>
                  <td mat-cell *matCellDef="let u">{{ u.employeeCode || '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="lastLogin">
                  <th mat-header-cell *matHeaderCellDef>{{ 'admin.users.lastLogin' | t }}</th>
                  <td mat-cell *matCellDef="let u">{{ u.lastLoginAt ? (u.lastLoginAt | ldate: 'datetime') : ('admin.users.never' | t) }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | t }}</th>
                  <td mat-cell *matCellDef="let u">
                    <app-status-chip [value]="'' + u.isActive" [tone]="u.isActive ? 'success' : 'neutral'" />
                    @if (u.isLockedOut) { <span class="chip tone-danger locked"><mat-icon>lock</mat-icon>{{ 'admin.users.locked' | t }}</span> }
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let u" class="actions-cell">
                    <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #menu="matMenu" xPosition="before">
                      <button mat-menu-item (click)="openUser(u)"><mat-icon>edit</mat-icon>{{ 'common.edit' | t }}</button>
                      <button mat-menu-item (click)="resetPassword(u)"><mat-icon>password</mat-icon>{{ 'admin.users.resetPassword' | t }}</button>
                      @if (u.isLockedOut) {
                        <button mat-menu-item (click)="unlock(u)"><mat-icon>lock_open</mat-icon>{{ 'admin.users.unlock' | t }}</button>
                      }
                      @if (u.id !== currentUserId) {
                        <button mat-menu-item (click)="remove(u)"><mat-icon>delete</mat-icon>{{ 'common.delete' | t }}</button>
                      }
                    </mat-menu>
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="columns"></tr>
                <tr mat-row *matRowDef="let row; columns: columns"></tr>
              </table>
            </div>
            @if (!loading() && items().length === 0) { <app-empty-state icon="manage_accounts" [message]="'common.noData' | t" /> }
            <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50]" (page)="onPage($event)" />
          </div>
        </div>
      </mat-tab>

      <mat-tab [label]="'admin.users.rolesTab' | t">
        <div class="tab-body">
          <p class="muted">{{ 'admin.users.rolesHint' | t }}</p>
          <div class="grid grid-2">
            @for (r of roles(); track r.id) {
              <div class="card">
                <h3 class="card__title">
                  <span>{{ r.name | te: 'enums.role' }}</span>
                  <span class="chip tone-primary">{{ 'admin.users.userCount' | t: { count: r.userCount } }}</span>
                </h3>
                <p class="muted role-desc">{{ ('admin.roleDescriptions.' + r.name) | t }}</p>
                <div class="perms">
                  @for (p of r.permissions; track p) {
                    <span class="perm"><mat-icon>check_circle</mat-icon>{{ permLabel(p) }}</span>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    .tab-body { padding-top: 16px; }
    .person { display: flex; align-items: center; gap: 10px; }
    .role-chip { margin-inline-end: 4px; margin-block: 2px; --tone: var(--neutral); --tone-bg: var(--neutral-soft); }
    .role-SuperAdmin { --tone: var(--primary); --tone-bg: var(--primary-soft); }
    .role-Admin { --tone: var(--accent); --tone-bg: var(--accent-soft); }
    .role-Manager { --tone: var(--info); --tone-bg: var(--info-soft); }
    .locked { margin-inline-start: 6px; mat-icon { font-size: 14px; width: 14px; height: 14px; } }
    .role-desc { margin-top: -6px; font-size: 13px; }
    .perms { display: flex; flex-wrap: wrap; gap: 6px 14px; }
    .perm { display: inline-flex; align-items: center; gap: 4px; font-size: 13px;
      mat-icon { color: var(--success); font-size: 16px; width: 16px; height: 16px; } }
  `,
})
export class UsersComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);
  readonly currentUserId = inject(AuthService).user()?.id;

  readonly allRoles = ALL_ROLES;
  readonly columns = ['name', 'roles', 'employee', 'lastLogin', 'status', 'actions'];
  readonly items = signal<User[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly role = signal<string | null>(null);
  readonly isActive = signal<boolean | null>(null);
  readonly roles = signal<Role[]>([]);
  readonly searchLater = debounce(() => this.reload());

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.users({
      page: this.page(), pageSize: this.pageSize(), search: this.search().trim() || undefined, role: this.role(), isActive: this.isActive(),
    }).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  loadRoles(): void {
    this.api.roles().subscribe(r => this.roles.set(r));
  }

  permLabel(p: string): string {
    const key = 'admin.permissions.' + p.replaceAll('.', '_');
    const t = this.i18n.t(key);
    return t === key ? p : t;
  }

  openUser(u?: User): void {
    this.dialog.open(UserDialogComponent, { data: u ?? null, width: '640px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(ok => { if (ok) { this.lookup.invalidate(); this.load(); } });
  }

  resetPassword(u: User): void {
    this.dialog.open(ResetPasswordDialogComponent, { data: u, width: '420px', autoFocus: false });
  }

  unlock(u: User): void {
    this.api.unlockUser(u.id).subscribe(() => { this.toast.success(this.i18n.t('admin.users.unlocked')); this.load(); });
  }

  remove(u: User): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'), message: this.i18n.t('admin.users.deleteMessage', { name: u.fullName }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteUser(u.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.load();
    });
  }
}

