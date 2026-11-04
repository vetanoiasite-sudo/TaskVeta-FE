import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { I18nService } from './i18n.service';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snack = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  success(message: string): void {
    this.open(message, 'toast-success', 3500);
  }

  error(message: string): void {
    this.open(message, 'toast-error', 6000);
  }

  info(message: string): void {
    this.open(message, 'toast-info', 4000);
  }

  private open(message: string, panelClass: string, duration: number): void {
    this.snack.open(message, this.i18n.t('common.close'), {
      duration, panelClass: [panelClass], horizontalPosition: 'end', verticalPosition: 'bottom',
      direction: this.i18n.dir(),
    });
  }
}
