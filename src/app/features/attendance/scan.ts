import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { WallTimePipe } from '../../core/format';
import { problemMessage } from '../../core/http';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { AttendanceRecord, MyAttendanceStatus } from '../../core/models';
import { CheckKind, performCheck } from './check';
import { GeoError } from './geo';

/** Landing page opened by scanning the kiosk QR code (/attendance/scan?t=TOKEN). */
@Component({
  selector: 'app-attendance-scan',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, RouterLink, TranslatePipe, WallTimePipe],
  template: `
    <div class="scan card">
      <mat-icon class="scan__icon">qr_code_scanner</mat-icon>
      <h1>{{ 'attendance.scan.title' | t }}</h1>

      @if (!token) {
        <div class="alert alert-warning"><mat-icon>warning</mat-icon>{{ 'attendance.scan.noToken' | t }}</div>
      } @else if (done(); as r) {
        <div class="alert alert-success"><mat-icon>check_circle</mat-icon>
          {{ (r.checkOutTime ? 'attendance.scan.doneOut' : 'attendance.scan.doneIn') | t: { time: ((r.checkOutTime ?? r.checkInTime) | wallTime) } }}
        </div>
      } @else if (status(); as s) {
        <p class="muted">{{ 'attendance.scan.prompt' | t }}</p>
        @if (error()) { <div class="alert alert-danger"><mat-icon>gpp_bad</mat-icon>{{ error() }}</div> }
        <div class="scan__actions">
          @if (s.canCheckIn) {
            <button mat-flat-button class="big in" [disabled]="!!busy()" (click)="check('in')">
              @if (busy()) { <mat-spinner diameter="22" /> } @else { <mat-icon>login</mat-icon> } {{ 'attendance.checkIn' | t }}
            </button>
          }
          @if (s.canCheckOut) {
            <button mat-flat-button class="big out" [disabled]="!!busy()" (click)="check('out')">
              @if (busy()) { <mat-spinner diameter="22" /> } @else { <mat-icon>logout</mat-icon> } {{ 'attendance.checkOut' | t }}
            </button>
          }
          @if (!s.canCheckIn && !s.canCheckOut) { <div class="alert alert-info">{{ 'attendance.scan.nothing' | t }}</div> }
        </div>
        <p class="muted small">{{ 'attendance.scan.expiry' | t: { s: secondsLeft() } }}</p>
      } @else {
        <mat-spinner diameter="32" />
      }

      <a mat-button routerLink="/attendance/my">{{ 'attendance.scan.goToMy' | t }}</a>
    </div>
  `,
  styles: `
    .scan { max-width: 460px; margin: 32px auto; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
    .scan__icon { font-size: 52px; width: 52px; height: 52px; color: var(--primary); }
    h1 { margin: 0; font-size: 22px; }
    .scan__actions { display: flex; flex-direction: column; gap: 12px; width: 100%; }
    .big { height: 60px; font-size: 17px; border-radius: 14px; mat-spinner { display: inline-block; margin-inline-end: 8px; } }
    .big.in:not(:disabled) { background: var(--success); color: #fff; }
    .big.out:not(:disabled) { background: var(--danger); color: #fff; }
    .small { font-size: 12px; }
  `,
})
export class ScanComponent {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('t');

  readonly status = signal<MyAttendanceStatus | null>(null);
  readonly busy = signal<CheckKind | null>(null);
  readonly error = signal<string | null>(null);
  readonly done = signal<AttendanceRecord | null>(null);
  private readonly openedAt = Date.now();
  private readonly tick = signal(Date.now());
  readonly secondsLeft = computed(() => Math.max(0, 60 - Math.round((this.tick() - this.openedAt) / 1000)));

  constructor() {
    if (this.token) this.api.myAttendanceStatus().subscribe(s => this.status.set(s));
    const timer = setInterval(() => this.tick.set(Date.now()), 1000);
    setTimeout(() => clearInterval(timer), 65_000);
  }

  async check(kind: CheckKind): Promise<void> {
    const s = this.status();
    if (!s || !this.token) return;
    this.busy.set(kind);
    this.error.set(null);
    try {
      this.done.set(await performCheck(this.api, kind, s.verification, { qrToken: this.token }));
    } catch (e) {
      const msg = e instanceof GeoError ? this.i18n.t(e.message) : problemMessage(e, this.i18n);
      this.error.set(this.secondsLeft() === 0 ? this.i18n.t('attendance.scan.expired') : msg);
    } finally {
      this.busy.set(null);
    }
  }
}
