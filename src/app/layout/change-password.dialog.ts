import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { I18nService, TranslatePipe } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-change-password-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'auth.changePassword' | t }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content class="form-col">
        <mat-form-field appearance="outline">
          <mat-label>{{ 'auth.currentPassword' | t }}</mat-label>
          <input matInput type="password" formControlName="currentPassword" autocomplete="current-password" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>{{ 'auth.newPassword' | t }}</mat-label>
          <input matInput type="password" formControlName="newPassword" autocomplete="new-password" />
          <mat-hint>{{ 'auth.passwordHint' | t }}</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | t }}</button>
        <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">{{ 'common.save' | t }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ChangePasswordDialogComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly ref = inject(MatDialogRef<ChangePasswordDialogComponent>);
  readonly saving = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
  });

  save(): void {
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.saving.set(true);
    this.api.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.toast.success(this.i18n.t('auth.passwordChanged'));
        this.ref.close();
        this.auth.logout(); // all sessions are revoked server-side
      },
      error: () => this.saving.set(false),
    });
  }
}
