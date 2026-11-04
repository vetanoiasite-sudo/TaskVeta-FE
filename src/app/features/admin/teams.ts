import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Perm, Team, TeamDetails } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  AvatarComponent, ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent,
} from '../../shared/ui';
import { applyServerErrors, serverError } from './form-errors';

// ---------------------------------------------------------------- create / edit dialog

@Component({
  selector: 'app-team-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data ? 'admin.teams.edit' : 'admin.teams.add') | t }}</h2>
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
            <mat-label>{{ 'common.department' | t }}</mat-label>
            <mat-select formControlName="departmentId">
              @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
            </mat-select>
            @if (err('departmentId')) { <mat-error>{{ err('departmentId') }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'admin.teams.leader' | t }}</mat-label>
            <mat-select formControlName="leaderEmployeeId">
              <mat-option [value]="null">{{ 'common.none' | t }}</mat-option>
              @for (e of employees(); track e.id) { <mat-option [value]="e.id">{{ e.name }} ({{ e.code }})</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.members' | t }}</mat-label>
            <mat-select formControlName="memberEmployeeIds" multiple>
              @for (e of employees(); track e.id) { <mat-option [value]="e.id">{{ e.name }} ({{ e.code }})</mat-option> }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="span-2">
            <mat-label>{{ 'common.description' | t }}</mat-label>
            <textarea matInput formControlName="description" rows="2" maxlength="1000"></textarea>
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
export class TeamDialogComponent {
  readonly data = inject<TeamDetails | null>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<TeamDialogComponent>);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);
  readonly departments = toSignal(this.lookup.departments(), { initialValue: [] });
  readonly employees = toSignal(this.lookup.employees(), { initialValue: [] });
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).group({
    name: [this.data?.team.name ?? '', [Validators.required, Validators.maxLength(150)]],
    nameAr: [this.data?.team.nameAr ?? ''],
    departmentId: [this.data?.team.departmentId ?? (null as number | null), Validators.required],
    leaderEmployeeId: [this.data?.team.leaderEmployeeId ?? (null as number | null)],
    memberEmployeeIds: [this.data?.members.map(m => m.employeeId) ?? ([] as number[])],
    description: [this.data?.team.description ?? ''],
    isActive: [this.data?.team.isActive ?? true],
  });

  err(key: string): string | null {
    return serverError(this.form, key);
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = {
      name: v.name!.trim(), nameAr: v.nameAr?.trim() || null, departmentId: v.departmentId!, leaderEmployeeId: v.leaderEmployeeId ?? null,
      memberEmployeeIds: v.memberEmployeeIds ?? [], description: v.description?.trim() || null, isActive: !!v.isActive,
    };
    this.saving.set(true);
    (this.data ? this.api.updateTeam(this.data.team.id, body) : this.api.createTeam(body)).subscribe({
      next: () => { this.toast.success(this.i18n.t('common.saved')); this.lookup.invalidate(); this.ref.close(true); },
      error: err => { this.saving.set(false); applyServerErrors(this.form, err); },
    });
  }
}

// ---------------------------------------------------------------- members dialog

@Component({
  selector: 'app-team-members-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatTooltipModule, FormsModule,
    TranslatePipe, LocalDatePipe, AvatarComponent, EmptyStateComponent],
  template: `
    <h2 mat-dialog-title>{{ details()?.team?.name }} — {{ 'common.members' | t }}</h2>
    <mat-dialog-content>
      @if (details(); as d) {
        <p class="muted">{{ d.team.departmentName }} · {{ 'admin.teams.leader' | t }}: {{ d.team.leaderName || '—' }}</p>
        @if (canManage) {
          <div class="row add-row">
            <mat-form-field class="grow">
              <mat-label>{{ 'admin.teams.addMember' | t }}</mat-label>
              <mat-select [(ngModel)]="selected">
                @for (e of candidates(); track e.id) { <mat-option [value]="e.id">{{ e.name }} ({{ e.code }})</mat-option> }
              </mat-select>
            </mat-form-field>
            <button mat-flat-button [disabled]="!selected" (click)="add()"><mat-icon>person_add</mat-icon>{{ 'common.add' | t }}</button>
          </div>
        }
        @for (m of d.members; track m.employeeId) {
          <div class="member">
            <app-avatar [name]="m.fullName" [size]="34" />
            <div class="member__text">
              <strong>{{ m.fullName }}</strong>
              <span class="muted">{{ m.employeeCode }} · {{ m.jobTitle || '—' }} · {{ 'admin.teams.joined' | t }} {{ m.joinedOn | ldate }}</span>
            </div>
            @if (canManage) {
              <button mat-icon-button [matTooltip]="'admin.teams.removeMember' | t" (click)="remove(m.employeeId)"><mat-icon>person_remove</mat-icon></button>
            }
          </div>
        } @empty {
          <app-empty-state icon="group_off" [message]="'admin.teams.noMembers' | t" />
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button [mat-dialog-close]="changed">{{ 'common.close' | t }}</button></mat-dialog-actions>
  `,
  styles: `
    .add-row { align-items: center; .grow { flex: 1; } }
    .member { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .member__text { flex: 1; display: flex; flex-direction: column; span { font-size: 12.5px; } }
  `,
})
export class TeamMembersDialogComponent {
  private readonly api = inject(ApiService);
  private readonly data = inject<{ id: number; canManage: boolean }>(MAT_DIALOG_DATA);
  readonly employees = toSignal(inject(LookupService).employees(), { initialValue: [] });
  readonly details = signal<TeamDetails | null>(null);
  readonly canManage = this.data.canManage;
  readonly candidates = computed(() => {
    const ids = new Set(this.details()?.members.map(m => m.employeeId) ?? []);
    return this.employees().filter(e => !ids.has(e.id));
  });
  selected: number | null = null;
  changed = false;

