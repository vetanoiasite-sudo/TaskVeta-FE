import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, WallTimePipe, isoDate, minutesToText, wallTime } from '../../core/format';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { ATTENDANCE_STATUSES, AttendanceDetails, AttendanceStatus, LeaveType, Perm } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { StatusChipComponent } from '../../shared/ui';

// ---------------------------------------------------------------- correction / manual record

export interface CorrectionData {
  recordId: number | null;
  employeeId: number;
  employeeName: string;
  date: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus | null;
  notes?: string | null;
}

@Component({
  selector: 'app-attendance-correction-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatIconModule, TranslatePipe, TranslateEnumPipe, LocalDatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data.recordId ? 'attendance.correct.title' : 'attendance.correct.manualTitle') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="alert alert-info"><mat-icon>person</mat-icon>{{ data.employeeName }} · {{ data.date | ldate }}</div>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'attendance.checkIn' | t }}</mat-label>
            <input matInput type="time" formControlName="checkInTime" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'attendance.checkOut' | t }}</mat-label>
            <input matInput type="time" formControlName="checkOutTime" />
          </mat-form-field>
          <mat-checkbox class="span-2" formControlName="checkOutNextDay">{{ 'attendance.correct.nextDay' | t }}</mat-checkbox>
          <mat-form-field class="span-2">
            <mat-label>{{ 'attendance.correct.statusOverride' | t }}</mat-label>
            <mat-select formControlName="status">
              <mat-option [value]="null">{{ 'attendance.correct.autoStatus' | t }}</mat-option>
              @for (s of statuses; track s) { <mat-option [value]="s">{{ s | te: 'enums.status' }}</mat-option> }
            </mat-select>
            <mat-hint>{{ 'attendance.correct.statusHint' | t }}</mat-hint>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.notes' | t }}</mat-label>
            <input matInput formControlName="notes" maxlength="500" />
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'attendance.correct.reason' | t }} *</mat-label>
            <textarea matInput rows="2" formControlName="reason" maxlength="500"></textarea>
            <mat-hint>{{ 'attendance.correct.reasonHint' | t }}</mat-hint>
          </mat-form-field>
        </div>
        @if (timeError()) { <div class="alert alert-warning">{{ 'attendance.correct.timeOrder' | t }}</div> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class CorrectionDialogComponent {
  readonly data = inject<CorrectionData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CorrectionDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly statuses = ATTENDANCE_STATUSES;
  readonly saving = signal(false);
  readonly timeError = signal(false);

  readonly form = inject(FormBuilder).group({
    checkInTime: [this.toInput(this.data.checkInTime)],
    checkOutTime: [this.toInput(this.data.checkOutTime)],
    checkOutNextDay: [false],
    status: [null as AttendanceStatus | null],
    notes: [this.data.notes ?? ''],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
  });

  private toInput(iso: string | null | undefined): string {
    const t = wallTime(iso);
    return t === '—' ? '' : t;
  }

  save(): void {
    const v = this.form.getRawValue();
    const cin = v.checkInTime || null;
    const cout = v.checkOutTime || null;
    this.timeError.set(!!cin && !!cout && !v.checkOutNextDay && cout <= cin || (!cin && !!cout));
    if (this.timeError()) return;
    if (!this.data.recordId && !cin && !v.status) { this.timeError.set(true); return; }
    const body = {
      checkInTime: cin ? `${cin}:00` : null,
      checkOutTime: cout ? `${cout}:00` : null,
      checkOutNextDay: !!v.checkOutNextDay,
      status: v.status ?? null,
      notes: v.notes?.trim() || null,
      reason: (v.reason ?? '').trim(),
    };
    this.saving.set(true);
    const req = this.data.recordId
      ? this.api.correctAttendance(this.data.recordId, body)
      : this.api.createManualAttendance({ ...body, employeeId: this.data.employeeId, attendanceDate: this.data.date });
    req.subscribe({
      next: r => { this.toast.success(this.i18n.t('common.saved')); this.ref.close(r); },
      error: () => this.saving.set(false),
    });
  }
}

// ---------------------------------------------------------------- record details

@Component({
  selector: 'app-attendance-details-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe, TranslateEnumPipe, LocalDatePipe, WallTimePipe, StatusChipComponent],
  template: `
    <h2 mat-dialog-title>{{ 'attendance.details.title' | t }}</h2>
    <mat-dialog-content>
      @if (details(); as d) {
        <div class="head">
          <div><strong>{{ d.record.employeeName }}</strong><span class="muted"> · {{ d.record.employeeCode }} · {{ d.record.departmentName }}</span></div>
          <app-status-chip [value]="d.record.status" />
        </div>
        <dl class="kv">
          <dt>{{ 'common.date' | t }}</dt><dd>{{ d.record.attendanceDate | ldate }} @if (d.record.shiftNumber > 1) { ({{ 'attendance.shift' | t }} {{ d.record.shiftNumber }}) }</dd>
          <dt>{{ 'attendance.checkIn' | t }}</dt><dd>{{ d.record.checkInTime | wallTime }} · {{ d.record.checkInSource | te: 'enums.source' }}</dd>
          <dt>{{ 'attendance.checkOut' | t }}</dt><dd>{{ d.record.checkOutTime | wallTime }} @if (d.record.missingCheckOut) { <span class="chip tone-danger">{{ 'enums.status.MissingCheckOut' | t }}</span> }</dd>
          <dt>{{ 'attendance.workingHours' | t }}</dt><dd>{{ d.record.workingHours }} {{ 'common.hours' | t }}</dd>
          <dt>{{ 'attendance.late' | t }}</dt><dd>{{ mins(d.record.lateMinutes) }}</dd>
          <dt>{{ 'attendance.earlyLeave' | t }}</dt><dd>{{ mins(d.record.earlyLeaveMinutes) }}</dd>
          <dt>{{ 'attendance.details.verifiedIn' | t }}</dt><dd>{{ methods(d.record.checkInVerification) }}</dd>
          <dt>{{ 'attendance.details.verifiedOut' | t }}</dt><dd>{{ methods(d.record.checkOutVerification) }}</dd>
          @if (d.checkInIp) { <dt>{{ 'attendance.details.ipIn' | t }}</dt><dd dir="ltr">{{ d.checkInIp }}</dd> }
          @if (d.checkInLatitude !== null) {
            <dt>{{ 'attendance.details.locationIn' | t }}</dt>
            <dd><a [href]="map(d.checkInLatitude, d.checkInLongitude)" target="_blank" rel="noopener" dir="ltr">{{ d.checkInLatitude }}, {{ d.checkInLongitude }}</a></dd>
          }
          @if (d.checkOutIp) { <dt>{{ 'attendance.details.ipOut' | t }}</dt><dd dir="ltr">{{ d.checkOutIp }}</dd> }
          @if (d.checkOutLatitude !== null) {
            <dt>{{ 'attendance.details.locationOut' | t }}</dt>
            <dd><a [href]="map(d.checkOutLatitude, d.checkOutLongitude)" target="_blank" rel="noopener" dir="ltr">{{ d.checkOutLatitude }}, {{ d.checkOutLongitude }}</a></dd>
          }
          @if (d.record.notes) { <dt>{{ 'common.notes' | t }}</dt><dd>{{ d.record.notes }}</dd> }
          @if (d.record.isManuallyEdited) { <dt>{{ 'attendance.details.editedBy' | t }}</dt><dd>{{ d.lastEditedBy ?? '—' }} · {{ d.record.updatedAt | ldate: 'datetime' }}</dd> }
        </dl>
      } @else { <p class="muted">{{ 'common.loading' | t }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (canCorrect && details()) { <button mat-stroked-button (click)="correct()"><mat-icon>edit_calendar</mat-icon>{{ 'attendance.correct.action' | t }}</button> }
      <button mat-flat-button mat-dialog-close>{{ 'common.close' | t }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 12px; }
    .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; margin: 0; dt { color: var(--text-muted); } dd { margin: 0; } }
  `,
})
export class AttendanceDetailsDialogComponent {
  private readonly data = inject<{ id: number }>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AttendanceDetailsDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(I18nService);
  readonly details = signal<AttendanceDetails | null>(null);
  readonly canCorrect = inject(AuthService).hasPermission(Perm.AttendanceCorrect);

  constructor() {
    this.api.attendanceDetails(this.data.id).subscribe(d => this.details.set(d));
  }

  mins(m: number): string { return m ? minutesToText(m) : '—'; }

  methods(v: string): string {
    if (!v || v === 'None') return this.i18n.t('attendance.details.notVerified');
    return v.split(',').map(x => this.i18n.enum('enums.verification', x.trim())).join(' + ');
  }

  map(lat: number | null, lng: number | null): string {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  }

  correct(): void {
    const r = this.details()!.record;
    this.dialog.open(CorrectionDialogComponent, {
      width: '560px',
      data: { recordId: r.id, employeeId: r.employeeId, employeeName: r.employeeName, date: r.attendanceDate,
        checkInTime: r.checkInTime, checkOutTime: r.checkOutTime, status: r.status, notes: r.notes } satisfies CorrectionData,
    }).afterClosed().subscribe(res => { if (res) this.ref.close(true); });
  }
}

// ---------------------------------------------------------------- leave request

@Component({
  selector: 'app-leave-request-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, TranslatePipe, TranslateEnumPipe],
  template: `
    <h2 mat-dialog-title>{{ 'attendance.leave.new' | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form-col">
        <mat-form-field>
          <mat-label>{{ 'attendance.leave.type' | t }}</mat-label>
          <mat-select formControlName="type">
            @for (t of types; track t) { <mat-option [value]="t">{{ t | te: 'enums.leaveType' }}</mat-option> }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'common.dateRange' | t }}</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate formControlName="start" [placeholder]="'common.startDate' | t" />
            <input matEndDate formControlName="end" [placeholder]="'common.endDate' | t" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
          @if (days()) { <mat-hint>{{ days() }} {{ 'common.days' | t }}</mat-hint> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'common.reason' | t }}</mat-label>
          <textarea matInput rows="3" formControlName="reason" maxlength="1000"></textarea>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">{{ 'common.submit' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class LeaveRequestDialogComponent {
  private readonly ref = inject(MatDialogRef<LeaveRequestDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly types: LeaveType[] = ['Annual', 'Sick', 'Unpaid', 'Emergency', 'Other'];
  readonly saving = signal(false);
  private readonly range = signal<{ start: Date | null; end: Date | null }>({ start: null, end: null });
  readonly days = computed(() => {
    const { start, end } = this.range();
    return start && end ? Math.round((end.getTime() - start.getTime()) / 86400000) + 1 : 0;
  });

  readonly form = inject(FormBuilder).group({
    type: ['Annual' as LeaveType, Validators.required],
    start: [null as Date | null, Validators.required],
    end: [null as Date | null, Validators.required],
    reason: [''],
  });

  constructor() {
    this.form.valueChanges.subscribe(v => this.range.set({ start: v.start ?? null, end: v.end ?? null }));
  }

  save(): void {
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api.createLeave({ employeeId: null, type: v.type!, startDate: isoDate(v.start)!, endDate: isoDate(v.end)!, reason: v.reason?.trim() || null })
      .subscribe({
        next: r => { this.toast.success(this.i18n.t('attendance.leave.submitted')); this.ref.close(r); },
        error: () => this.saving.set(false),
      });
  }
}
