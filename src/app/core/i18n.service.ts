import { Directionality, Direction } from '@angular/cdk/bidi';
import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, Pipe, PipeTransform, WritableSignal, computed, inject, signal } from '@angular/core';
import { DateAdapter } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';

export type Lang = 'en' | 'ar';
type Dict = Record<string, unknown>;

/** Translation namespaces; each feature owns one JSON file per language under /public/i18n/{lang}/{ns}.json. */
const NAMESPACES = ['common', 'attendance', 'tasks', 'admin'] as const;
const STORAGE_KEY = 'cm.lang';

/**
 * Runtime i18n with Arabic/English switching and RTL support.
 * Uses HttpBackend so loading translations bypasses the auth interceptor.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly document = inject(DOCUMENT);
  private readonly directionality = inject(Directionality);
  private readonly dateAdapter = inject(DateAdapter, { optional: true });
  private readonly cache = new Map<Lang, Dict>();

  readonly lang = signal<Lang>(this.initialLang());
  readonly dir = computed<Direction>(() => (this.lang() === 'ar' ? 'rtl' : 'ltr'));
  readonly locale = computed(() => (this.lang() === 'ar' ? 'ar-EG' : 'en-GB'));
  private readonly dict = signal<Dict>({});

  async init(): Promise<void> {
    await this.use(this.lang());
  }

  async use(lang: Lang): Promise<void> {
    if (!this.cache.has(lang)) {
      const parts = await Promise.all(
        NAMESPACES.map(ns =>
          firstValueFrom(this.http.get<Dict>(`/i18n/${lang}/${ns}.json`)).catch(() => ({}) as Dict),
        ),
      );
      this.cache.set(lang, Object.assign({}, ...parts));
    }
    this.dict.set(this.cache.get(lang)!);
    this.lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);

    const dir: Direction = lang === 'ar' ? 'rtl' : 'ltr';
    const html = this.document.documentElement;
    html.lang = lang;
    html.dir = dir;
    // Propagate to CDK/Material (menus, dialogs, overlays) without a reload.
    (this.directionality.valueSignal as WritableSignal<Direction>).set(dir);
    this.directionality.change.emit(dir);
    this.dateAdapter?.setLocale(this.locale());
  }

  toggle(): Promise<void> {
    return this.use(this.lang() === 'ar' ? 'en' : 'ar');
  }

  /** Translates a dotted key, e.g. "attendance.checkIn". Supports {{param}} interpolation. Falls back to the key. */
  t(key: string, params?: Record<string, unknown>): string {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], this.dict());
    let text = typeof value === 'string' ? value : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{{${k}}}`, String(v ?? ''));
    }
    return text;
  }

  /** Translates an enum value with a prefix, falling back to a humanized value ("InProgress" → "In Progress"). */
  enum(prefix: string, value: string | null | undefined): string {
    if (!value) return '';
    const key = `${prefix}.${value}`;
    const translated = this.t(key);
    return translated === key ? value.replace(/([a-z])([A-Z])/g, '$1 $2') : translated;
  }

  private initialLang(): Lang {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ar' || stored === 'en') return stored;
    return navigator.language?.startsWith('ar') ? 'ar' : 'en';
  }
}

/** `{{ 'common.save' | t }}` or `{{ 'x.y' | t: { name: n } }}`. Impure so it reacts to language changes. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(key: string, params?: Record<string, unknown>): string {
    return this.i18n.t(key, params);
  }
}

/** `{{ status | te: 'enums.attendanceStatus' }}` — translate an enum value. */
@Pipe({ name: 'te', pure: false })
export class TranslateEnumPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string | null | undefined, prefix: string): string {
    return this.i18n.enum(prefix, value);
  }
}
