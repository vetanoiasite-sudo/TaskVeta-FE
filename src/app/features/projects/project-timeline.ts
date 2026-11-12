import { NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, parseIsoDate } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { Perm, Project, ProjectTimeline, TaskItem, TaskStatus } from '../../core/models';
import { EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent } from '../../shared/ui';
import { TaskFormDialogComponent } from '../tasks/task-form.dialog';
import { AssigneeStackComponent } from '../tasks/task-shared';
import { ProjectDialogComponent } from './project-dialog';

const DAY = 86_400_000;
type Scale = 'day' | 'week' | 'month';

const STATUS_TONE: Record<TaskStatus, string> = {
  New: 'neutral', Assigned: 'info', InProgress: 'primary', PendingReview: 'purple', Completed: 'success', Rejected: 'danger', Cancelled: 'neutral',
};

interface Bar {
  task: TaskItem; start: Date; end: Date; openEnded: boolean; left: number; width: number; tone: string; openable: boolean;
}
interface Tick { left: number; label: string; major: boolean; }
interface Band { left: number; width: number; label: string; }

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Gantt-style timeline of a project's tasks. Each bar runs from the task's start (or creation) to its completion or due
 * date; tasks with no due date run to today and are drawn open-ended. Positions use inline-start so RTL mirrors it.
 */
