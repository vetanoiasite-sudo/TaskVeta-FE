import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { problemMessage } from '../../core/http';
import { I18nService, TranslatePipe } from '../../core/i18n.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslatePipe],
  template: `
    <div class="login">
      <section class="login__hero">
        <div class="login__brand"><mat-icon>apartment</mat-icon></div>
        <h1>{{ 'app.name' | t }}</h1>
        <p>{{ 'auth.heroText' | t }}</p>
        <ul>
          <li><mat-icon>fingerprint</mat-icon>{{ 'auth.feature1' | t }}</li>
          <li><mat-icon>assignment_turned_in</mat-icon>{{ 'auth.feature2' | t }}</li>
          <li><mat-icon>insights</mat-icon>{{ 'auth.feature3' | t }}</li>
        </ul>
      </section>

      <section class="login__panel">
        <button mat-button class="login__lang" type="button" (click)="i18n.toggle()">
          <mat-icon>translate</mat-icon> {{ i18n.lang() === 'ar' ? 'English' : 'العربية' }}
        </button>
        <form class="login__card" [formGroup]="form" (ngSubmit)="submit()">
          <h2>{{ 'auth.welcome' | t }}</h2>
          <p class="muted">{{ 'auth.signInPrompt' | t }}</p>

          @if (error()) { <div class="alert alert-danger"><mat-icon>error_outline</mat-icon>{{ error() }}</div> }

          <mat-form-field appearance="outline">
            <mat-label>{{ 'auth.email' | t }}</mat-label>
            <mat-icon matPrefix>mail</mat-icon>
            <input matInput formControlName="email" autocomplete="username" type="email" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'auth.password' | t }}</mat-label>
            <mat-icon matPrefix>lock</mat-icon>
            <input matInput formControlName="password" [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" />
            <button mat-icon-button matSuffix type="button" (click)="showPassword.set(!showPassword())">
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </mat-form-field>

          <button mat-flat-button class="login__submit" type="submit" [disabled]="form.invalid || loading()">
            @if (loading()) { <mat-spinner diameter="20" /> } @else { {{ 'auth.signIn' | t }} }
          </button>
        </form>
      </section>
    </div>
  `,
  styles: `
    .login { display: grid; grid-template-columns: 1.1fr 1fr; min-height: 100vh; }
    .login__hero {
      background: radial-gradient(circle at 20% 20%, #1e40af 0, #0f172a 60%); color: #e2e8f0;
      padding: 64px; display: flex; flex-direction: column; justify-content: center; gap: 12px;
      h1 { font-size: 34px; margin: 12px 0 0; color: #fff; }
      p { max-width: 460px; opacity: .8; line-height: 1.6; }
      ul { list-style: none; padding: 0; margin: 20px 0 0; display: grid; gap: 14px; }
      li { display: flex; align-items: center; gap: 12px; font-size: 15px; mat-icon { color: #93c5fd; } }
    }
    .login__brand { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
      background: linear-gradient(135deg, #3b82f6, #6366f1); mat-icon { color: #fff; font-size: 30px; width: 30px; height: 30px; } }
    .login__panel { display: grid; place-items: center; padding: 32px; position: relative; background: var(--app-bg); }
    .login__lang { position: absolute; top: 20px; inset-inline-end: 20px; }
    .login__card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 4px;
      background: var(--surface); padding: 36px 32px; border-radius: 18px; box-shadow: var(--shadow-lg);
      h2 { margin: 0; font-size: 24px; } .muted { margin: 4px 0 20px; } }
    .login__submit { height: 46px; margin-top: 8px; font-size: 15px; mat-spinner { margin: auto; } }
    @media (max-width: 900px) { .login { grid-template-columns: 1fr; } .login__hero { display: none; } }
  `,
})
export class LoginComponent {
  readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: async user => {
        if (user.preferredLanguage === 'ar' || user.preferredLanguage === 'en') {
          if (user.preferredLanguage !== this.i18n.lang()) await this.i18n.use(user.preferredLanguage);
        }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(problemMessage(err, this.i18n));
      },
    });
  }
}


