export interface GeoFix { latitude: number; longitude: number; accuracy: number; }

/** Error whose message is an i18n key under attendance.geo.* */
export class GeoError extends Error {}

/** Gets a high-accuracy browser position. Rejects with a GeoError carrying an i18n key. */
export function getPosition(timeoutMs = 15000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoError('attendance.geo.unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      err => reject(new GeoError(
        err.code === err.PERMISSION_DENIED ? 'attendance.geo.denied'
          : err.code === err.TIMEOUT ? 'attendance.geo.timeout' : 'attendance.geo.unavailable')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
