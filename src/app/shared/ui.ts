import { NgClass } from '@angular/common';
import { Component, Injectable, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Observable, filter } from 'rxjs';
import { I18nService, TranslateEnumPipe, TranslatePipe } from '../core/i18n.service';


// ---------------------------------------------------------------- page header

@Component({
  selector: 'app-page-header',
  imports: [MatIconModule],
  template: `
    <header class="page-header">
      <div class="page-header__text">
        <h1>
          @if (icon()) { <mat-icon class="page-header__icon">{{ icon() }}</mat-icon> }
          {{ title() }}
        </h1>
        @if (subtitle()) { <p>{{ subtitle() }}</p> }
      </div>
      <div class="page-header__actions"><ng-content /></div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly icon = input<string | null>(null);
}

// ---------------------------------------------------------------- stat card

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

@Component({
  selector: 'app-stat-card',
  imports: [MatIconModule, NgClass],
  template: `
    <div class="stat-card" [ngClass]="'tone-' + tone()" [class.clickable]="clickable()" (click)="clickable() && pressed.emit()">
      <div class="stat-card__icon"><mat-icon>{{ icon() }}</mat-icon></div>
      <div class="stat-card__body">
        <span class="stat-card__label">{{ label() }}</span>
        <span class="stat-card__value">{{ value() }}</span>
        @if (hint()) { <span class="stat-card__hint">{{ hint() }}</span> }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input('insights');
  readonly tone = input<Tone>('primary');
  readonly hint = input<string | null>(null);
  readonly clickable = input(false);
  readonly pressed = output<void>();
}

// ---------------------------------------------------------------- status chip

const TONES: Record<string, Tone> = {
  // attendance status
  Present: 'success', Late: 'warning', Absent: 'danger', HalfDay: 'warning', EarlyLeave: 'warning', OnLeave: 'info',
  Holiday: 'purple', WorkFromHome: 'info',
  // daily state
  Inside: 'success', CheckedOut: 'neutral', MissingCheckOut: 'danger', Weekend: 'neutral', Upcoming: 'neutral', NotArrived: 'warning',
  NotCheckedIn: 'warning', PendingLeave: 'info',
  // task status
  New: 'neutral', Assigned: 'info', InProgress: 'primary', PendingReview: 'purple', Completed: 'success', Rejected: 'danger', Cancelled: 'neutral',
  // project status
  Planned: 'info', Active: 'primary', OnHold: 'warning',
  // priority
  Low: 'neutral', Medium: 'info', High: 'warning', Urgent: 'danger',
  // leave
  Pending: 'warning', Approved: 'success',
};

@Component({
  selector: 'app-status-chip',
  imports: [NgClass, TranslateEnumPipe],
  template: `<span class="chip" [ngClass]="'tone-' + toneClass()">{{ value() | te: prefix() }}</span>`,
})
export class StatusChipComponent {
  readonly value = input.required<string | null | undefined>();
  /** Translation prefix, e.g. "enums.attendanceStatus". */
  readonly prefix = input('enums.status');
  readonly tone = input<Tone | null>(null);
  readonly toneClass = computed(() => this.tone() ?? TONES[this.value() ?? ''] ?? 'neutral');
}

// ---------------------------------------------------------------- empty state & loading

@Component({
  selector: 'app-empty-state',
  imports: [MatIconModule],
  template: `
    <div class="empty-state">
      <mat-icon>{{ icon() }}</mat-icon>
      <p>{{ message() }}</p>
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly message = input.required<string>();
}

@Component({
  selector: 'app-loading-bar',
  imports: [MatProgressBarModule],
  template: `@if (loading()) { <mat-progress-bar mode="indeterminate" class="loading-bar" /> } @else { <div class="loading-bar-placeholder"></div> }`,
})
export class LoadingBarComponent {
  readonly loading = input(false);
}

// ---------------------------------------------------------------- confirm dialog

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  /** When set, a text field is shown and its value is returned. */
  inputLabel?: string;
  inputRequired?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="confirm-message">{{ data.message }}</p>
      @if (data.inputLabel) {
        <mat-form-field appearance="outline" class="w-100">
          <mat-label>{{ data.inputLabel }}</mat-label>
          <textarea matInput rows="3" [(ngModel)]="text" maxlength="1000"></textarea>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | t }}</button>
      <button mat-flat-button [class.btn-danger]="data.danger" [disabled]="data.inputRequired && !text.trim()"
              (click)="ref.close(data.inputLabel ? text.trim() : true)">
        {{ data.confirmText ?? ('common.confirm' | t) }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmOptions>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ConfirmDialogComponent>);
  text = '';
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  /** Emits true / the entered text when confirmed; emits nothing on cancel. */
  ask(options: ConfirmOptions): Observable<string | true> {
    return this.dialog.open(ConfirmDialogComponent, { data: options, width: '440px', autoFocus: false })
      .afterClosed()
      .pipe(filter((r): r is string | true => r !== undefined && r !== false && r !== null));
  }
}

// ---------------------------------------------------------------- export menu

@Component({
  selector: 'app-export-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, TranslatePipe],
  template: `
    <button mat-stroked-button [matMenuTriggerFor]="menu" [disabled]="disabled()">
      <mat-icon>download</mat-icon> {{ 'common.export' | t }}
    </button>
    <mat-menu #menu="matMenu">
      <button mat-menu-item (click)="export.emit('xlsx')"><mat-icon>grid_on</mat-icon> Excel (.xlsx)</button>
      <button mat-menu-item (click)="export.emit('pdf')"><mat-icon>picture_as_pdf</mat-icon> PDF</button>
    </mat-menu>
  `,
})
export class ExportMenuComponent {
  readonly disabled = input(false);
  readonly export = output<'xlsx' | 'pdf'>();
}

// ---------------------------------------------------------------- avatar

@Component({
  selector: 'app-avatar',
  template: `<span class="avatar" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()"
                   [style.font-size.px]="size() * 0.4">{{ initials() }}</span>`,
})
export class AvatarComponent {
  readonly name = input<string | null | undefined>('');
  readonly size = input(32);
  readonly initials = computed(() => (this.name() ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase());
  readonly color = computed(() => {
    let h = 0;
    for (const c of this.name() ?? '') h = (h * 31 + c.charCodeAt(0)) % 360;
    // Varied, medium-saturation colours (Facebook-style initials avatars) that keep white text readable.
    return `hsl(${h} ${45 + (h % 3) * 8}% ${38 + (h % 4) * 3}%)`;
  });
}

/** Debounces a value change; used by search boxes. */
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms = 350): (...args: T) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


