import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { SaveTask, TASK_PRIORITIES, TaskDetails, TaskPriority } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { validationErrors } from '../../core/http';
import { combineDateTime, timeOf } from './task-shared';

export interface TaskFormData { task?: TaskDetails; }

function dueAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as Date | null;
  const due = group.get('dueDate')?.value as Date | null;
  if (!start || !due) return null;
  const s = combineDateTime(start, group.get('startTime')?.value);
  const d = combineDateTime(due, group.get('dueTime')?.value);
  return s && d && new Date(d) < new Date(s) ? { dueBeforeStart: true } : null;
}

@Component({
  selector: 'app-task-form-dialog',
  imports: [ReactiveFormsModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatDatepickerModule, MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (isEdit ? 'tasks.form.editTitle' : 'tasks.form.createTitle') | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <div class="form-grid">
          <mat-form-field class="span-2">
            <mat-label>{{ 'tasks.fields.title' | t }}</mat-label>
            <input matInput formControlName="title" maxlength="200" />
            @if (form.controls.title.hasError('required')) { <mat-error>{{ 'common.required' | t }}</mat-error> }
            @if (serverErrors()['title']) { <mat-error>{{ serverErrors()['title'][0] }}</mat-error> }
          </mat-form-field>

          <mat-form-field class="span-2">
            <mat-label>{{ 'tasks.fields.description' | t }}</mat-label>
            <textarea matInput rows="4" formControlName="description" maxlength="4000"></textarea>
            <mat-hint align="end">{{ form.controls.description.value.length }}/4000</mat-hint>
          </mat-form-field>

          <mat-form-field>
            <mat-label>{{ 'tasks.fields.priority' | t }}</mat-label>
            <mat-select formControlName="priority">
              @for (p of priorities; track p) { <mat-option [value]="p">{{ 'enums.status.' + p | t }}</mat-option> }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>{{ 'common.department' | t }} ({{ 'common.optional' | t }})</mat-label>
            <mat-select formControlName="departmentId">
              <mat-option [value]="null">{{ 'tasks.form.autoDepartment' | t }}</mat-option>
              @for (d of departments(); track d.id) { <mat-option [value]="d.id">{{ d.name }}</mat-option> }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>{{ 'tasks.fields.startDate' | t }}</mat-label>
            <input matInput [matDatepicker]="sp" formControlName="startDate" />
            <mat-datepicker-toggle matIconSuffix [for]="sp" />
            <mat-datepicker #sp />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'tasks.fields.startTime' | t }}</mat-label>
            <input matInput type="time" formControlName="startTime" />
          </mat-form-field>

          <mat-form-field>
            <mat-label>{{ 'tasks.fields.dueDate' | t }}</mat-label>
            <input matInput [matDatepicker]="dp" formControlName="dueDate" />
            <mat-datepicker-toggle matIconSuffix [for]="dp" />
            <mat-datepicker #dp />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'tasks.fields.dueTime' | t }}</mat-label>
            <input matInput type="time" formControlName="dueTime" />
          </mat-form-field>
          @if (form.hasError('dueBeforeStart')) {
            <div class="alert alert-danger span-2"><mat-icon>error_outline</mat-icon>{{ 'tasks.form.dueBeforeStart' | t }}</div>
          }

          <mat-form-field class="span-2">
            <mat-label>{{ 'tasks.fields.assignees' | t }}</mat-label>
            <mat-select formControlName="assigneeEmployeeIds" multiple (openedChange)="$event || assigneeSearch.set('')">
              <div class="select-search" (keydown)="$event.stopPropagation()">
                <input [placeholder]="'common.search' | t" [ngModel]="assigneeSearch()" (ngModelChange)="assigneeSearch.set($event)"
                       [ngModelOptions]="{ standalone: true }" />
              </div>
              @for (e of employees(); track e.id) {
                <mat-option [value]="e.id" [class.hidden]="!matches(e.name, e.code)">{{ e.name }} <span class="muted">· {{ e.code }}</span></mat-option>
              }
            </mat-select>
            <mat-hint>{{ 'tasks.form.assigneesHint' | t }}</mat-hint>
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">
          {{ (isEdit ? 'common.save' : 'common.create') | t }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .select-search { position: sticky; top: 0; z-index: 2; background: var(--surface); padding: 8px 12px; border-bottom: 1px solid var(--border);
      input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; outline: none; } }
    .hidden { display: none !important; }
    mat-dialog-content { min-width: min(640px, 86vw); }
  `,
})
export class TaskFormDialogComponent {
  private readonly api = inject(ApiService);
  private readonly lookups = inject(LookupService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly ref = inject(MatDialogRef<TaskFormDialogComponent, TaskDetails>);
  private readonly data = inject<TaskFormData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly isEdit = !!this.data.task;
  readonly priorities = TASK_PRIORITIES;
  readonly saving = signal(false);
  readonly serverErrors = signal<Record<string, string[]>>({});
  readonly assigneeSearch = signal('');
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  private readonly allEmployees = toSignal(this.lookups.employees(), { initialValue: [] });

  /** Keeps currently assigned people selectable even if they are outside the lookup scope. */
  readonly employees = computed(() => {
    const list = [...this.allEmployees()];
    for (const a of this.data.task?.task.assignees ?? []) {
      if (!list.some(e => e.id === a.employeeId)) list.push({ id: a.employeeId, name: a.fullName, code: a.employeeCode });
    }
    return list;
  });

  readonly form = (() => {
    const t = this.data.task;
    return inject(FormBuilder).nonNullable.group({
      title: [t?.task.title ?? '', [Validators.required, Validators.maxLength(200)]],
      description: [t?.description ?? '', [Validators.maxLength(4000)]],
      priority: [(t?.task.priority ?? 'Medium') as TaskPriority],
      departmentId: [t?.task.departmentId ?? (null as number | null)],
      startDate: [t?.task.startDate ? new Date(t.task.startDate) : (null as Date | null)],
      startTime: [t?.task.startDate ? timeOf(t.task.startDate) : '09:00'],
      dueDate: [t?.task.dueDate ? new Date(t.task.dueDate) : (null as Date | null)],
      dueTime: [t?.task.dueDate ? timeOf(t.task.dueDate) : '17:00'],
      assigneeEmployeeIds: [t?.task.assignees.map(a => a.employeeId) ?? ([] as number[])],
    }, { validators: dueAfterStart });
  })();

  matches(name: string, code?: string | null): boolean {
    const q = this.assigneeSearch().trim().toLowerCase();
    return !q || name.toLowerCase().includes(q) || (code ?? '').toLowerCase().includes(q);
  }

  save(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: SaveTask = {
      title: v.title.trim(), description: v.description.trim() || null, priority: v.priority,
      startDate: combineDateTime(v.startDate, v.startTime), dueDate: combineDateTime(v.dueDate, v.dueTime),
      departmentId: v.departmentId, assigneeEmployeeIds: v.assigneeEmployeeIds, rowVersion: this.data.task?.rowVersion ?? null,
    };
    this.saving.set(true);
    this.serverErrors.set({});
    const req = this.data.task ? this.api.updateTask(this.data.task.task.id, body) : this.api.createTask(body);
    req.subscribe({
      next: res => {
        this.toast.success(this.i18n.t(this.isEdit ? 'tasks.messages.updated' : 'tasks.messages.created'));
        this.ref.close(res);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.serverErrors.set(validationErrors(err));
        if (err instanceof HttpErrorResponse && err.status === 409) this.ref.close(undefined);
      },
    });
  }
}
