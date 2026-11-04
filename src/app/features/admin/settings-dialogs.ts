import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/api.service';
import { isoDate, parseIsoDate } from '../../core/format';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { DAYS, DayOfWeek, Holiday, WorkSchedule } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { applyServerErrors, serverError } from './form-errors';

const toHms = (t: string) => (t.length === 5 ? `${t}:00` : t);

@Component({
  selector: 'app-schedule-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatSlideToggleModule,
    TranslatePipe, TranslateEnumPipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.settings.editSchedule' : 'admin.settings.addSchedule') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.name' | t }}</mat-label>
            <input matInput formControlName="name" maxlength="100" />
            @if (err('name')) { <mat-error>{{ err('name') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.settings.startTime' | t }}</mat-label>
            <input matInput type="time" formControlName="startTime" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.settings.endTime' | t }}</mat-label>
            <input matInput type="time" formControlName="endTime" />
            @if (err('endTime')) { <mat-error>{{ err('endTime') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.settings.lateGrace' | t }}</mat-label>
            <input matInput type="number" min="0" max="240" formControlName="lateGraceMinutes" />
            <span matTextSuffix>{{ 'common.minutes' | t }}</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.settings.earlyGrace' | t }}</mat-label>
            <input matInput type="number" min="0" max="240" formControlName="earlyLeaveGraceMinutes" />
            <span matTextSuffix>{{ 'common.minutes' | t }}</span>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.settings.halfDayThreshold' | t }}</mat-label>
            <input matInput type="number" min="0" max="24" step="0.5" formControlName="halfDayThresholdHours" />
            <span matTextSuffix>{{ 'common.hours' | t }}</span>
          </mat-form-field>
          <div class="span-2">
            <div class="label">{{ 'admin.settings.weekendDays' | t }}</div>
            <div class="days">
              @for (d of days; track d) {
                <mat-checkbox [checked]="weekend().includes(d)" (change)="toggleDay(d, $event.checked)">{{ d | te: 'enums.day' }}</mat-checkbox>
              }
            </div>
          </div>
          <mat-slide-toggle formControlName="isDefault" [disabled]="!!data?.isDefault">{{ 'admin.settings.defaultSchedule' | t }}</mat-slide-toggle>
        </div>
        @if (timeError()) { <div class="alert alert-danger">{{ 'admin.settings.timeOrder' | t }}</div> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .label { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
    .days { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 10px; }
  `,
})
export class ScheduleDialogComponent {
  readonly data = inject<WorkSchedule | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ScheduleDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly days = DAYS;
  readonly saving = signal(false);
  readonly timeError = signal(false);
  readonly weekend = signal<DayOfWeek[]>(this.data?.weekendDays ?? ['Friday', 'Saturday']);

  readonly form = inject(FormBuilder).group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(100)]],
    startTime: [this.data?.startTime.substring(0, 5) ?? '09:00', Validators.required],
    endTime: [this.data?.endTime.substring(0, 5) ?? '17:00', Validators.required],
    lateGraceMinutes: [this.data?.lateGraceMinutes ?? 15, [Validators.required, Validators.min(0), Validators.max(240)]],
    earlyLeaveGraceMinutes: [this.data?.earlyLeaveGraceMinutes ?? 10, [Validators.required, Validators.min(0), Validators.max(240)]],
    halfDayThresholdHours: [this.data?.halfDayThresholdHours ?? 4, [Validators.required, Validators.min(0), Validators.max(24)]],
    isDefault: [this.data?.isDefault ?? false],
  });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  toggleDay(d: DayOfWeek, on: boolean): void {
    this.weekend.update(list => (on ? [...list, d] : list.filter(x => x !== d)));
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.timeError.set(v.endTime! <= v.startTime!);
    if (this.timeError()) return;
    const body = {
      name: v.name!.trim(), startTime: toHms(v.startTime!), endTime: toHms(v.endTime!), lateGraceMinutes: Number(v.lateGraceMinutes),
      earlyLeaveGraceMinutes: Number(v.earlyLeaveGraceMinutes), halfDayThresholdHours: Number(v.halfDayThresholdHours),
      weekendDays: this.weekend(), isDefault: !!v.isDefault || !!this.data?.isDefault,
    };
    this.saving.set(true);
    (this.data ? this.api.updateWorkSchedule(this.data.id, body) : this.api.createWorkSchedule(body)).subscribe({
      next: () => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}

@Component({
  selector: 'app-holiday-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.settings.editHoliday' : 'admin.settings.addHoliday') | t }}</h2>
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
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.dateRange' | t }}</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate formControlName="startDate" [placeholder]="'common.startDate' | t" />
              <input matEndDate formControlName="endDate" [placeholder]="'common.endDate' | t" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
            @if (err('endDate')) { <mat-error>{{ err('endDate') }}</mat-error> }
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.description' | t }}</mat-label>
            <textarea matInput formControlName="description" rows="2" maxlength="500"></textarea>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class HolidayDialogComponent {
  readonly data = inject<Holiday | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<HolidayDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).group({
    name: [this.data?.name ?? '', [Validators.required, Validators.maxLength(150)]],
    nameAr: [this.data?.nameAr ?? ''],
    startDate: [parseIsoDate(this.data?.startDate), Validators.required],
    endDate: [parseIsoDate(this.data?.endDate), Validators.required],
    description: [this.data?.description ?? ''],
  });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = {
      name: v.name!.trim(), nameAr: v.nameAr?.trim() || null, startDate: isoDate(v.startDate)!, endDate: isoDate(v.endDate ?? v.startDate)!,
      description: v.description?.trim() || null,
    };
    this.saving.set(true);
    (this.data ? this.api.updateHoliday(this.data.id, body) : this.api.createHoliday(body)).subscribe({
      next: () => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}
