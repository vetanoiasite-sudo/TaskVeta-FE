import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
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
import { TaskAttachment, TaskComment, TaskDetails, TaskHistory, TaskParticipant, TaskStatus } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent, ConfirmService, EmptyStateComponent, LoadingBarComponent, StatusChipComponent } from '../../shared/ui';
import { TaskFormDialogComponent } from './task-form.dialog';
import { StatusAction, statusAction } from './task-shared';
import { openTaskReview } from './task-review.dialog';

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.zip'];
const MAX_BYTES = 10 * 1024 * 1024;
/** Piece of a comment: plain text or an @mention. */
interface CommentPart { text: string; mention: boolean; }

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  // ---- @mentions
  private readonly commentBox = viewChild<ElementRef<HTMLTextAreaElement>>('commentBox');
  /** Text typed after "@" (null = suggestion list closed). */
  readonly mentionQuery = signal<string | null>(null);
  readonly mentionIndex = signal(0);
  private mentionStart = -1;
  /** People picked from the list in the comment being written. */
  private readonly picked = signal<TaskParticipant[]>([]);
  readonly mentionOptions = computed(() => {
    const q = this.mentionQuery();
    if (q === null) return [];
    const term = q.trim().toLowerCase();
    return (this.details()?.participants ?? [])
      .filter(p => p.userId !== this.myUserId() && (!term || p.name.toLowerCase().includes(term)))
      .slice(0, 8);
  });
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
        this.markSeen(d.task.id);
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
    if (action.status === 'Completed' || action.status === 'Rejected') {
      // Head / leader review: approve with a 1–10 rating, or reject with notes.
      openTaskReview(this.dialog, d.task.title, action.status === 'Completed')
        .subscribe(r => this.changeStatus(action.status, r.note, r.rating));
      return;
    }
    if (action.requiresNote) {
      prompt$ = this.confirm.ask({
        title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.rejectPrompt', { title: d.task.title }),
        inputLabel: this.i18n.t('common.reason'), inputRequired: true, danger: true, confirmText: this.i18n.t(action.labelKey),
      });
    } else if (action.status === 'Cancelled') {
      prompt$ = this.confirm.ask({ title: this.i18n.t(action.labelKey), message: this.i18n.t('tasks.details.cancelPrompt'), danger: true });
    } else {
      prompt$ = of(true);
    }
    prompt$.subscribe(r => this.changeStatus(action.status, typeof r === 'string' ? r || null : null));
  }

  private changeStatus(status: TaskStatus, note: string | null, rating: number | null = null): void {
    this.busy.set(true);
    this.api.changeTaskStatus(this.details()!.task.id, status, note, null, rating).subscribe({
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

  /** Records the read receipt and reflects it locally (the details were loaded just before). */
  private markSeen(taskId: number): void {
    this.api.markTaskSeen(taskId).subscribe(() => this.touchMyView());
  }

  private touchMyView(): void {
    const me = this.myUserId(), now = new Date().toISOString();
    this.details.update(d => d ? {
      ...d, participants: d.participants.map(p => p.userId === me ? { ...p, firstSeenAt: p.firstSeenAt ?? now, lastSeenAt: now } : p),
    } : d);
  }

  // ---- @mentions: typing "@" opens a list of the task's people; picking one inserts "@Name ".

  onCommentInput(value: string, box: HTMLTextAreaElement): void {
    this.comment.set(value);
    const caret = box.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const query = at >= 0 ? before.slice(at + 1) : '';
    const startsWord = at === 0 || (at > 0 && /\s/.test(before[at - 1]));
    if (at >= 0 && startsWord && query.length <= 40 && !query.includes('\n') && !/\s{2}/.test(query)) {
      this.mentionStart = at;
      this.mentionQuery.set(query);
      this.mentionIndex.set(0);
    } else {
      this.closeMentions();
    }
  }

  onCommentKeydown(event: KeyboardEvent): void {
    const options = this.mentionOptions();
    if (this.mentionQuery() === null || !options.length) {
      if (event.key === 'Escape') this.closeMentions();
      return;
    }
    switch (event.key) {
      case 'ArrowDown': this.mentionIndex.update(i => (i + 1) % options.length); break;
      case 'ArrowUp': this.mentionIndex.update(i => (i - 1 + options.length) % options.length); break;
      case 'Enter': case 'Tab': this.pickMention(options[this.mentionIndex()]); break;
      case 'Escape': this.closeMentions(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  pickMention(p: TaskParticipant): void {
    const box = this.commentBox()?.nativeElement;
    const value = this.comment();
    const caret = box?.selectionStart ?? value.length;
    const insert = `@${p.name} `;
    const next = value.slice(0, this.mentionStart) + insert + value.slice(caret);
    const pos = this.mentionStart + insert.length; // before closeMentions() resets mentionStart
    this.comment.set(next);
    if (!this.picked().some(x => x.userId === p.userId)) this.picked.update(list => [...list, p]);
    this.closeMentions();
    this.writeBox(box, next, pos);
  }

  /** Opens the list from the "@" button. */
  startMention(): void {
    const box = this.commentBox()?.nativeElement;
    const value = this.comment();
    const caret = box?.selectionStart ?? value.length;
    const prefix = caret > 0 && !/\s/.test(value[caret - 1]) ? ' @' : '@';
    const next = value.slice(0, caret) + prefix + value.slice(caret);
    this.comment.set(next);
    this.mentionStart = caret + prefix.length - 1;
    this.mentionQuery.set('');
    this.mentionIndex.set(0);
    this.writeBox(box, next, caret + prefix.length);
  }

  /**
   * Puts the text in the box right away: ngModel writes it a tick later, and a fast typist would overwrite it. (ngModel's later
   * write is the same value, which leaves the caret where it is.)
   */
  private writeBox(box: HTMLTextAreaElement | undefined, value: string, caret: number): void {
    if (!box) return;
    box.value = value;
    box.focus();
    box.setSelectionRange(caret, caret);
  }

  closeMentions(): void {
    this.mentionQuery.set(null);
    this.mentionStart = -1;
  }

  /** Splits a comment into text and highlighted @mentions of the people it mentioned. */
  commentParts(c: TaskComment): CommentPart[] {
    const names = (this.details()?.participants ?? []).filter(p => c.mentionedUserIds?.includes(p.userId)).map(p => p.name);
    if (!names.length) return [{ text: c.content, mention: false }];
    const re = new RegExp(`(${names.sort((a, b) => b.length - a.length).map(n => '@' + escapeRegex(n)).join('|')})`, 'g');
    return c.content.split(re).filter(Boolean).map(text => ({ text, mention: names.some(n => text === '@' + n) }));
  }

  // ---- read receipts

  participantFor(employeeId: number): TaskParticipant | undefined {
    return this.details()?.participants.find(p => p.employeeId === employeeId);
  }

  /**
   * Who a comment is for and which of them opened the task after it was posted. A comment that @mentions people is
   * addressed to them only (WhatsApp-style ticks follow the mentioned people); otherwise to everyone in the task but the author.
   */
  seenBy(c: TaskComment): { seen: TaskParticipant[]; pending: TaskParticipant[]; total: number } {
    const people = this.details()?.participants ?? [];
    const mentioned = people.filter(p => c.mentionedUserIds?.includes(p.userId) && p.userId !== c.userId);
    const audience = mentioned.length ? mentioned : people.filter(p => p.userId !== c.userId);
    const at = new Date(c.createdAt).getTime();
    const seen = audience.filter(p => p.lastSeenAt && new Date(p.lastSeenAt).getTime() >= at);
    return { seen, pending: audience.filter(p => !seen.includes(p)), total: audience.length };
  }

  addComment(): void {
    const text = this.comment().trim();
    if (!text) return;
    const mentioned = this.picked().filter(p => text.includes('@' + p.name)).map(p => p.userId);
    this.busy.set(true);
    this.closeMentions();
    this.api.addTaskComment(this.details()!.task.id, text, mentioned).subscribe({
      next: c => {
        this.details.update(d => (d ? { ...d, comments: [...d.comments, c], task: { ...d.task, commentCount: d.task.commentCount + 1 } } : d));
        this.touchMyView();
        this.picked.set([]);
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

