import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor, errorInterceptor } from './core/http';
import { I18nService } from './core/i18n.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideNativeDateAdapter(),
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    // Load translations and restore the session (refresh cookie) before the first route activates.
    provideAppInitializer(async () => {
      const i18n = inject(I18nService);
      const auth = inject(AuthService);
      await Promise.all([i18n.init(), auth.restoreSession()]);
    }),
  ],
};
