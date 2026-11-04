import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { isoDate, parseIsoDate } from '../../core/format';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Employee, Lookup, Perm, Roles } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { applyServerErrors, serverError } from './form-errors';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

@Component({
  selector: 'app-employee-dialog',
  imports: [
    ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatSlideToggleModule, MatCheckboxModule, MatIconModule, TranslatePipe, TranslateEnumPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.employees.edit' : 'admin.employees.add') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field>
            <mat-label>{{ 'common.employeeCode' | t }}</mat-label>
            <input matInput formControlName="employeeCode" maxlength="30" />
            @if (err('employeeCode')) { <mat-error>{{ err('employeeCode') }}</mat-error> }
            @else if (form.controls.employeeCode.hasError('pattern')) { <mat-error>{{ 'admin.employees.codePattern' | t }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.email' | t }}</mat-label>
            <input matInput formControlName="email" type="email" maxlength="256" />
            @if (err('email')) { <mat-error>{{ err('email') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.firstName' | t }}</mat-label>
            <input matInput formControlName="firstName" maxlength="75" />
            @if (err('firstName')) { <mat-error>{{ err('firstName') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.lastName' | t }}</mat-label>
            <input matInput formControlName="lastName" maxlength="75" />
            @if (err('lastName')) { <mat-error>{{ err('lastName') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.phone' | t }}</mat-label>
            <input matInput formControlName="phone" maxlength="30" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.jobTitle' | t }}</mat-label>
            <input matInput formControlName="jobTitle" maxlength="100" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.hireDate' | t }}</mat-label>
            <input matInput [matDatepicker]="hirePicker" formControlName="hireDate" />
            <mat-datepicker-toggle matIconSuffix [for]="hirePicker" />
            <mat-datepicker #hirePicker />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'common.department' | t }}</mat-label>
            <mat-select formControlName="departmentId" (selectionChange)="onDepartment($event.value)">
              @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
            </mat-select>
            @if (err('departmentId')) { <mat-error>{{ err('departmentId') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.workSchedule' | t }}</mat-label>
            <mat-select formControlName="workScheduleId">
              <mat-option [value]="null">{{ 'admin.employees.defaultSchedule' | t }}</mat-option>
              @for (s of schedules(); track s.id) { <mat-option [value]="s.id">{{ s.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.employees.teams' | t }}</mat-label>
            <mat-select formControlName="teamIds" multiple>
              @for (t of teams(); track t.id) { <mat-option [value]="t.id">{{ t.name }}</mat-option> }
            </mat-select>
          </mat-form-field>
          <div class="span-2 toggles">
            <mat-slide-toggle formControlName="allowRemoteCheckIn">{{ 'admin.employees.allowRemote' | t }}</mat-slide-toggle>
            @if (data) { <mat-slide-toggle formControlName="isActive">{{ 'common.active' | t }}</mat-slide-toggle> }
          </div>

          @if (!data) {
            <div class="span-2 account">
              <mat-checkbox formControlName="createAccount">{{ 'admin.employees.createAccount' | t }}</mat-checkbox>
              <p class="muted">{{ 'admin.employees.createAccountHint' | t }}</p>
            </div>
            @if (form.controls.createAccount.value) {
              <mat-form-field>
                <mat-label>{{ 'auth.password' | t }}</mat-label>
                <input matInput formControlName="password" type="password" autocomplete="new-password" />
                <mat-hint>{{ 'auth.passwordHint' | t }}</mat-hint>
                @if (err('password')) { <mat-error>{{ err('password') }}</mat-error> }
              </mat-form-field>
              <mat-form-field>
                <mat-label>{{ 'admin.users.role' | t }}</mat-label>
                <mat-select formControlName="role">
                  @for (r of roleOptions(); track r) { <mat-option [value]="r">{{ r | te: 'enums.role' }}</mat-option> }
                </mat-select>
              </mat-form-field>
            }
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .toggles { display: flex; gap: 24px; flex-wrap: wrap; padding: 8px 0 12px; }
    .account { border-top: 1px solid var(--border); padding-top: 12px; p { margin: 2px 0 8px; font-size: 12.5px; } }
  `,
})
export class EmployeeDialogComponent {
  readonly data = inject<Employee | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmployeeDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly lookup = inject(LookupService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  readonly saving = signal(false);
  readonly departments = toSignal(this.lookup.departments(), { initialValue: [] });
  readonly schedules = toSignal(this.lookup.workSchedules(), { initialValue: [] });
  readonly teams = signal<Lookup[]>([]);
  readonly roleOptions = computed(() =>
    this.auth.hasPermission(Perm.RolesManage) ? [Roles.Employee, Roles.Manager, Roles.Admin, Roles.SuperAdmin] : [Roles.Employee]);

  readonly form = inject(FormBuilder).group({
    employeeCode: [this.data?.employeeCode ?? '', [Validators.required, Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    firstName: [this.data?.firstName ?? '', [Validators.required, Validators.maxLength(75)]],
    lastName: [this.data?.lastName ?? '', [Validators.required, Validators.maxLength(75)]],
    email: [this.data?.email ?? '', [Validators.required, Validators.email]],
    phone: [this.data?.phone ?? ''],
    jobTitle: [this.data?.jobTitle ?? ''],
    hireDate: [this.data ? parseIsoDate(this.data.hireDate) : new Date(), Validators.required],
    departmentId: [this.data?.departmentId ?? (null as number | null), Validators.required],
    workScheduleId: [this.data?.workScheduleId ?? (null as number | null)],
    teamIds: [this.data?.teams.map(t => t.id) ?? ([] as number[])],
    allowRemoteCheckIn: [this.data?.allowRemoteCheckIn ?? false],
    isActive: [this.data?.isActive ?? true],
    createAccount: [false],
    password: [''],
    role: [Roles.Employee as string],
  });

  constructor() {
    if (this.data) this.loadTeams(this.data.departmentId);
    this.form.controls.createAccount.valueChanges.subscribe(on => {
      const pw = this.form.controls.password;
      pw.setValidators(on ? [Validators.required, Validators.minLength(8), Validators.pattern(PASSWORD_PATTERN)] : []);
      pw.updateValueAndValidity();
    });
  }

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  onDepartment(id: number): void {
    this.form.controls.teamIds.setValue([]);
    this.loadTeams(id);
  }

  private loadTeams(departmentId: number): void {
    this.lookup.teamsFor(departmentId).subscribe(t => this.teams.set(t));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const common = {
      employeeCode: v.employeeCode!.trim(), firstName: v.firstName!.trim(), lastName: v.lastName!.trim(), email: v.email!.trim(),
      phone: v.phone?.trim() || null, jobTitle: v.jobTitle?.trim() || null, hireDate: isoDate(v.hireDate)!,
      departmentId: v.departmentId!, workScheduleId: v.workScheduleId ?? null, teamIds: v.teamIds ?? [],
      allowRemoteCheckIn: !!v.allowRemoteCheckIn,
    };
    const request = this.data
      ? this.api.updateEmployee(this.data.id, { ...common, isActive: !!v.isActive })
      : this.api.createEmployee({
          ...common, createAccount: !!v.createAccount, password: v.createAccount ? v.password : null,
          role: v.createAccount ? v.role : null,
        });
    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.toast.success(this.i18n.t('common.saved'));
        this.ref.close(true);
      },
      error: err => {
        this.saving.set(false);
        applyServerErrors(this.form, err);
      },
    });
  }
}
