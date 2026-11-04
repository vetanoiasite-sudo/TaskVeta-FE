import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { ProblemDetails } from './models';
import { ToastService } from './toast.service';
import { I18nService } from './i18n.service';

/** Set to true on a request to suppress the global error toast (the caller handles the error). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Attaches the JWT and transparently refreshes it once on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith('/api/')) return next(req);

  return next(withToken(req, auth.token)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || req.url.startsWith('/api/auth/')) {
        return throwError(() => err);
      }
      return auth.refreshToken().pipe(
        switchMap(token => next(withToken(req, token))),
        catchError(refreshErr => {
          if (refreshErr instanceof HttpErrorResponse && (refreshErr.status === 401 || refreshErr.status === 400)) auth.sessionExpired();
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};

/** Shows a toast for failed API calls using the server's ProblemDetails message. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const i18n = inject(I18nService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && !req.context.get(SKIP_ERROR_TOAST) && err.status !== 401) {
        toast.error(problemMessage(err, i18n));
      }
      return throwError(() => err);
    }),
  );
};

export function problemMessage(err: unknown, i18n?: I18nService): string {
  const t = (k: string, fallback: string) => (i18n ? i18n.t(k) : fallback);
  if (!(err instanceof HttpErrorResponse)) return t('errors.unexpected', 'Unexpected error');
  if (err.status === 0) return t('errors.network', 'Cannot reach the server.');
  if (err.status === 429) return t('errors.tooMany', 'Too many requests. Please wait a moment.');
  const pd = (typeof err.error === 'object' ? err.error : null) as ProblemDetails | null;
  if (pd?.errors) {
    const first = Object.values(pd.errors).flat()[0];
    if (first) return first;
  }
  if (pd?.detail) return pd.detail;
  if (err.status === 403) return t('errors.forbidden', 'You do not have permission to do that.');
  if (err.status === 404) return t('errors.notFound', 'Not found.');
  return t('errors.unexpected', 'Unexpected error');
}

/** Field-level validation errors from a 400 ProblemDetails response, keyed by camelCase property name. */
export function validationErrors(err: unknown): Record<string, string[]> {
  if (err instanceof HttpErrorResponse && err.status === 400 && typeof err.error === 'object') {
    return (err.error as ProblemDetails).errors ?? {};
  }
  return {};
}

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;
};

/** Route guard: `canActivate: [permissionGuard], data: { permissions: [Perm.X, Perm.Y] }` (any of). */
export const permissionGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const required = (route.data?.['permissions'] as string[] | undefined) ?? [];
  if (auth.hasAny(required)) return true;
  inject(ToastService).error(inject(I18nService).t('errors.forbidden'));
  return inject(Router).createUrlTree(['/']);
};
