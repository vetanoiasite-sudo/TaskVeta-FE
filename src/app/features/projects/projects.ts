import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { LookupService } from '../../core/lookup.service';
import { PROJECT_STATUSES, Perm, Project, ProjectStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService, EmptyStateComponent, LoadingBarComponent, PageHeaderComponent, StatusChipComponent } from '../../shared/ui';
import { ProjectDialogComponent } from './project-dialog';

/** Project cards; admins (projects.manage) can add, edit and delete. Opening a card shows its timeline. */
@Component({
  selector: 'app-projects',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    PageHeaderComponent, LoadingBarComponent, EmptyStateComponent, StatusChipComponent, TranslatePipe, LocalDatePipe],
  template: `
    <app-page-header [title]="'projects.title' | t" [subtitle]="'projects.subtitle' | t" icon="folder_special">
      @if (canManage) {
        <button mat-flat-button (click)="open()"><mat-icon>add</mat-icon>{{ 'projects.add' | t }}</button>
      }
    </app-page-header>

    <div class="filters">
      <mat-form-field class="wide">
        <mat-label>{{ 'common.search' | t }}</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="search()" (ngModelChange)="search.set($event)" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>{{ 'common.status' | t }}</mat-label>
        <mat-select [ngModel]="status()" (ngModelChange)="status.set($event)">
          <mat-option [value]="null">{{ 'common.all' | t }}</mat-option>
          @for (s of statuses; track s) { <mat-option [value]="s">{{ 'enums.status.' + s | t }}</mat-option> }
        </mat-select>
      </mat-form-field>
    </div>

    <app-loading-bar [loading]="loading()" />
    <div class="project-grid">
      @for (p of filtered(); track p.id) {
        <div class="card project" [class.closed]="p.status === 'Completed' || p.status === 'Cancelled'">
          <div class="project__head">
            <div class="project__icon"><mat-icon>folder_special</mat-icon></div>
            <a class="project__title" [routerLink]="['/projects', p.id]">
              <strong>{{ name(p) }}</strong>
              <span class="muted">{{ p.code }}@if (p.nameAr && lang() !== 'ar') { · {{ p.nameAr }} }</span>
            </a>
            @if (canManage) {
              <button mat-icon-button [matMenuTriggerFor]="menu" [attr.aria-label]="'common.actions' | t"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu" xPosition="before">
                <button mat-menu-item (click)="open(p)"><mat-icon>edit</mat-icon>{{ 'common.edit' | t }}</button>
                <button mat-menu-item (click)="remove(p)"><mat-icon>delete</mat-icon>{{ 'common.delete' | t }}</button>
              </mat-menu>
            }
          </div>
          @if (p.description) { <p class="project__desc">{{ p.description }}</p> }
          <div class="project__dates">
            <mat-icon>date_range</mat-icon>
            @if (p.startDate || p.endDate) { {{ p.startDate | ldate }} → {{ p.endDate | ldate }} } @else { {{ 'projects.noDates' | t }} }
          </div>
          <div class="progress-mini"><div class="bar"><div class="fill" [style.width.%]="p.progressPercent"></div></div><span>{{ p.progressPercent }}%</span></div>
          <div class="project__stats">
            <span><mat-icon>assignment</mat-icon>{{ p.taskCount }} {{ 'projects.tasks' | t }}</span>
            <span><mat-icon>task_alt</mat-icon>{{ p.completedTaskCount }}</span>
            @if (p.overdueTaskCount) { <span class="overdue"><mat-icon>running_with_errors</mat-icon>{{ p.overdueTaskCount }}</span> }
            <span class="spacer"></span>
            <app-status-chip [value]="p.status" />
          </div>
          <a mat-stroked-button [routerLink]="['/projects', p.id]"><mat-icon>view_timeline</mat-icon>{{ 'projects.timeline' | t }}</a>
        </div>
      }
    </div>
    @if (!loading() && filtered().length === 0) {
      <div class="card"><app-empty-state icon="folder_special" [message]="(items().length ? 'common.noData' : 'projects.empty') | t" /></div>
    }
  `,
  styles: `
    .project-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
    .project { display: flex; flex-direction: column; gap: 10px; &.closed { opacity: .7; } }
    .project__head { display: flex; align-items: center; gap: 12px; }
    .project__icon { width: 42px; height: 42px; border-radius: 12px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; flex: none; }
    .project__title { flex: 1; min-width: 0; display: flex; flex-direction: column; color: inherit; text-decoration: none;
      strong { font-size: 15.5px; } span { font-size: 12.5px; } &:hover strong { color: var(--primary); } }
    .project__desc { margin: 0; font-size: 13px; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .project__dates, .project__stats span { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted);
      mat-icon { font-size: 18px; width: 18px; height: 18px; } }
    .project__stats { display: flex; align-items: center; gap: 12px; border-top: 1px solid var(--border); padding-top: 8px;
      .overdue { color: var(--danger); } }
  `,
})
export class ProjectsComponent {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly lookup = inject(LookupService);

  readonly canManage = inject(AuthService).hasPermission(Perm.ProjectsManage);
  readonly statuses = PROJECT_STATUSES;
  readonly lang = this.i18n.lang;
  readonly items = signal<Project[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
  readonly status = signal<ProjectStatus | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase(), s = this.status();
    return this.items().filter(p => (!s || p.status === s)
      && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.nameAr ?? '').includes(q)));
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.projects().subscribe({
      next: p => { this.items.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  name(p: Project): string {
    return this.lang() === 'ar' && p.nameAr ? p.nameAr : p.name;
  }

  open(p?: Project): void {
    this.dialog.open(ProjectDialogComponent, { data: p ?? null, width: '640px', maxWidth: '96vw', autoFocus: false })
      .afterClosed().subscribe(saved => { if (saved) { this.lookup.invalidate(); this.load(); } });
  }

  remove(p: Project): void {
    this.confirm.ask({
      title: this.i18n.t('common.areYouSure'),
      message: this.i18n.t('projects.deleteConfirm', { name: this.name(p), count: p.taskCount }),
      confirmText: this.i18n.t('common.delete'), danger: true,
    }).pipe(switchMap(() => this.api.deleteProject(p.id))).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.lookup.invalidate();
      this.load();
    });
  }
}
