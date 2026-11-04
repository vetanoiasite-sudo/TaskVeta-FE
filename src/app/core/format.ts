import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

/** Local yyyy-MM-dd for a Date (no UTC shift). */
export function isoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses "yyyy-MM-dd" as a local date. */
export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const [y, m, d] = s.substring(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Wall-clock "HH:mm" of an ISO timestamp *as recorded* (attendance times carry the company time-zone offset,
 * so this shows company time regardless of the browser's zone).
 */
export function wallTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : '—';
}

/** "HH:mm:ss" → "HH:mm". */
export function shortTime(t: string | null | undefined): string {
  return t ? t.substring(0, 5) : '—';
}

export function minutesToText(min: number | null | undefined): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** `{{ record.checkInTime | wallTime }}` */
@Pipe({ name: 'wallTime' })
export class WallTimePipe implements PipeTransform {
  transform(iso: string | null | undefined): string {
    return wallTime(iso);
  }
}

/** Locale-aware date formatting that follows the selected UI language. `{{ value | ldate: 'datetime' }}` */
@Pipe({ name: 'ldate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: string | Date | null | undefined, style: 'date' | 'datetime' | 'time' | 'weekday' | 'relative' = 'date'): string {
    if (!value) return '—';
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseIsoDate(value)! : new Date(value);
    if (isNaN(date.getTime())) return '—';
    const locale = this.i18n.locale();
    switch (style) {
      case 'datetime':
        return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
      case 'time':
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      case 'weekday':
        return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
      case 'relative':
        return relative(date, locale);
      default:
        return date.toLocaleDateString(locale, { dateStyle: 'medium' });
    }
  }
}

function relative(date: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return date.toLocaleDateString(locale, { dateStyle: 'medium' });
}