@Component({
  selector: 'app-project-timeline',
  imports: [NgClass, FormsModule, RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSlideToggleModule, MatTooltipModule,
    PageHeaderComponent, StatCardComponent, StatusChipComponent, LoadingBarComponent, EmptyStateComponent, AssigneeStackComponent,
    TranslatePipe, LocalDatePipe],
  template: `
    @if (data(); as d) {
      <app-page-header [title]="name(d.project)" [subtitle]="d.project.code" icon="view_timeline">
        <a mat-button routerLink="/projects"><mat-icon class="flip-rtl">arrow_back</mat-icon>{{ 'projects.title' | t }}</a>
        @if (canAssign) {
          <a mat-stroked-button routerLink="/tasks" [queryParams]="{ projectId: d.project.id }"><mat-icon>table_rows</mat-icon>{{ 'projects.taskList' | t }}</a>
        }
        @if (canManage) {
          <button mat-stroked-button (click)="edit(d.project)"><mat-icon>edit</mat-icon>{{ 'common.edit' | t }}</button>
        }
        @if (canAssign && d.project.status !== 'Completed' && d.project.status !== 'Cancelled') {
          <button mat-flat-button (click)="newTask(d.project)"><mat-icon>add</mat-icon>{{ 'tasks.newTask' | t }}</button>
        }
      </app-page-header>

      <div class="card summary">
        <div class="summary__meta">
          <app-status-chip [value]="d.project.status" />
          <span><mat-icon>date_range</mat-icon>
            @if (d.project.startDate || d.project.endDate) { {{ d.project.startDate | ldate }} → {{ d.project.endDate | ldate }} }
            @else { {{ 'projects.noDates' | t }} }
          </span>
          @if (daysLeft(); as left) {
            <span [class.overdue]="left.overdue"><mat-icon>{{ left.overdue ? 'event_busy' : 'hourglass_bottom' }}</mat-icon>
              {{ (left.overdue ? 'projects.daysLate' : 'projects.daysLeft') | t: { count: left.days } }}</span>
          }
        </div>
        @if (d.project.description) { <p class="summary__desc">{{ d.project.description }}</p> }
        <div class="progress-mini big"><div class="bar"><div class="fill" [style.width.%]="d.project.progressPercent"></div></div><span>{{ d.project.progressPercent }}%</span></div>
      </div>

      <div class="stats">
        <app-stat-card [label]="'projects.tasksTotal' | t" [value]="d.project.taskCount" icon="assignment" tone="primary" />
        <app-stat-card [label]="'dashboard.completed' | t" [value]="d.project.completedTaskCount" icon="task_alt" tone="success" />
        <app-stat-card [label]="'dashboard.inProgress' | t" [value]="inProgressCount()" icon="autorenew" tone="info" />
        <app-stat-card [label]="'dashboard.overdue' | t" [value]="d.project.overdueTaskCount" icon="running_with_errors" tone="danger" />
      </div>

      <div class="card gantt-card">
        <div class="gantt-toolbar">
          <h3 class="card__title">{{ 'projects.timeline' | t }}</h3>
          <span class="spacer"></span>
          <mat-slide-toggle [ngModel]="showClosed()" (ngModelChange)="showClosed.set($event)">{{ 'projects.showClosed' | t }}</mat-slide-toggle>
          <mat-button-toggle-group [value]="scale()" (change)="scaleChoice.set($event.value)" hideSingleSelectionIndicator>
            <mat-button-toggle value="day">{{ 'projects.scale.day' | t }}</mat-button-toggle>
            <mat-button-toggle value="week">{{ 'projects.scale.week' | t }}</mat-button-toggle>
            <mat-button-toggle value="month">{{ 'projects.scale.month' | t }}</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        @if (bars().length) {
          <div class="gantt-scroll">
            <div class="gantt" [style.min-width.px]="minWidth()">
              <div class="g-row g-head">
                <div class="g-label">{{ 'tasks.fields.title' | t }}</div>
                <div class="g-track">
                  @for (b of bands(); track b.left) {
                    <div class="band" [style.inset-inline-start.%]="b.left" [style.width.%]="b.width">{{ b.label }}</div>
                  }
                  @for (t of ticks(); track t.left) {
                    <div class="tick" [class.major]="t.major" [style.inset-inline-start.%]="t.left"><span>{{ t.label }}</span></div>
                  }
                </div>
              </div>

              <div class="g-body">
                <div class="g-lines">
                  @for (t of ticks(); track t.left) { <div class="grid-line" [class.major]="t.major" [style.inset-inline-start.%]="t.left"></div> }
                  @if (projectStart() !== null) {
                    <div class="marker project-edge" [style.inset-inline-start.%]="projectStart()" [matTooltip]="'projects.projectStart' | t"></div>
                  }
                  @if (projectEnd() !== null) {
                    <div class="marker project-edge end" [style.inset-inline-start.%]="projectEnd()" [matTooltip]="'projects.projectEnd' | t"></div>
                  }
                  <div class="marker today" [style.inset-inline-start.%]="today()"><span>{{ 'common.today' | t }}</span></div>
                </div>

                @for (b of bars(); track b.task.id) {
                  <div class="g-row">
                    <a class="g-label" [class.locked]="!b.openable" [routerLink]="b.openable ? ['/tasks', b.task.id] : null">
                      <span class="g-title" [class.done]="b.task.status === 'Completed'">{{ b.task.title }}</span>
                      <span class="g-sub">
                        <app-status-chip [value]="b.task.status" />
                        <app-assignee-stack [assignees]="b.task.assignees" [size]="22" [max]="3" />
                      </span>
                    </a>
                    <div class="g-track">
                      <a class="g-bar" [ngClass]="'tone-' + b.tone" [class.overdue]="b.task.isOverdue" [class.open]="b.openEnded"
                         [class.cancelled]="b.task.status === 'Cancelled'"
                         [style.inset-inline-start.%]="b.left" [style.width.%]="b.width" [class.locked]="!b.openable"
                         [routerLink]="b.openable ? ['/tasks', b.task.id] : null"
                         [matTooltip]="tooltip(b)" matTooltipClass="tooltip-multiline">
                        <span class="g-fill" [style.width.%]="b.task.progressPercent"></span>
                        <span class="g-text">{{ b.task.progressPercent }}%</span>
                      </a>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
          <div class="legend">
            @for (s of legend; track s) { <span><i [ngClass]="'tone-' + tone(s)"></i>{{ 'enums.status.' + s | t }}</span> }
            <span><i class="legend-overdue"></i>{{ 'tasks.overdue' | t }}</span>
            <span><i class="legend-today"></i>{{ 'common.today' | t }}</span>
          </div>
        } @else {
          <app-empty-state icon="view_timeline" [message]="'projects.noTasks' | t" />
        }
      </div>
    } @else {
      <app-loading-bar [loading]="loading()" />
      @if (!loading()) { <div class="card"><app-empty-state icon="folder_off" [message]="'common.noData' | t" /></div> }
    }
  `,
  styles: `
    .summary { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
    .summary__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; font-size: 13.5px; color: var(--text-muted);
      span { display: inline-flex; align-items: center; gap: 6px; } mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .overdue { color: var(--danger); } }
    .summary__desc { margin: 0; font-size: 13.5px; color: var(--text-muted); white-space: pre-line; }
    .progress-mini.big .bar { height: 10px; }
    .stats { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 16px; }

    .gantt-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; .card__title { margin: 0; } }
    .gantt-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
    .gantt { --label-w: 260px; position: relative; }
    .g-row { display: grid; grid-template-columns: var(--label-w) 1fr; min-height: 52px; border-bottom: 1px solid var(--border); }
    .g-row:last-child { border-bottom: 0; }
    .g-label { position: sticky; inset-inline-start: 0; z-index: 3; background: var(--surface); border-inline-end: 1px solid var(--border);
      padding: 8px 12px; display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 0; color: inherit; text-decoration: none; }
    a.g-label:not(.locked):hover .g-title { color: var(--primary); }
    .locked { cursor: default; }
    .g-title { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      &.done { text-decoration: line-through; color: var(--text-muted); } }
    .g-sub { display: flex; align-items: center; gap: 8px; }
    .g-track { position: relative; }

    .g-head { min-height: 56px; background: var(--neutral-soft); position: sticky; top: 0; z-index: 4;
      .g-label { background: var(--neutral-soft); font-weight: 600; font-size: 12.5px; color: var(--text-muted); } }
    .band { position: absolute; top: 0; height: 26px; line-height: 26px; padding-inline: 8px; font-size: 12px; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-inline-start: 1px solid var(--border); box-sizing: border-box; }
    .tick { position: absolute; top: 26px; bottom: 0; border-inline-start: 1px solid var(--border);
      span { position: absolute; top: 6px; inset-inline-start: 4px; font-size: 11px; color: var(--text-muted); white-space: nowrap; } }

    .g-body { position: relative; }
    .g-lines { position: absolute; top: 0; bottom: 0; inset-inline-start: var(--label-w); inset-inline-end: 0; pointer-events: none; z-index: 1; }
    .grid-line { position: absolute; top: 0; bottom: 0; border-inline-start: 1px dashed var(--border); opacity: .6; &.major { border-inline-start-style: solid; opacity: 1; } }
    .marker { position: absolute; top: 0; bottom: 0; width: 0; pointer-events: auto; }
    .marker.today { border-inline-start: 2px solid var(--danger);
      span { position: absolute; top: 2px; inset-inline-start: 4px; font-size: 10.5px; font-weight: 700; color: var(--danger); background: var(--surface); padding: 0 4px; border-radius: 4px; } }
    .marker.project-edge { border-inline-start: 2px dashed var(--primary); width: 6px; }

    .g-bar { position: absolute; top: 50%; transform: translateY(-50%); height: 24px; min-width: 6px; border-radius: 8px; z-index: 2;
      background: var(--tone-bg); border: 1px solid var(--tone); overflow: hidden; display: flex; align-items: center; text-decoration: none;
      box-sizing: border-box; transition: box-shadow .15s; }
    .g-bar:not(.locked):hover { box-shadow: 0 2px 8px rgb(0 0 0 / .18); }
    .g-bar.open { border-end-end-radius: 0; border-start-end-radius: 0; border-inline-end-style: dashed; }
    .g-bar.overdue { border: 2px solid var(--danger); }
    .g-bar.cancelled { opacity: .5; }
    .g-fill { position: absolute; inset-block: 0; inset-inline-start: 0; background: var(--tone); opacity: .85; }
    .g-text { position: relative; padding-inline: 8px; font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap; }

    .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: var(--text-muted);
      span { display: inline-flex; align-items: center; gap: 6px; }
      i { width: 14px; height: 10px; border-radius: 3px; background: var(--tone); display: inline-block; }
      .legend-overdue { background: transparent; border: 2px solid var(--danger); box-sizing: border-box; }
      .legend-today { width: 2px; height: 14px; background: var(--danger); border-radius: 0; } }
  `,
})
export class ProjectTimelineComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);
  private readonly auth = inject(AuthService);
  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly canManage = this.auth.hasPermission(Perm.ProjectsManage);
  readonly canAssign = this.auth.hasPermission(Perm.TasksAssign);
  readonly legend: TaskStatus[] = ['New', 'Assigned', 'InProgress', 'PendingReview', 'Completed', 'Rejected'];

  readonly data = signal<ProjectTimeline | null>(null);
  readonly loading = signal(false);
  readonly showClosed = signal(true);
  /** User-picked scale; null = automatic from the visible span. */
  readonly scaleChoice = signal<Scale | null>(null);
  private readonly now = startOfDay(new Date());

  /** Tasks shown on the chart with their raw start/end dates. */
  private readonly rows = computed(() => {
    const tasks = (this.data()?.tasks ?? []).filter(t => this.showClosed() || (t.status !== 'Completed' && t.status !== 'Cancelled'));
    return tasks.map(task => {
      const start = startOfDay(new Date(task.startDate ?? task.createdAt));
      const endIso = task.status === 'Completed' ? task.completionDate ?? task.dueDate : task.dueDate;
      const openEnded = !endIso;
      let end = endIso ? startOfDay(new Date(endIso)) : (this.now > start ? this.now : start);
      if (end < start) end = start;
      return { task, start, end, openEnded };
    });
  });

  /** Visible date range [from, to) in whole days, padded by a day on each side. */
  private readonly range = computed(() => {
    const p = this.data()?.project;
    const dates = [this.now, ...this.rows().flatMap(r => [r.start, r.end])];
    const ps = parseIsoDate(p?.startDate), pe = parseIsoDate(p?.endDate);
    if (ps) dates.push(ps);
    if (pe) dates.push(pe);
    const min = Math.min(...dates.map(d => d.getTime())), max = Math.max(...dates.map(d => d.getTime()));
    const from = new Date(min - DAY), to = new Date(max + 2 * DAY);
    return { from, to, days: Math.round((to.getTime() - from.getTime()) / DAY) };
  });

  readonly scale = computed<Scale>(() => {
    const days = this.range().days;
    return this.scaleChoice() ?? (days <= 45 ? 'day' : days <= 210 ? 'week' : 'month');
  });

  readonly minWidth = computed(() => {
    const perDay = { day: 38, week: 14, month: 4 }[this.scale()];
    return 260 + this.range().days * perDay;
  });

  private readonly openable = computed(() => new Set(this.data()?.openableTaskIds ?? []));

  readonly bars = computed<Bar[]>(() => this.rows().map(r => {
    const left = this.pos(r.start);
    const right = this.pos(new Date(r.end.getTime() + DAY)); // a bar covers its whole last day
    return { ...r, left, width: Math.max(right - left, 0.4), tone: this.tone(r.task.status), openable: this.openable().has(r.task.id) };
  }));

  readonly today = computed(() => this.pos(new Date(this.now.getTime() + DAY / 2)));
  readonly projectStart = computed(() => {
    const d = parseIsoDate(this.data()?.project.startDate);
    return d ? this.pos(d) : null;
  });
  readonly projectEnd = computed(() => {
    const d = parseIsoDate(this.data()?.project.endDate);
    return d ? this.pos(new Date(d.getTime() + DAY)) : null;
  });

  /** Month (or year, for long ranges) bands across the top of the header. */
  readonly bands = computed<Band[]>(() => {
    const { from, to } = this.range();
    const locale = this.i18n.locale();
    const yearly = this.scale() === 'month' && this.range().days > 730;
    const out: Band[] = [];
    let cur = yearly ? new Date(from.getFullYear(), 0, 1) : new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur < to) {
      const next = yearly ? new Date(cur.getFullYear() + 1, 0, 1) : new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const left = Math.max(this.pos(cur), 0), right = Math.min(this.pos(next), 100);
      out.push({
        left, width: right - left,
        label: yearly ? String(cur.getFullYear()) : cur.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      });
      cur = next;
    }
    return out;
  });

  /** Day / week / month ticks under the bands. */
  readonly ticks = computed<Tick[]>(() => {
    const { from, to } = this.range();
    const locale = this.i18n.locale();
    const scale = this.scale();
    const out: Tick[] = [];
    if (scale === 'day') {
      for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        out.push({ left: this.pos(d), label: d.toLocaleDateString(locale, { day: 'numeric' }), major: d.getDay() === 6 });
      }
    } else if (scale === 'week') {
      const first = new Date(from.getFullYear(), from.getMonth(), from.getDate() + ((6 - from.getDay() + 7) % 7)); // Saturdays
      for (let d = first; d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
        out.push({ left: this.pos(d), label: d.toLocaleDateString(locale, { day: 'numeric', month: 'short' }), major: false });
      }
    } else {
      for (let d = new Date(from.getFullYear(), from.getMonth() + 1, 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        out.push({ left: this.pos(d), label: d.toLocaleDateString(locale, { month: 'short' }), major: d.getMonth() === 0 });
      }
    }
    return out;
  });

  readonly inProgressCount = computed(() =>
    (this.data()?.tasks ?? []).filter(t => t.status === 'InProgress' || t.status === 'PendingReview').length);

  readonly daysLeft = computed(() => {
    const p = this.data()?.project;
    const end = parseIsoDate(p?.endDate);
    if (!p || !end || p.status === 'Completed' || p.status === 'Cancelled') return null;
    const days = Math.round((end.getTime() - this.now.getTime()) / DAY);
    return { days: Math.abs(days), overdue: days < 0 };
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.projectTimeline(this.id).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private pos(d: Date): number {
    const { from, to } = this.range();
    return ((d.getTime() - from.getTime()) / (to.getTime() - from.getTime())) * 100;
  }

  tone(s: TaskStatus): string {
    return STATUS_TONE[s] ?? 'neutral';
  }

  name(p: Project): string {
    return this.i18n.lang() === 'ar' && p.nameAr ? p.nameAr : p.name;
  }

  tooltip(b: Bar): string {
    const fmt = (d: Date) => d.toLocaleDateString(this.i18n.locale(), { dateStyle: 'medium' });
    const end = b.openEnded ? this.i18n.t('projects.noDueDate') : fmt(b.end);
    return `${b.task.title}\n${fmt(b.start)} → ${end}\n${this.i18n.t('enums.status.' + b.task.status)} · ${b.task.progressPercent}%`;
  }

  edit(p: Project): void {
    this.dialog.open(ProjectDialogComponent, { data: p, width: '640px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(saved => { if (saved) { this.lookup.invalidate(); this.load(); } });
  }

  newTask(p: Project): void {
    this.dialog.open(TaskFormDialogComponent, { data: { projectId: p.id }, width: '720px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(created => { if (created) this.load(); });
  }
}
