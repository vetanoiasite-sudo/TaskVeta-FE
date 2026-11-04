import { Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TaskAssignee, TaskStatus } from '../../core/models';
import { AvatarComponent } from '../../shared/ui';

export interface StatusAction {
  status: TaskStatus;
  labelKey: string;
  icon: string;
  tone: 'primary' | 'success' | 'danger' | 'neutral';
  requiresNote: boolean;
}

/** Friendly label for moving a task from one status to another. */
export function statusAction(from: TaskStatus, to: TaskStatus): StatusAction {
  switch (to) {
    case 'InProgress':
      return {
        status: to, icon: from === 'New' || from === 'Assigned' ? 'play_arrow' : 'replay', tone: 'primary', requiresNote: false,
        labelKey: from === 'New' || from === 'Assigned' ? 'tasks.actions.start'
          : from === 'Completed' ? 'tasks.actions.reopen' : 'tasks.actions.resume',
      };
    case 'PendingReview':
      return { status: to, labelKey: 'tasks.actions.submit', icon: 'send', tone: 'primary', requiresNote: false };
    case 'Completed':
      return { status: to, labelKey: 'tasks.actions.approve', icon: 'task_alt', tone: 'success', requiresNote: false };
    case 'Rejected':
      return { status: to, labelKey: 'tasks.actions.reject', icon: 'block', tone: 'danger', requiresNote: true };
    case 'Cancelled':
      return { status: to, labelKey: 'tasks.actions.cancel', icon: 'cancel', tone: 'danger', requiresNote: false };
    case 'Assigned':
      return { status: to, labelKey: from === 'Cancelled' ? 'tasks.actions.restore' : 'tasks.actions.markAssigned', icon: 'assignment_ind', tone: 'neutral', requiresNote: false };
    default:
      return { status: to, labelKey: 'enums.status.' + to, icon: 'sync_alt', tone: 'neutral', requiresNote: false };
  }
}

/** Overlapping avatars for a task's assignees. */
@Component({
  selector: 'app-assignee-stack',
  imports: [AvatarComponent, MatTooltipModule],
  template: `
    <span class="stack" [matTooltip]="names()">
      @for (a of assignees().slice(0, max()); track a.employeeId) {
        <app-avatar [name]="a.fullName" [size]="size()" />
      }
      @if (assignees().length > max()) { <span class="more" [style.height.px]="size()" [style.min-width.px]="size()">+{{ assignees().length - max() }}</span> }
    </span>
  `,
  styles: `
    .stack { display: inline-flex; align-items: center; }
    .stack > * { margin-inline-start: -8px; border: 2px solid var(--surface); border-radius: 50%; }
    .stack > *:first-child { margin-inline-start: 0; }
    .more { display: inline-grid; place-items: center; background: #e2e8f0; color: #475569; font-size: 11px; font-weight: 600; padding: 0 4px; box-sizing: border-box; }
  `,
})
export class AssigneeStackComponent {
  readonly assignees = input<TaskAssignee[]>([]);
  readonly max = input(3);
  readonly size = input(28);
  names(): string {
    return this.assignees().map(a => a.fullName).join(', ');
  }
}

/** Convert a Date + "HH:mm" into an ISO UTC string. */
export function combineDateTime(date: Date | null, time: string | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const [h, m] = (time || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function timeOf(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
