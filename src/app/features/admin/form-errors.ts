import { FormGroup } from '@angular/forms';
import { validationErrors } from '../../core/http';

/** Applies server-side 400 field errors (camelCase keys) to matching form controls. Returns true if any were applied. */
export function applyServerErrors(form: FormGroup, err: unknown): boolean {
  const errors = validationErrors(err);
  let applied = false;
  for (const [key, messages] of Object.entries(errors)) {
    const control = form.get(key);
    if (control && messages.length) {
      control.setErrors({ server: messages[0] });
      control.markAsTouched();
      applied = true;
    }
  }
  return applied;
}

/** First server error message for a control, if any. */
export function serverError(form: FormGroup, key: string): string | null {
  return (form.get(key)?.errors?.['server'] as string | undefined) ?? null;
}
