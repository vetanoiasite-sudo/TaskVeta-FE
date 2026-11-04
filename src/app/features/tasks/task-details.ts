import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LocalDatePipe, fileSize } from '../../core/format';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { TaskAttachment, TaskDetails, TaskHistory, TaskStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent, ConfirmService, EmptyStateComponent, LoadingBarComponent, StatusChipComponent } from '../../shared/ui';
import { TaskFormDialogComponent } from './task-form.dialog';
import { StatusAction, statusAction } from './task-shared';

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.zip'];
const MAX_BYTES = 10 * 1024 * 1024;
const HISTORY_ICONS: Record<string, string> = {
  Created: 'add_task', Updated: 'edit', StatusChanged: 'sync_alt', ProgressUpdated: 'speed', Commented: 'chat',
  AttachmentAdded: 'attach_file', AttachmentRemoved: 'link_off', Overdue: 'running_with_errors',
};

@Component({
  selector: 'app-task-details',
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatTabsModule, MatSliderModule, MatFormFieldModule, MatInputModule,
    MatTooltipModule, StatusChipComponent, AvatarComponent, LoadingBarComponent, EmptyStateComponent, TranslatePipe, LocalDatePipe],
  templateUrl: './task-details.html',
  styleUrl: './task-details.scss',
})
export class TaskDetailsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  /** Route param (component input binding). */
  readonly id = input.required<string>();

  readonly details = signal<TaskDetails | null>(null);
  readonly history = signal<TaskHistory[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly progress = signal(0);
  readonly comment = signal('');
  readonly uploading = signal(false);
  readonly tab = signal(0);
  readonly notFound = signal(false);

  readonly actions = computed<StatusAction[]>(() => {
    const d = this.details();
    if (!d) return [];
    return d.permissions.allowedStatuses.map(s => statusAction(d.task.status, s));
  });
  readonly myUserId = computed(() => this.auth.user()?.id);
  readonly fileSize = fileSize;
  readonly accept = ALLOWED_EXT.join(',');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = Number(this.id());
    this.loading.set(true);
    this.api.task(id).subscribe({
      next: d => {
        this.details.set(d);
        this.progress.set(d.task.progressPercent);
        this.loading.set(false);
        this.loadHistory();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) this.notFound.set(true);
      },
    });
  }

  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/tasks/my']);
  }

  loadHistory(): void {
    this.api.taskHistory(Number(this.id())).subscribe(h => this.history.set(h));
  }

  apply(action: StatusAction): void {
    const d = this.details()!;
    let prompt$: Observable<string | true>;
    if (action.requiresNote) {
      prompt$ = this.confirm.ask({
        title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.rejectPrompt', { title: d.task.title }),
        inputLabel: this.i18n.t('common.reason'), inputRequired: true, danger: true, confirmText: this.i18n.t(action.labelKey),
      });
    } else if (action.status === 'Cancelled') {
      prompt$ = this.confirm.ask({ title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.cancelPrompt'), danger: true });
    } else if (action.status === 'Completed') {
      prompt$ = this.confirm.ask({
        title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.approvePrompt'),
        inputLabel: this.i18n.t('tasks.details.feedbackOptional'), confirmText: this.i18n.t(action.labelKey),
      });
    } else {
      prompt$ = of(true);
    }
    prompt$.subscribe(r => this.changeStatus(action.status, typeof r === 'string' ? r || null : null));
  }

  private changeStatus(status: TaskStatus, note: string | null): void {
    this.busy.set(true);
    this.api.changeTaskStatus(this.details()!.task.id, status, note).subscribe({
      next: d => {
        this.details.set(d);
        this.progress.set(d.task.progressPercent);
        this.busy.set(false);
        this.toast.success(this.i18n.t('tasks.messages.statusChanged', { status: this.i18n.enum('enums.status', status) }));
        this.loadHistory();
      },
      error: () => this.busy.set(false),
    });
  }

  saveProgress(): void {
    const d = this.details()!;
    if (this.progress() === d.task.progressPercent) return;
    this.busy.set(true);
    this.api.updateTaskProgress(d.task.id, this.progress()).subscribe({
      next: res => {
        this.details.set(res);
        this.busy.set(false);
        this.toast.success(this.i18n.t('tasks.messages.progressUpdated', { value: res.task.progressPercent }));
        this.loadHistory();
      },
      error: () => { this.busy.set(false); this.progress.set(d.task.progressPercent); },
    });
  }

  edit(): void {
    this.dialog.open(TaskFormDialogComponent, { data: { task: this.details() }, width: '720px', maxWidth: '96vw' })
      .afterClosed().subscribe(res => {
        if (res) { this.details.set(res); this.loadHistory(); }
        else this.load(); // 409 conflict closes the dialog without a result â†’ reload latest
      });
  }

  remove(): void {
    const d = this.details()!;
    this.confirm.ask({
      title: this.i18n.t('tasks.details.deleteTitle'), message: this.i18n.t('common.deleteConfirm', { name: d.task.title }),
      danger: true, confirmText: this.i18n.t('common.delete'),
    }).subscribe(() => this.api.deleteTask(d.task.id).subscribe(() => {
      this.toast.success(this.i18n.t('common.deleted'));
      this.router.navigate(['/tasks/my']);
    }));
  }

  addComment(): void {
    const text = this.comment().trim();
    if (!text) return;
    this.busy.set(true);
    this.api.addTaskComment(this.details()!.task.id, text).subscribe({
      next: c => {
        this.details.update(d => (d ? { ...d, comments: [...d.comments, c], task: { ...d.task, commentCount: d.task.commentCount + 1 } } : d));
        this.comment.set('');
        this.busy.set(false);
        this.loadHistory();
      },
      error: () => this.busy.set(false),
    });
  }

  onFile(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
    if (!ALLOWED_EXT.includes(ext)) { this.toast.error(this.i18n.t('tasks.attachments.typeNotAllowed', { ext: ext || '?' })); return; }
    if (file.size === 0 || file.size > MAX_BYTES) { this.toast.error(this.i18n.t('tasks.attachments.tooLarge')); return; }
    this.uploading.set(true);
    this.api.uploadTaskAttachment(this.details()!.task.id, file).subscribe({
      next: a => {
        this.details.update(d => (d ? { ...d, attachments: [...d.attachments, a], task: { ...d.task, attachmentCount: d.task.attachmentCount + 1 } } : d));
        this.uploading.set(false);
        this.toast.success(this.i18n.t('tasks.attachments.uploaded'));
        this.loadHistory();
      },
      error: () => this.uploading.set(false),
    });
  }

  download(a: TaskAttachment): void {
    this.api.downloadTaskAttachment(this.details()!.task.id, a.id).subscribe();
  }

  deleteAttachment(a: TaskAttachment): void {
    this.confirm.ask({
      title: this.i18n.t('tasks.attachments.deleteTitle'), message: this.i18n.t('common.deleteConfirm', { name: a.fileName }),
      danger: true, confirmText: this.i18n.t('common.delete'),
    }).subscribe(() => this.api.deleteTaskAttachment(this.details()!.task.id, a.id).subscribe(() => {
      this.details.update(d => (d ? { ...d, attachments: d.attachments.filter(x => x.id !== a.id), task: { ...d.task, attachmentCount: d.task.attachmentCount - 1 } } : d));
      this.loadHistory();
    }));
  }

  canDeleteAttachment(a: TaskAttachment): boolean {
    return a.uploadedByUserId === this.myUserId() || !!this.details()?.permissions.canEdit;
  }

  fileIcon(name: string): string {
    const ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid_on';
    if (ext === 'zip') return 'folder_zip';
    return 'description';
  }

  historyIcon(action: string): string {
    return HISTORY_ICONS[action] ?? 'history';
  }

  historyLabel(action: string): string {
    return this.i18n.enum('tasks.history.actions', action);
  }
}

