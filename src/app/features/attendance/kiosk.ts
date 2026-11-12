import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { QrCode } from '../../core/models';

/** Full-screen entrance display showing the rotating attendance QR code. */
@Component({
  selector: 'app-kiosk',
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslatePipe],
  template: `
    <div class="kiosk">
      <header>
        <div class="brand"><mat-icon>apartment</mat-icon><strong>{{ company() }}</strong></div>
        <div class="tools">
          <button mat-button (click)="i18n.toggle()"><mat-icon>translate</mat-icon>{{ i18n.lang() === 'ar' ? 'English' : 'العربية' }}</button>
          <a mat-button routerLink="/"><mat-icon>close</mat-icon>{{ 'attendance.kiosk.exit' | t }}</a>
        </div>
      </header>

      <main>
        <div class="clock">
          <span class="time">{{ time() }}</span>
          <span class="date">{{ date() }}</span>
        </div>

        @if (disabled()) {
          <div class="panel">
            <mat-icon class="warn">qr_code_2</mat-icon>
            <h2>{{ 'attendance.kiosk.disabled' | t }}</h2>
            <p>{{ 'attendance.kiosk.disabledHint' | t }}</p>
            <a mat-flat-button routerLink="/admin/settings">{{ 'nav.settings' | t }}</a>
          </div>
        } @else if (qr(); as q) {
          <div class="panel">
            <h2>{{ 'attendance.kiosk.scan' | t }}</h2>
            <img [src]="'data:image/png;base64,' + q.pngBase64" alt="QR" />
            <div class="countdown"><div class="countdown__fill" [style.width.%]="progress()"></div></div>
            <p>{{ 'attendance.kiosk.refreshIn' | t: { s: secondsLeft() } }}</p>
          </div>
        } @else {
          <div class="panel"><p>{{ 'common.loading' | t }}</p></div>
        }
        @if (offline()) { <p class="offline"><mat-icon>wifi_off</mat-icon>{{ 'attendance.kiosk.offline' | t }}</p> }
      </main>
    </div>
  `,
  styles: `
    .kiosk { min-height: 100vh; display: flex; flex-direction: column; color: var(--hero-fg);
      background: var(--hero-bg); }
    header { display: flex; justify-content: space-between; align-items: center; padding: 18px 28px;
      button, a { color: var(--highlight); } }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 20px; mat-icon { color: var(--highlight); } }
    main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; padding: 16px; }
    .clock { display: flex; flex-direction: column; align-items: center; .time { font-size: 64px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .date { opacity: .75; font-size: 18px; } }
    .panel { background: #fff; color: var(--text); border-radius: 28px; padding: 32px 40px; display: flex; flex-direction: column;
      align-items: center; gap: 14px; box-shadow: 0 30px 80px rgba(0,0,0,.35); text-align: center; max-width: 92vw;
      h2 { margin: 0; } img { width: min(420px, 70vw); height: auto; image-rendering: pixelated; } p { margin: 0; color: var(--text-muted); } }
    .warn { font-size: 64px; width: 64px; height: 64px; color: var(--warning); }
    .countdown { width: 100%; height: 8px; background: var(--neutral-soft); border-radius: 999px; overflow: hidden; }
    .countdown__fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--primary)); transition: width 1s linear; }
    .offline { display: flex; gap: 8px; align-items: center; color: #f4a6b2; }
  `,
})
export class KioskComponent {
  readonly i18n = inject(I18nService);
  private readonly api = inject(ApiService);

  readonly qr = signal<QrCode | null>(null);
  readonly disabled = signal(false);
  readonly offline = signal(false);
  readonly company = signal('');
  readonly now = signal(Date.now());
  private fetching = false;
  private lastFailure = 0;

  readonly time = computed(() => new Date(this.now()).toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  readonly date = computed(() => new Date(this.now()).toLocaleDateString(this.i18n.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  readonly secondsLeft = computed(() => {
    const q = this.qr();
    return q ? Math.max(0, Math.ceil((new Date(q.expiresAt).getTime() - this.now()) / 1000)) : 0;
  });
  readonly progress = computed(() => {
    const q = this.qr();
    return q ? Math.min(100, (this.secondsLeft() / q.rotationSeconds) * 100) : 0;
  });

  constructor() {
    this.api.publicSettings().subscribe({ next: s => this.company.set(s.companyName), error: () => undefined });
    this.fetch();
    const timer = setInterval(() => {
      this.now.set(Date.now());
      const q = this.qr();
      if (!this.disabled() && (!q || this.secondsLeft() <= 0)) this.fetch();
    }, 1000);
    const retry = setInterval(() => { if (this.disabled()) { this.lastFailure = 0; this.disabled.set(false); this.fetch(); } }, 60_000);
    inject(DestroyRef).onDestroy(() => { clearInterval(timer); clearInterval(retry); });
  }

  private fetch(): void {
    if (this.fetching || Date.now() - this.lastFailure < 10_000) return;
    this.fetching = true;
    this.api.kioskQr().subscribe({
      next: q => { this.qr.set(q); this.offline.set(false); this.disabled.set(false); this.fetching = false; },
      error: (e: unknown) => {
        this.fetching = false;
        this.lastFailure = Date.now();
        if (e instanceof HttpErrorResponse && e.status === 400) this.disabled.set(true);
        else this.offline.set(true);
      },
    });
  }
}


