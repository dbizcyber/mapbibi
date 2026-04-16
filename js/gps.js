/* ── gps.js — suivi GPS + wake lock ── */
import { state, markers }     from './state.js';
import { map }                from './map.js';
import { routeLayer }         from './map.js';
import { showToast }          from './utils.js';

const MIN_DIST_M   = 5;
const MAX_ACCURACY = 50;
const MAX_SPEED    = 55;

let livePolyline  = null;
let _lastRecPos   = null;
let _lastRecTime  = 0;
let _noSleep      = null;
let _wakeLock     = null;

/* ── WATCH POSITION ── */
export function initGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng, altitude: alt, accuracy } = pos.coords;
    const ico = L.icon({ iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg', iconSize: [14, 14], iconAnchor: [7, 7] });
    if (!markers.gps) { markers.gps = L.marker([lat, lng], { icon: ico }).addTo(map); map.setView([lat, lng], 12); }
    else markers.gps.setLatLng([lat, lng]);
    markers.gps._alt      = alt;
    markers.gps._accuracy = accuracy;

    if (state.gpsTracking) {
      const now  = Date.now();
      const newLL = L.latLng(lat, lng);
      if (accuracy && accuracy > MAX_ACCURACY) {
        /* point ignoré — précision insuffisante */
      } else if (_lastRecPos) {
        const dist  = _lastRecPos.distanceTo(newLL);
        const dt    = (now - _lastRecTime) / 1000;
        if (dist >= MIN_DIST_M) {
          const speed = dt > 0 ? dist / dt : 0;
          if (speed <= MAX_SPEED) {
            state.recTrace.push({ lat, lng, ele: alt || 0, acc: accuracy || 0, t: now });
            _lastRecPos  = newLL;
            _lastRecTime = now;
            _updateLiveTrace();
          }
        }
      } else {
        state.recTrace.push({ lat, lng, ele: alt || 0, acc: accuracy || 0, t: Date.now() });
        _lastRecPos  = newLL;
        _lastRecTime = now;
        _updateLiveTrace();
      }
    }

    if (!markers.gps._attached) {
      markers.gps._attached = true;
      markers.gps.on('click', async () => {
        const p  = markers.gps.getLatLng();
        const ga = markers.gps._alt != null ? markers.gps._alt.toFixed(1) : null;
        const acc = markers.gps._accuracy ? `± ${Math.round(markers.gps._accuracy)} m` : '—';
        markers.gps.bindPopup(`<b>📍 Position</b><br>Lat:${p.lat.toFixed(6)}<br>Lon:${p.lng.toFixed(6)}<br><br>📡 GPS:${ga ? ga + ' m' : '—'}<br>🎯 Précision:${acc}`).openPopup();
      });
    }
  }, err => console.warn('GPS:', err), { enableHighAccuracy: true });
}

function _updateLiveTrace() {
  if (!state.gpsTracking || state.recTrace.length < 1) return;
  const lls = state.recTrace.map(p => [p.lat, p.lng]);
  if (livePolyline) livePolyline.setLatLngs(lls);
  else livePolyline = L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.0, opacity: 0.9 }).addTo(routeLayer);
  if (!state.userMovedMap && lls.length) map.panTo(lls[lls.length - 1], { animate: true, duration: 0.3 });
}

export function resetLivePolyline() { livePolyline = null; }
export function clearGpsRecState()  { _lastRecPos = null; _lastRecTime = 0; }

/* ── WAKE LOCK ── */
export async function activerWakeLock() {
  if ('wakeLock' in navigator) {
    try { _wakeLock = await navigator.wakeLock.request('screen'); console.log('[WakeLock] actif'); return; }
    catch (e) { console.warn('[WakeLock] échec:', e.message); }
  }
  try {
    if (!_noSleep) _noSleep = new NoSleep();
    await _noSleep.enable();
    console.log('[NoSleep] actif');
  } catch (e) { console.warn('[NoSleep] échec:', e.message); }
}

export function desactiverWakeLock() {
  if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
  if (_noSleep && _noSleep.isEnabled) _noSleep.disable();
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.gpsTracking) activerWakeLock();
});
