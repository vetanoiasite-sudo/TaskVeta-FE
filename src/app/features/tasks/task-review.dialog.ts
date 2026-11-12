import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Observable, filter } from 'rxjs';
import { TranslatePipe } from '../../core/i18n.service';

export interface TaskReviewData { title: string; approve: boolean; }
export interface TaskReviewResult { rating: number | null; note: string | null; }

/**
 * Department head / team leader decision on a submitted task. Approving needs a rating (1–10); rejecting needs notes
 * (the rating is optional there).
 */
@Component({
  selector: 'app-task-review-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title class="title" [class.reject]="!data.approve">
      <mat-icon>{{ data.approve ? 'task_alt' : 'block' }}</mat-icon>
      {{ (data.approve ? 'tasks.review.approveTitle' : 'tasks.review.rejectTitle') | t }}
    </h2>
    <mat-dialog-content>
      <p class="task-name">{{ data.title }}</p>

      <div class="rating-label">
        {{ 'tasks.review.rating' | t }}
        <span class="muted">{{ (data.approve ? 'tasks.review.ratingRequired' : 'tasks.review.ratingOptional') | t }}</span>
      </div>
      <div class="rating" role="radiogroup" [attr.aria-label]="'tasks.review.rating' | t">
        @for (n of scale; track n) {
          <button type="button" role="radio" class="rate" [class.on]="rating() !== null && n <= rating()!" [class.picked]="rating() === n"
                  [attr.aria-checked]="rating() === n" (click)="rating.set(rating() === n && !data.approve ? null : n)">{{ n }}</button>
        }
      </div>
      <div class="rating-caption">
        @if (rating(); as r) { <strong>{{ r }}/10</strong> · {{ 'tasks.review.levels.' + level() | t }} }
        @else { <span class="muted">{{ 'tasks.review.pickRating' | t }}</span> }
      </div>

      <mat-form-field class="w-100 notes">
        <mat-label>{{ (data.approve ? 'tasks.review.notesOptional' : 'tasks.review.notesRequired') | t }}</mat-label>
        <textarea matInput rows="4" maxlength="2000" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
        @if (!data.approve) { <mat-hint>{{ 'tasks.review.rejectHint' | t }}</mat-hint> }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
      <button mat-flat-button type="button" [class.danger]="!data.approve" [disabled]="!valid()" (click)="submit()">
        <mat-icon>{{ data.approve ? 'task_alt' : 'block' }}</mat-icon>
        {{ (data.approve ? 'tasks.actions.approve' : 'tasks.actions.reject') | t }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .title { display: flex; align-items: center; gap: 8px; color: var(--success); &.reject { color: var(--danger); } }
    .task-name { margin: 0 0 16px; font-weight: 600; }
    .rating-label { font-weight: 600; margin-bottom: 8px; .muted { font-weight: 400; font-size: 12.5px; margin-inline-start: 6px; } }
    .rating { display: flex; flex-wrap: wrap; gap: 6px; }
    .rate { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface); color: var(--text);
      font: inherit; font-weight: 700; cursor: pointer; transition: background .12s, color .12s;
      &:hover { border-color: var(--primary); }
      &.on { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
      &.picked { background: var(--primary); color: #fff; } }
    .rating-caption { margin: 8px 0 18px; font-size: 13px; min-height: 20px; }
    .danger:not(:disabled) { background: var(--danger) !important; color: #fff !important; }
    mat-dialog-content { min-width: min(520px, 86vw); }
  `,
})
export class TaskReviewDialogComponent {
  readonly data = inject<TaskReviewData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<TaskReviewDialogComponent, TaskReviewResult>);
  readonly scale = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  readonly rating = signal<number | null>(null);
  readonly note = signal('');

  readonly level = computed(() => {
    const r = this.rating() ?? 0;
    return r >= 9 ? 'excellent' : r >= 7 ? 'good' : r >= 5 ? 'fair' : 'poor';
  });
  readonly valid = computed(() => (this.data.approve ? this.rating() !== null : this.note().trim().length > 0));

  submit(): void {
    if (!this.valid()) return;
    this.ref.close({ rating: this.rating(), note: this.note().trim() || null });
  }
}

/** Opens the review dialog; emits only when the reviewer confirms. */
export function openTaskReview(dialog: MatDialog, title: string, approve: boolean): Observable<TaskReviewResult> {
  return dialog.open<TaskReviewDialogComponent, TaskReviewData, TaskReviewResult>(TaskReviewDialogComponent,
    { data: { title, approve }, width: '560px', maxWidth: '96vw', autoFocus: false })
    .afterClosed().pipe(filter((r): r is TaskReviewResult => !!r));
}
