import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { Perm, TASK_PRIORITIES, TASK_STATUSES, TaskItem, TaskPriority, TaskQuery, TaskStatus } from '../../core/models';
import { ConfirmService, LoadingBarComponent, PageHeaderComponent, StatusChipComponent, debounce } from '../../shared/ui';
import { AssigneeStackComponent, statusAction } from './task-shared';
import { openTaskReview } from './task-review.dialog';
import { MatDialog } from '@angular/material/dialog';

const COLUMN_TONE: Record<TaskStatus, string> = {
  New: '#65676b', Assigned: '#0a7cbd', InProgress: '#1877f2', PendingReview: '#7b4fd6', Completed: '#31a24c', Rejected: '#e41e3f', Cancelled: '#bcc0c4',
};

@Component({
  selector: 'app-task-board',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, CdkDragPlaceholder, FormsModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule, MatTooltipModule, PageHeaderComponent, LoadingBarComponent, StatusChipComponent,
    AssigneeStackComponent, TranslatePipe, LocalDatePipe],
  template: `
    @if (!embedded()) {
      <app-page-header [title]="'tasks.board.title' | t" [subtitle]="'tasks.board.subtitle' | t" icon="view_kanban">
        <button mat-stroked-button (click)="load()"><mat-icon>refresh</mat-icon>{{ 'common.refresh' | t }}</button>
      </app-page-header>
      <div class="filters">
        <mat-form-field class="wide">
          <mat-label>{{ 'common.search' | t }}</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput [ngModel]="search()" (ngModelChange)="onSearch($event)" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'tasks.fields.priority' | t }}</mat-label>
          <mat-select [ngModel]="priority()" (ngModelChange)="priority.set($event); load()">
            <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
            @for (p of priorities; track p) { <mat-option [value]="p">{{ 'enums.status.' + p | t }}</mat-option> }
          </mat-select>
        </mat-form-field>
        @if (canAssign) {
          <mat-slide-toggle [ngModel]="mine()" (ngModelChange)="mine.set($event); load()">{{ 'tasks.filters.mineOnly' | t }}</mat-slide-toggle>
        }
        <mat-slide-toggle [ngModel]="showCancelled()" (ngModelChange)="showCancelled.set($event)">{{ 'tasks.board.showCancelled' | t }}</mat-slide-toggle>
      </div>
    }

    <app-loading-bar [loading]="loading()" />
    @if (truncated()) { <div class="alert alert-info"><mat-icon>info</mat-icon>{{ 'tasks.board.truncated' | t: { count: total() } }}</div> }

    <div class="board" cdkDropListGroup>
      @for (col of columns(); track col) {
        <section class="column" [style.--col]="tone(col)">
          <header class="column__head">
            <span class="dot"></span>
            <strong>{{ 'enums.status.' + col | t }}</strong>
            <span class="count">{{ byStatus()[col].length }}</span>
          </header>
          <div class="column__list" cdkDropList [cdkDropListData]="col" (cdkDropListDropped)="drop($event)">
            @for (task of byStatus()[col]; track task.id) {
              <article class="task-card" cdkDrag [cdkDragData]="task" [cdkDragDisabled]="busy().has(task.id)"
                       [class.overdue]="task.isOverdue" [class.busy]="busy().has(task.id)" (click)="open(task)">
                <div class="task-card__top">
                  <app-status-chip [value]="task.priority" />
                  @if (task.isOverdue) { <span class="overdue-badge"><mat-icon>schedule</mat-icon>{{ 'tasks.overdue' | t }}</span> }
                </div>
                <h4>{{ task.title }}</h4>
                @if (task.progressPercent > 0 && task.status !== 'Completed') {
                  <div class="progress-mini"><div class="bar"><div class="fill" [style.width.%]="task.progressPercent"></div></div><span>{{ task.progressPercent }}%</span></div>
                }
                <footer>
                  <span class="due" [class.late]="task.isOverdue">
                    @if (task.dueDate) { <mat-icon>event</mat-icon>{{ task.dueDate | ldate: 'date' }} }
                  </span>
                  <span class="meta">
                    @if (task.commentCount) { <span><mat-icon>chat_bubble_outline</mat-icon>{{ task.commentCount }}</span> }
                    @if (task.attachmentCount) { <span><mat-icon>attach_file</mat-icon>{{ task.attachmentCount }}</span> }
                  </span>
                  <app-assignee-stack [assignees]="task.assignees" [size]="24" />
                </footer>
                <div *cdkDragPlaceholder class="drag-placeholder"></div>
              </article>
            } @empty {
              <div class="column__empty">{{ 'tasks.board.empty' | t }}</div>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 12px; align-items: flex-start; min-height: 60vh; }
    .column { flex: 0 0 290px; background: var(--surface-2); border-radius: 14px; display: flex; flex-direction: column; max-height: calc(100vh - 260px); }
    .column__head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-top: 3px solid var(--col); border-radius: 14px 14px 0 0;
      strong { font-size: 14px; } .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--col); }
      .count { margin-inline-start: auto; background: #fff; border-radius: 999px; padding: 0 9px; font-size: 12px; font-weight: 600; color: var(--text-muted); } }
    .column__list { padding: 4px 10px 12px; overflow-y: auto; flex: 1; min-height: 80px; display: flex; flex-direction: column; gap: 10px; }
    .column__empty { text-align: center; color: var(--text-muted); font-size: 12.5px; padding: 18px 0; border: 1.5px dashed var(--border-strong); border-radius: 10px; }
    .task-card { background: var(--surface); border-radius: 12px; padding: 12px; box-shadow: var(--shadow); cursor: grab; border: 1px solid var(--border);
      border-inline-start: 3px solid var(--col);
      h4 { margin: 8px 0; font-size: 14px; line-height: 1.35; word-break: break-word; }
      &.overdue { border-inline-start-color: var(--danger); }
      &.busy { opacity: .55; }
      footer { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: var(--text-muted); }
      mat-icon { font-size: 15px; width: 15px; height: 15px; vertical-align: -3px; } }
    .task-card__top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .overdue-badge { color: var(--danger); font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 2px; }
    .due { display: inline-flex; align-items: center; gap: 3px; &.late { color: var(--danger); font-weight: 600; } }
    .meta { display: inline-flex; gap: 8px; margin-inline-start: auto; span { display: inline-flex; align-items: center; gap: 2px; } }
    .drag-placeholder { min-height: 70px; border: 2px dashed var(--border-strong); border-radius: 12px; background: var(--neutral-soft); }
    .cdk-drag-preview { box-shadow: var(--shadow-lg); border-radius: 12px; }
    .cdk-drag-animating, .column__list.cdk-drop-list-dragging .task-card:not(.cdk-drag-placeholder) { transition: transform 200ms cubic-bezier(0, 0, .2, 1); }
  `,
})
export class TaskBoardComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  /** When embedded, the parent supplies the query and filters are hidden. */
  readonly embedded = input(false);
  readonly query = input<TaskQuery | null>(null);
  readonly includeCancelled = input<boolean | null>(null);

  readonly canAssign = this.auth.hasPermission(Perm.TasksAssign);
  readonly priorities = TASK_PRIORITIES;
  readonly tasks = signal<TaskItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly busy = signal(new Set<number>());
  readonly search = signal('');
  readonly priority = signal<TaskPriority | null>(null);
  readonly mine = signal(!this.canAssign);
  readonly showCancelled = signal(false);
  readonly truncated = computed(() => this.total() > this.tasks().length);

  readonly columns = computed(() => {
    const show = this.includeCancelled() ?? this.showCancelled();
    return TASK_STATUSES.filter(s => s !== 'Cancelled' || show);
  });

  readonly byStatus = computed(() => {
    const map = Object.fromEntries(TASK_STATUSES.map(s => [s, [] as TaskItem[]])) as Record<TaskStatus, TaskItem[]>;
    for (const t of this.tasks()) map[t.status].push(t);
    return map;
  });

  readonly onSearch = debounce((v: string) => { this.search.set(v); this.load(); });

  constructor() {
    effect(() => {
      const q = this.query();
      const embedded = this.embedded();
      untracked(() => (embedded ? this.fetch(q ?? {}) : this.load()));
    });
  }

  load(): void {
    if (this.embedded()) { this.fetch(this.query() ?? {}); return; }
    this.fetch({ search: this.search() || undefined, priority: this.priority(), mine: this.mine() || undefined });
  }

  private fetch(q: TaskQuery): void {
    this.loading.set(true);
    const req = q.mine ? this.api.myTasks({ ...q, mine: undefined, page: 1, pageSize: 200 }) : this.api.tasks({ ...q, page: 1, pageSize: 200, sortBy: 'dueDate', sortDir: 'asc' });
    req.subscribe({
      next: r => { this.tasks.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  tone(s: TaskStatus): string {
    return COLUMN_TONE[s];
  }

  open(task: TaskItem): void {
    this.router.navigate(['/tasks', task.id]);
  }

  drop(event: CdkDragDrop<TaskStatus, TaskStatus, TaskItem>): void {
    const task = event.item.data;
    const target = event.container.data;
    if (event.previousContainer === event.container || task.status === target) return;
    const from = task.status;

    const proceed = (note: string | null, rating: number | null = null) => {
      this.move(task.id, target);
      this.setBusy(task.id, true);
      this.api.changeTaskStatus(task.id, target, note, null, rating).subscribe({
        next: details => {
          this.tasks.update(list => list.map(t => (t.id === task.id ? details.task : t)));
          this.setBusy(task.id, false);
        },
        error: () => { this.move(task.id, from); this.setBusy(task.id, false); }, // server rejected: revert (message toasted globally)
      });
    };

    if (target === 'Completed' || target === 'Rejected') {
      openTaskReview(this.dialog, task.title, target === 'Completed').subscribe(r => proceed(r.note, r.rating));
      return;
    }
    const action = statusAction(from, target);
    let prompt$: Observable<string | true> = of(true);
    if (action.requiresNote) {
      prompt$ = this.confirm.ask({
        title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.rejectPrompt', { title: task.title }),
        inputLabel: this.i18n.t('common.reason'), inputRequired: true, danger: true, confirmText: this.i18n.t(action.labelKey),
      });
    } else if (target === 'Cancelled') {
      prompt$ = this.confirm.ask({ title: this.i18n.t('tasks.actions.cancel'), message: this.i18n.t('tasks.details.cancelPrompt'), danger: true });
    }
    prompt$.subscribe(r => proceed(typeof r === 'string' ? r : null));
  }

  private move(id: number, status: TaskStatus): void {
    this.tasks.update(list => list.map(t => (t.id === id ? { ...t, status } : t)));
  }

  private setBusy(id: number, on: boolean): void {
    this.busy.update(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  }
}

