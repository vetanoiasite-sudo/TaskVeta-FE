import { Observable, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AttendanceRecord, CheckRequest, VerificationRequirements } from '../../core/models';
import { GeoError, getPosition } from './geo';

export type CheckKind = 'in' | 'out';

/**
 * Collects the on-site proof required by the company settings and calls check-in/out.
 * When geolocation fails but another method (network / QR) could still satisfy an "Any" policy,
 * the request is sent without coordinates and the server decides.
 * Rejects with GeoError (i18n key) for location problems, or the HttpErrorResponse.
 */
export async function performCheck(
  api: ApiService, kind: CheckKind, v: VerificationRequirements, extra: CheckRequest,
): Promise<AttendanceRecord> {
  const needed = v.required && !extra.workFromHome && (kind === 'in' || v.requiredOnCheckOut);
  const body: CheckRequest = { ...extra };

  if (needed && v.geofence) {
    try {
      const fix = await getPosition();
      body.latitude = fix.latitude;
      body.longitude = fix.longitude;
      body.accuracy = fix.accuracy;
    } catch (e) {
      const alternatives = v.policy === 'Any' && (v.network || (v.qrCode && !!extra.qrToken));
      if (!alternatives) throw e instanceof GeoError ? e : new GeoError('attendance.geo.unavailable');
    }
  }

  const call: Observable<AttendanceRecord> = kind === 'in' ? api.checkIn(body) : api.checkOut(body);
  return firstValueFrom(call);
}
