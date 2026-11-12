import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { isoDate, parseIsoDate } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { PROJECT_STATUSES, Project, ProjectStatus, SaveProject } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { applyServerErrors, serverError } from '../admin/form-errors';

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const s = group.get('startDate')?.value as Date | null;
  const e = group.get('endDate')?.value as Date | null;
  return s && e && e < s ? { endBeforeStart: true } : null;
}

/** Create / edit a project (admins only). Returns the saved project. */
@Component({
  selector: 'app-project-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'projects.edit' : 'projects.add') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'common.name' | t }}</mat-label>
            <input matInput formControlName="name" maxlength="150" />
            @if (form.controls.name.hasError('required')) { <mat-error>{{ 'common.required' | t }}</mat-error> }
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
            @else if (form.controls.code.hasError('required')) { <mat-error>{{ 'common.required' | t }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.status' | t }}</mat-label>
            <mat-select formControlName="status">
              @for (s of statuses; track s) { <mat-option [value]="s">{{ 'enums.status.' + s | t }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.startDate' | t }}</mat-label>
            <input matInput [matDatepicker]="sp" formControlName="startDate" />
            <mat-datepicker-toggle matIconSuffix [for]="sp" />
            <mat-datepicker #sp />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.endDate' | t }}</mat-label>
            <input matInput [matDatepicker]="ep" formControlName="endDate" />
            <mat-datepicker-toggle matIconSuffix [for]="ep" />
            <mat-datepicker #ep />
            @if (err('endDate')) { <mat-error>{{ err('endDate') }}</mat-error> }
          </mat-form-field>
          @if (form.hasError('endBeforeStart')) {
            <div class="alert alert-danger span-2"><mat-icon>error_outline</mat-icon>{{ 'projects.endBeforeStart' | t }}</div>
          }
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.description' | t }}</mat-label>
            <textarea matInput formControlName="description" rows="3" maxlength="2000"></textarea>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ (data ? 'common.save' : 'common.create') | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ProjectDialogComponent {
  readonly data = inject<Project | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ProjectDialogComponent, Project>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly statuses = PROJECT_STATUSES;
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    nameAr: [this.data?.nameAr ?? ''],
    code: [this.data?.code ?? '', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    status: [(this.data?.status ?? 'Planned') as ProjectStatus],
    startDate: [parseIsoDate(this.data?.startDate) as Date | null],
    endDate: [parseIsoDate(this.data?.endDate) as Date | null],
    description: [this.data?.description ?? ''],
  }, { validators: endAfterStart });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body: SaveProject = {
      name: v.name!.trim(), nameAr: v.nameAr?.trim() || null, code: v.code!.trim(), description: v.description?.trim() || null,
      status: v.status!, startDate: isoDate(v.startDate), endDate: isoDate(v.endDate),
    };
    this.saving.set(true);
    (this.data ? this.api.updateProject(this.data.id, body) : this.api.createProject(body)).subscribe({
      next: p => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(p); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}
