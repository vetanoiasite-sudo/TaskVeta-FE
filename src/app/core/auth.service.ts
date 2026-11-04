import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';
import { AuthResponse, CurrentUser } from './models';

/**
 * Authentication state.
 * - The access token lives only in memory (never in localStorage) to limit XSS exposure.
 * - The refresh token is an HttpOnly cookie managed by the server; it is rotated on every refresh.
 * - Refreshes are de-duplicated so concurrent 401s never present the same refresh token twice
 *   (the server treats reuse of a rotated token as theft and revokes the session).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = new HttpClient(inject(HttpBackend)); // bypasses the auth interceptor
  private readonly router = inject(Router);

  private readonly _user = signal<CurrentUser | null>(null);
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private refresh$?: Observable<string>;

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly permissions = computed(() => new Set(this._user()?.permissions ?? []));
  readonly roles = computed(() => new Set(this._user()?.roles ?? []));

  get token(): string | null {
    return this.accessToken;
  }

  hasPermission(permission: string): boolean {
    return this.permissions().has(permission);
  }

  hasAny(permissions: readonly string[]): boolean {
    const set = this.permissions();
    return permissions.length === 0 || permissions.some(p => set.has(p));
  }

  isInRole(role: string): boolean {
    return this.roles().has(role);
  }

  login(email: string, password: string): Observable<CurrentUser> {
    return this.http.post<AuthResponse>('/api/auth/login', { email, password }, { withCredentials: true }).pipe(
      tap(res => this.applyAuth(res)),
      map(res => res.user),
    );
  }

  /** Attempts to restore a session from the refresh cookie (called on app start). */
  async restoreSession(): Promise<void> {
    await firstValueFrom(this.refreshToken().pipe(catchError(() => of(null))));
  }

  /** Returns a fresh access token, sharing a single in-flight request between callers. */
  refreshToken(): Observable<string> {
    if (!this.refresh$) {
      this.refresh$ = this.http.post<AuthResponse>('/api/auth/refresh-token', {}, { withCredentials: true }).pipe(
        tap(res => this.applyAuth(res)),
        map(res => res.accessToken),
        catchError(err => {
          // Only an explicit rejection ends the session; network errors / 429 keep the current state.
          if (err?.status === 401 || err?.status === 400) this.clear();
          return throwError(() => err);
        }),
        finalize(() => (this.refresh$ = undefined)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refresh$;
  }

  logout(navigate = true): void {
    this.http.post('/api/auth/logout', {}, { withCredentials: true }).pipe(catchError(() => of(null))).subscribe();
    this.clear();
    if (navigate) this.router.navigate(['/login']);
  }

  /** Called when the session cannot be recovered (refresh failed). */
  sessionExpired(): void {
    this.clear();
    const returnUrl = this.router.url.startsWith('/login') ? undefined : this.router.url;
    this.router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : undefined });
  }

  updateUser(patch: Partial<CurrentUser>): void {
    const u = this._user();
    if (u) this._user.set({ ...u, ...patch });
  }

  private applyAuth(res: AuthResponse): void {
    this.accessToken = res.accessToken;
    this.expiresAt = new Date(res.expiresAt).getTime();
    this._user.set(res.user);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimer);
    // Refresh one minute before expiry (minimum 10 s from now).
    const delay = Math.max(10_000, this.expiresAt - Date.now() - 60_000);
    this.refreshTimer = setTimeout(() => this.refreshToken().subscribe({
      error: err => (err?.status === 401 || err?.status === 400 ? this.sessionExpired() : this.retryRefreshSoon()),
    }), delay);
  }

  private retryRefreshSoon(): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshToken().subscribe({ error: () => undefined }), 15_000);
  }

  private clear(): void {
    clearTimeout(this.refreshTimer);
    this.accessToken = null;
    this.expiresAt = 0;
    this._user.set(null);
  }
}
