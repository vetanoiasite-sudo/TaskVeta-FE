import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Perm, TASK_PRIORITIES, TASK_STATUSES, TaskDashboard, TaskItem, TaskPriority, TaskQuery, TaskStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import {
  EmptyStateComponent, ExportMenuComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent, debounce,
} from '../../shared/ui';
import { TaskBoardComponent } from './task-board';
import { TaskFormDialogComponent } from './task-form.dialog';
import { AssigneeStackComponent } from './task-shared';

function numberParam(v: string | null): number | null {
  const n = Number(v);
  return v && Number.isInteger(n) ? n : null;
}

type StatFilter = 'all' | 'new' | 'inProgress' | 'pendingReview' | 'completed' | 'overdue';

@Component({
  selector: 'app-task-list',
  imports: [FormsModule, RouterLink, MatTableModule, MatSortModule, MatPaginatorModule, MatButtonModule, MatButtonToggleModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatDatepickerModule, MatMenuModule, MatTooltipModule,
    PageHeaderComponent, StatCardComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, ExportMenuComponent,
    AssigneeStackComponent, TaskBoardComponent, TranslatePipe, LocalDatePipe],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
})
export class TaskListComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly lookups = inject(LookupService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly mode: 'all' | 'my' = inject(ActivatedRoute).snapshot.data['mode'] === 'my' ? 'my' : 'all';
  readonly isMy = this.mode === 'my';
  readonly canAssign = this.auth.hasPermission(Perm.TasksAssign);
  readonly canExport = this.auth.hasPermission(Perm.ReportsExport);
  readonly statuses = TASK_STATUSES;
  readonly priorities = TASK_PRIORITIES;
  readonly columns = ['title', 'priority', 'status', 'assignees', 'progressPercent', 'dueDate', 'updatedAt', 'actions'];

  readonly employees = toSignal(this.lookups.employees(), { initialValue: [] });
  readonly departments = toSignal(this.lookups.departments(), { initialValue: [] });
  readonly projects = toSignal(this.lookups.projects(), { initialValue: [] });
  readonly lang = this.i18n.lang;

  // view state
  readonly view = signal<'table' | 'board'>((localStorage.getItem('cm.tasks.view') as 'table' | 'board') || 'table');
  readonly loading = signal(false);
  readonly items = signal<TaskItem[]>([]);
  readonly total = signal(0);
  readonly stats = signal<TaskDashboard | null>(null);
  readonly dueSoon = signal<TaskItem[]>([]);
  readonly activeStat = signal<StatFilter>('all');

  // filters
  readonly search = signal('');
  readonly status = signal<TaskStatus | null>(null);
  readonly priority = signal<TaskPriority | null>(null);
  readonly assigneeId = signal<number | null>(null);
  readonly departmentId = signal<number | null>(numberParam(inject(ActivatedRoute).snapshot.queryParamMap.get('departmentId')));
  readonly projectId = signal<number | null>(numberParam(inject(ActivatedRoute).snapshot.queryParamMap.get('projectId')));
  readonly overdue = signal(false);
  readonly createdByMe = signal(false);
  readonly dueFrom = signal<Date | null>(null);
  readonly dueTo = signal<Date | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sort = signal<Sort>({ active: 'createdAt', direction: 'desc' });

  readonly query = computed<TaskQuery>(() => {
    const to = this.dueTo();
    return {
      search: this.search() || undefined, status: this.status(), priority: this.priority(),
      assigneeId: this.isMy ? null : this.assigneeId(), departmentId: this.isMy ? null : this.departmentId(), projectId: this.projectId(),
      overdue: this.overdue() || null, createdByMe: (!this.isMy && this.createdByMe()) || undefined,
      dueFrom: this.dueFrom()?.toISOString() ?? null,
      dueTo: to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).toISOString() : null,
      mine: this.isMy || undefined,
    };
  });

  readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.search || q.status || q.priority || q.assigneeId || q.departmentId || q.projectId || q.overdue || q.createdByMe || q.dueFrom || q.dueTo);
  });

  readonly onSearch = debounce((v: string) => { this.search.set(v); this.reload(); });

  constructor() {
    this.loadStats();
    this.load();
    if (this.isMy) this.loadDueSoon();
  }

  setView(v: 'table' | 'board'): void {
    this.view.set(v);
    localStorage.setItem('cm.tasks.view', v);
    if (v === 'table') this.load();
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    if (this.view() === 'board') return; // the embedded board reacts to `query` itself
    const s = this.sort();
    const q: TaskQuery = { ...this.query(), mine: undefined, page: this.page(), pageSize: this.pageSize(), sortBy: s.direction ? s.active : undefined, sortDir: s.direction || undefined };
    this.loading.set(true);
    (this.isMy ? this.api.myTasks(q) : this.api.tasks(q)).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.totalCount); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  loadStats(): void {
    this.api.taskDashboard(this.isMy).subscribe(d => this.stats.set(d));
  }

  loadDueSoon(): void {
    this.api.myTasks({ page: 1, pageSize: 30, sortBy: 'dueDate', sortDir: 'asc' }).subscribe(r =>
      this.dueSoon.set(r.items.filter(t => t.dueDate && t.status !== 'Completed' && t.status !== 'Cancelled').slice(0, 6)));
  }

  applyStat(stat: StatFilter): void {
    this.activeStat.set(stat);
    this.status.set(null);
    this.overdue.set(false);
    const map: Partial<Record<StatFilter, TaskStatus>> = { new: 'New', inProgress: 'InProgress', pendingReview: 'PendingReview', completed: 'Completed' };
    if (stat === 'overdue') this.overdue.set(true);
    else if (map[stat]) this.status.set(map[stat]!);
    this.reload();
  }

  resetFilters(): void {
    this.search.set(''); this.status.set(null); this.priority.set(null); this.assigneeId.set(null); this.departmentId.set(null); this.projectId.set(null);
    this.overdue.set(false); this.createdByMe.set(false); this.dueFrom.set(null); this.dueTo.set(null); this.activeStat.set('all');
    this.reload();
  }

  onSort(s: Sort): void {
    this.sort.set(s);
    this.reload();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  open(t: TaskItem): void {
    this.router.navigate(['/tasks', t.id]);
  }

  create(): void {
    this.dialog.open(TaskFormDialogComponent, { data: {}, width: '720px', maxWidth: '96vw' }).afterClosed().subscribe(res => {
      if (res) { this.loadStats(); this.load(); }
    });
  }

  setProgress(t: TaskItem, value: number): void {
    this.api.updateTaskProgress(t.id, value).subscribe(d => {
      this.items.update(list => list.map(x => (x.id === t.id ? d.task : x)));
      this.dueSoon.update(list => list.map(x => (x.id === t.id ? d.task : x)));
      this.toast.success(this.i18n.t('tasks.messages.progressUpdated', { value }));
      this.loadStats();
    });
  }

  export(format: 'xlsx' | 'pdf'): void {
    this.api.exportTasks({ ...this.query(), mine: undefined }, format).subscribe();
  }

  canQuickProgress(t: TaskItem): boolean {
    const me = this.auth.user()?.employeeId;
    return t.status !== 'Completed' && t.status !== 'Cancelled' && t.status !== 'PendingReview' && !!me && t.assignees.some(a => a.employeeId === me);
  }
}