  constructor() {
    this.load();
  }

  load(): void {
    this.api.team(this.data.id).subscribe(d => this.details.set(d));
  }

  add(): void {
    if (!this.selected) return;
    this.api.addTeamMember(this.data.id, this.selected).subscribe(() => { this.selected = null; this.changed = true; this.load(); });
  }

  remove(employeeId: number): void {
    this.api.removeTeamMember(this.data.id, employeeId).subscribe(() => { this.changed = true; this.load(); });
  }
}

// ---------------------------------------------------------------- page

@Component({
  selector: 'app-teams',
  imports: [PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, StatusChipComponent, MatTableModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatSelectModule, MatTooltipModule, FormsModule, TranslatePipe],
  template: `
    <app-page-header [title]="'admin.teams.title' | t" [subtitle]="'admin.teams.subtitle' | t" icon="groups">
      @if (canManage()) { <button mat-flat-button (click)="edit()"><mat-icon>group_add</mat-icon>{{ 'admin.teams.add' | t }}</button> }
    </app-page-header>

    <div class="filters">
      <mat-form-field>
        <mat-label>{{ 'common.department' | t }}</mat-label>
        <mat-select [ngModel]="departmentId()" (ngModelChange)="departmentId.set($event); load()">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <div class="table-card">
      <app-loading-bar [loading]="loading()" />
      <div class="table-scroll">
        <table mat-table [dataSource]="items()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.name' | t }}</th>
            <td mat-cell *matCellDef="let t">
              <span class="cell-strong">{{ lang() === 'ar' && t.nameAr ? t.nameAr : t.name }}</span>
              @if (t.description) { <span class="cell-sub">{{ t.description }}</span> }
            </td>
          </ng-container>
          <ng-container matColumnDef="department">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.department' | t }}</th>
            <td mat-cell *matCellDef="let t">{{ t.departmentName }}</td>
          </ng-container>
          <ng-container matColumnDef="leader">
            <th mat-header-cell *matHeaderCellDef>{{ 'admin.teams.leader' | t }}</th>
            <td mat-cell *matCellDef="let t">{{ t.leaderName || '—' }}</td>
          </ng-container>
          <ng-container matColumnDef="members">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.members' | t }}</th>
            <td mat-cell *matCellDef="let t"><button mat-stroked-button (click)="members(t)"><mat-icon>group</mat-icon>{{ t.memberCount }}</button></td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>{{ 'common.status' | t }}</th>
            <td mat-cell *matCellDef="let t"><app-status-chip [value]="'' + t.isActive" [tone]="t.isActive ? 'success' : 'neutral'" /></td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let t" class="actions-cell">
              @if (canManage()) {
                <button mat-icon-button [matTooltip]="'common.edit' | t" (click)="edit(t)"><mat-icon>edit</mat-icon></button>
                <button mat-icon-button [matTooltip]="'common.delete' | t" (click)="remove(t)"><mat-icon>delete_outline</mat-icon></button>
              }
            </td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      </div>
      @if (!loading() && items().length === 0) { <app-empty-state icon="groups" [message]="'common.noData' | t" /> }
    </div>
  `,
})
export class TeamsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);

  readonly columns = ['name', 'department', 'leader', 'members', 'status', 'actions'];
  readonly items = signal<Team[]>([]);
  readonly loading = signal(false);
  readonly lang = this.i18n.lang;
  readonly departmentId = signal<number | null>(null);
  readonly departments = toSignal(this.lookup.departments(), { initialValue: [] });
  readonly canManage = computed(() => this.auth.hasPermission(Perm.TeamsManage));

  constructor() {
    const dept = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('departmentId'));
    if (dept) this.departmentId.set(dept);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.teams(this.departmentId()).subscribe({
      next: t => { this.items.set(t); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  edit(t?: Team): void {
    const open = (data: TeamDetails | null) =>
      this.dialog.open(TeamDialogComponent, { data, width: '680px', maxWidth: '96vw', autoFocus: false })
        .afterClosed().subscribe(ok => ok && this.load());
    if (t) this.api.team(t.id).subscribe(d => open(d));
    else open(null);
  }

  members(t: Team): void {
    this.dialog.open(TeamMembersDialogComponent, { data: { id: t.id, canManage: this.canManage() }, width: '560px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(changed => { if (changed) { this.lookup.invalidate(); this.load(); } });
  }

  remove(t: Team): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'), message: this.i18n.t('common.deleteConfirm', { name: t.name }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteTeam(t.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.load();
    });
  }
}
