import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, shortTime } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Holiday, Perm, Settings, TimeZoneItem, WorkSchedule } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent } from '../../shared/ui';
import { applyServerErrors, serverError } from './form-errors';
import { HolidayDialogComponent, ScheduleDialogComponent } from './settings-dialogs';

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule, FormsModule, RouterLink, MatTabsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatButtonModule, MatButtonToggleModule, MatIconModule, MatTableModule, MatTooltipModule, MatAutocompleteModule, PageHeaderComponent,
    LoadingBarComponent, EmptyStateComponent, TranslatePipe, LocalDatePipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);

  readonly canSettings = computed(() => this.auth.hasPermission(Perm.SettingsManage));
  readonly canHolidays = computed(() => this.auth.hasPermission(Perm.HolidaysManage));

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly locating = signal(false);
  readonly lastUpdated = signal<string | null>(null);
  readonly timeZones = signal<TimeZoneItem[]>([]);
  readonly tzFilter = signal('');
  readonly filteredZones = computed(() => {
    const f = this.tzFilter().toLowerCase();
    return this.timeZones().filter(z => !f || z.id.toLowerCase().includes(f) || z.displayName.toLowerCase().includes(f)).slice(0, 80);
  });
  readonly schedules = signal<WorkSchedule[]>([]);
  readonly holidays = signal<Holiday[]>([]);
  readonly year = signal(new Date().getFullYear());
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i);
  readonly scheduleColumns = ['name', 'hours', 'grace', 'weekend', 'employees', 'actions'];
  readonly holidayColumns = ['name', 'dates', 'days', 'description', 'actions'];

  readonly form = inject(FormBuilder).nonNullable.group({
    companyName: ['', [Validators.required, Validators.maxLength(150)]],
    timeZoneId: ['', Validators.required],
    allowMultipleShifts: [false],
    maxShiftsPerDay: [1, [Validators.required, Validators.min(1), Validators.max(5)]],
    taskDeadlineReminderHours: [24, [Validators.required, Validators.min(1), Validators.max(336)]],
    attendanceFinalizeDelayMinutes: [120, [Validators.required, Validators.min(0), Validators.max(1440)]],
    verificationPolicy: ['Any' as 'Any' | 'All'],
    requireVerificationOnCheckOut: [true],
    geofenceEnabled: [false],
    officeLatitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    officeLongitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    geofenceRadiusMeters: [150, [Validators.required, Validators.min(10), Validators.max(10000)]],
    maxLocationAccuracyMeters: [100, [Validators.required, Validators.min(5), Validators.max(5000)]],
    networkCheckEnabled: [false],
    allowedIpRanges: ['' as string | null, Validators.maxLength(4000)],
    qrCodeEnabled: [false],
    qrRotationSeconds: [30, [Validators.required, Validators.min(10), Validators.max(600)]],
  });

  readonly enabledCount = signal(0);

  constructor() {
    if (this.canSettings()) {
      this.loadSettings();
      this.api.timeZones().subscribe(z => this.timeZones.set(z));
      this.loadSchedules();
    }
    if (this.canHolidays()) this.loadHolidays();
    this.form.valueChanges.subscribe(() => this.updateConditionalValidators());
  }

  // ---------------------------------------------------------------- settings

  loadSettings(): void {
    this.loading.set(true);
    this.api.settings().subscribe({
      next: s => {
        this.form.reset({ ...s, allowedIpRanges: s.allowedIpRanges ?? '' }, { emitEvent: false });
        this.tzFilter.set(s.timeZoneId);
        this.lastUpdated.set(s.updatedAt ?? null);
        this.updateConditionalValidators();
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private updateConditionalValidators(): void {
    const v = this.form.getRawValue();
    const lat = this.form.controls.officeLatitude;
    const lng = this.form.controls.officeLongitude;
    const ranges = this.form.controls.allowedIpRanges;
    const req = (on: boolean, base: ReturnType<typeof Validators.min>[]) => (on ? [Validators.required, ...base] : base);
    lat.setValidators(req(v.geofenceEnabled, [Validators.min(-90), Validators.max(90)]));
    lng.setValidators(req(v.geofenceEnabled, [Validators.min(-180), Validators.max(180)]));
    ranges.setValidators(v.networkCheckEnabled ? [Validators.required, Validators.maxLength(4000)] : [Validators.maxLength(4000)]);
    for (const c of [lat, lng, ranges]) c.updateValueAndValidity({ emitEvent: false });
    this.enabledCount.set([v.geofenceEnabled, v.networkCheckEnabled, v.qrCodeEnabled].filter(Boolean).length);
  }

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  tzLabel = (id: string): string => this.timeZones().find(z => z.id === id)?.displayName ?? id;

  pickTimeZone(id: string): void {
    this.form.controls.timeZoneId.setValue(id);
    this.form.controls.timeZoneId.markAsDirty();
  }

  saveSettings(): void {
    if (this.form.controls.timeZoneId.value !== this.tzFilter() && this.timeZones().some(z => z.id === this.tzFilter())) {
      this.form.controls.timeZoneId.setValue(this.tzFilter());
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error(this.i18n.t('admin.settings.fixErrors'));
      return;
    }
    const v = this.form.getRawValue();
    const body: Settings = {
      ...v,
      officeLatitude: v.officeLatitude === null || (v.officeLatitude as unknown) === '' ? null : Number(v.officeLatitude),
      officeLongitude: v.officeLongitude === null || (v.officeLongitude as unknown) === '' ? null : Number(v.officeLongitude),
      maxShiftsPerDay: v.allowMultipleShifts ? Number(v.maxShiftsPerDay) : 1,
      taskDeadlineReminderHours: Number(v.taskDeadlineReminderHours),
      attendanceFinalizeDelayMinutes: Number(v.attendanceFinalizeDelayMinutes),
      geofenceRadiusMeters: Number(v.geofenceRadiusMeters),
      maxLocationAccuracyMeters: Number(v.maxLocationAccuracyMeters),
      qrRotationSeconds: Number(v.qrRotationSeconds),
      allowedIpRanges: v.allowedIpRanges?.trim() || null,
    };
    this.saving.set(true);
    this.api.updateSettings(body).subscribe({
      next: s => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.lastUpdated.set(s.updatedAt ?? null);
        this.toast.success(this.i18n.t('common.saved'));
      },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }

  useMyLocation(): void {
    if (!navigator.geolocation) {
      this.toast.error(this.i18n.t('admin.settings.geoUnsupported'));
      return;
    }
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.locating.set(false);
        this.form.patchValue({
          officeLatitude: Number(pos.coords.latitude.toFixed(6)),
          officeLongitude: Number(pos.coords.longitude.toFixed(6)),
        });
        this.form.markAsDirty();
        this.toast.info(this.i18n.t('admin.settings.locationSet', { accuracy: Math.round(pos.coords.accuracy) }));
      },
      e => {
        this.locating.set(false);
        this.toast.error(this.i18n.t('admin.settings.geoError') + ' ' + e.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  mapUrl(): string | null {
    const { officeLatitude: lat, officeLongitude: lng } = this.form.getRawValue();
    if (lat === null || lng === null) return null;
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  }

  detectIp(): void {
    this.api.myIp().subscribe(({ ip }) => {
      const current = (this.form.controls.allowedIpRanges.value ?? '').trim();
      const entries = current.split(/[\s,;]+/).filter(Boolean);
      if (entries.includes(ip)) {
        this.toast.info(this.i18n.t('admin.settings.ipAlreadyListed', { ip }));
        return;
      }
      this.form.controls.allowedIpRanges.setValue(current ? `${current}\n${ip}` : ip);
      this.form.markAsDirty();
      this.toast.info(this.i18n.t('admin.settings.ipAdded', { ip }));
    });
  }

  regenerateQr(): void {
    this.confirm.ask({
      title: this.i18n.t('admin.settings.regenerateQr'), message: this.i18n.t('admin.settings.regenerateQrConfirm'),
      confirmText: this.i18n.t('admin.settings.regenerate'), danger: true,
    }).pipe(switchMap(() => this.api.regenerateQrSecret())).subscribe(() => this.toast.success(this.i18n.t('admin.settings.qrRegenerated')));
  }

  // ---------------------------------------------------------------- schedules

  loadSchedules(): void {
    this.api.workSchedules().subscribe(s => this.schedules.set(s));
  }

  editSchedule(s?: WorkSchedule): void {
    this.dialog.open(ScheduleDialogComponent, { data: s ?? null, width: '600px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(ok => { if (ok) { this.lookup.invalidate(); this.loadSchedules(); } });
  }

  deleteSchedule(s: WorkSchedule): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'), message: this.i18n.t('common.deleteConfirm', { name: s.name }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteWorkSchedule(s.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.loadSchedules();
    });
  }

  weekendText(s: WorkSchedule): string {
    return s.weekendDays.map(d => this.i18n.enum('enums.day', d)).join(this.i18n.lang() === 'ar' ? 'ØŒ ' : ', ');
  }

  short = shortTime;

  // ---------------------------------------------------------------- holidays

  loadHolidays(): void {
    this.api.holidays(this.year()).subscribe(h => this.holidays.set(h));
  }

  holidayDays(h: Holiday): number {
    return Math.round((new Date(h.endDate).getTime() - new Date(h.startDate).getTime()) / 86400000) + 1;
  }

  holidayName(h: Holiday): string {
    return this.i18n.lang() === 'ar' && h.nameAr ? h.nameAr : h.name;
  }

  editHoliday(h?: Holiday): void {
    this.dialog.open(HolidayDialogComponent, { data: h ?? null, width: '600px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(ok => ok && this.loadHolidays());
  }

  deleteHoliday(h: Holiday): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'), message: this.i18n.t('common.deleteConfirm', { name: h.name }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteHoliday(h.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.loadHolidays();
    });
  }
}

