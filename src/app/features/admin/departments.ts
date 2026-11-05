import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Department, Perm } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent } from '../../shared/ui';
import { applyServerErrors, serverError } from './form-errors';

@Component({
  selector: 'app-department-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.departments.edit' : 'admin.departments.add') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'common.name' | t }}</mat-label>
            <input matInput formControlName="name" maxlength="150" />
            @if (err('name')) { <mat-error>{{ err('name') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.nameAr' | t }}</mat-label>
            <input matInput formControlName="nameAr" maxlength="150" dir="rtl" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.code' | t }}</mat-label>
            <input matInput formControlName="code" maxlength="20" />
            @if (err('code')) { <mat-error>{{ err('code') }}</mat-error> }
            @else if (form.controls.code.hasError('pattern')) { <mat-error>{{ 'admin.employees.codePattern' | t }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.manager' | t }}</mat-label>
            <mat-select formControlName="managerEmployeeId">
              <mat-option [value]="null">{{ 'common.none' | t }}</mat-option>
              @for (e of employees(); track e.id) { <mat-option [value]="e.id">{{ e.name }} ({{ e.code }})</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.description' | t }}</mat-label>
            <textarea matInput formControlName="description" rows="3" maxlength="1000"></textarea>
          </mat-form-field>
          <mat-slide-toggle formControlName="isActive">{{ 'common.active' | t }}</mat-slide-toggle>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class DepartmentDialogComponent {
  readonly data = inject<Department | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DepartmentDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly employees = toSignal(inject(LookupService).employees(), { initialValue: [] });
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    nameAr: [this.data?.nameAr ?? ''],
    code: [this.data?.code ?? '', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    description: [this.data?.description ?? ''],
    managerEmployeeId: [this.data?.managerEmployeeId ?? (null as number | null)],
    isActive: [this.data?.isActive ?? true],
  });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = {
      name: v.name!.trim(), nameAr: v.nameAr?.trim() || null, code: v.code!.trim(), description: v.description?.trim() || null,
      managerEmployeeId: v.managerEmployeeId ?? null, isActive: !!v.isActive,
    };
    this.saving.set(true);
    (this.data ? this.api.updateDepartment(this.data.id, body) : this.api.createDepartment(body)).subscribe({
      next: () => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}

@Component({
  selector: 'app-departments',
  imports: [PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, StatusChipComponent, MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  template: `
    <app-page-header [title]="'admin.departments.title' | t" [subtitle]="'admin.departments.subtitle' | t" icon="domain">
      @if (canManage()) {
        <button mat-flat-button (click)="open()"><mat-icon>add</mat-icon>{{ 'admin.departments.add' | t }}</button>
      }
    </app-page-header>
    <app-loading-bar [loading]="loading()" />

    <div class="dept-grid">
      @for (d of items(); track d.id) {
        <div class="card dept" [class.inactive]="!d.isActive">
          <div class="dept__head">
            <div class="dept__icon"><mat-icon>domain</mat-icon></div>
            <div class="dept__title">
              <strong>{{ displayName(d) }}</strong>
              <span class="muted">{{ d.code }}@if (d.nameAr && lang() !== 'ar') { · {{ d.nameAr }} }</span>
            </div>
            @if (canManage()) {
              <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu" xPosition="before">
                <button mat-menu-item (click)="open(d)"><mat-icon>edit</mat-icon>{{ 'common.edit' | t }}</button>
                <button mat-menu-item (click)="remove(d)"><mat-icon>delete</mat-icon>{{ 'common.delete' | t }}</button>
              </mat-menu>
            }
          </div>
          @if (d.description) { <p class="dept__desc">{{ d.description }}</p> }
          <div class="dept__meta">
            <div><mat-icon>person</mat-icon>{{ d.managerName || ('admin.departments.noManager' | t) }}</div>
          </div>
          <div class="dept__stats">
            <button mat-button (click)="employees(d)"><mat-icon>badge</mat-icon>{{ d.employeeCount }} {{ 'admin.departments.employees' | t }}</button>
            <button mat-button (click)="teams(d)"><mat-icon>groups</mat-icon>{{ d.teamCount }} {{ 'admin.departments.teams' | t }}</button>
            <span class="spacer"></span>
            <app-status-chip [value]="'' + d.isActive" [tone]="d.isActive ? 'success' : 'neutral'" />
          </div>
        </div>
      }
    </div>
    @if (!loading() && items().length === 0) { <div class="card"><app-empty-state icon="domain" [message]="'common.noData' | t" /></div> }
  `,
  styles: `
    .dept-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .dept { display: flex; flex-direction: column; gap: 10px; &.inactive { opacity: .65; } }
    .dept__head { display: flex; align-items: center; gap: 12px; }
    .dept__icon { width: 42px; height: 42px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex: none; }
    .dept__title { flex: 1; min-width: 0; display: flex; flex-direction: column; strong { font-size: 15.5px; } span { font-size: 12.5px; } }
    .dept__desc { margin: 0; font-size: 13px; color: var(--text-muted); }
    .dept__meta div { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted);
      mat-icon { font-size: 18px; width: 18px; height: 18px; } }
    .dept__stats { display: flex; align-items: center; gap: 4px; border-top: 1px solid var(--border); padding-top: 8px; }
  `,
})
export class DepartmentsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);
  private readonly router = inject(Router);

  readonly items = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly lang = this.i18n.lang;
  readonly canManage = computed(() => this.auth.hasPermission(Perm.DepartmentsManage));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.departments().subscribe({
      next: d => { this.items.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  displayName(d: Department): string {
    return this.lang() === 'ar' && d.nameAr ? d.nameAr : d.name;
  }

  open(d?: Department): void {
    this.dialog.open(DepartmentDialogComponent, { data: d ?? null, width: '640px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(ok => { if (ok) { this.lookup.invalidate(); this.load(); } });
  }

  remove(d: Department): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'), message: this.i18n.t('common.deleteConfirm', { name: d.name }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteDepartment(d.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.load();
    });
  }

  employees(d: Department): void {
    this.router.navigate(['/admin/employees'], { queryParams: { departmentId: d.id } });
  }

  teams(d: Department): void {
    this.router.navigate(['/admin/teams'], { queryParams: { departmentId: d.id } });
  }
}
