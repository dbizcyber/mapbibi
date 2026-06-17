/* ── gps.js — suivi GPS + wake lock + résilience arrière-plan ──
   v9.1 — la trace GPS survit aux changements d'appli, verrous d'écran
   et suspensions iOS/Android. */
import { state, markers }     from './state.js';
import { map }                from './map.js';
import { routeLayer }         from './map.js';
import { showToast }          from './utils.js';
import { verifierEcart }      from './guidage.js';

const MIN_DIST_M   = 5;
const MAX_ACCURACY = 50;
const MAX_SPEED    = 55;

/* ── Élévation terrain ── */
const ELE_CACHE_DIST = 30;
const ELE_COOLDOWN   = 20000;
let _lastElePos      = null;
let _lastEleTime     = 0;
let _eleQueue        = [];
let _eleBusy         = false;

async function _fetchTerrainEle(lat, lng) {
  try {
    const r = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ locations: [{ latitude: lat, longitude: lng }] }),
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const el = d?.results?.[0]?.elevation;
    return typeof el === 'number' ? Math.round(el) : null;
  } catch (e) { return null; }
}

async function _drainEleQueue() {
  if (_eleBusy) return;
  _eleBusy = true;
  while (_eleQueue.length > 0) {
    const idx = _eleQueue.shift();
    const pt  = state.recTrace[idx];
    if (!pt) continue;
    const now = Date.now();
    const pos = L.latLng(pt.lat, pt.lng);
    const elapsed = now - _lastEleTime;
    if (elapsed < ELE_COOLDOWN) await new Promise(r => setTimeout(r, ELE_COOLDOWN - elapsed));
    if (_lastElePos && _lastElePos.distanceTo(pos) < ELE_CACHE_DIST) {
      if (_lastElePos._terrainEle != null) {
        state.recTrace[idx].ele       = _lastElePos._terrainEle;
        state.recTrace[idx].eleSource = 'terrain-cache';
      }
      continue;
    }
    const terrainEle = await _fetchTerrainEle(pt.lat, pt.lng);
    _lastEleTime = Date.now();
    if (terrainEle !== null) {
      state.recTrace[idx].ele       = terrainEle;
      state.recTrace[idx].eleSource = 'terrain';
      _lastElePos = pos;
      _lastElePos._terrainEle = terrainEle;
    } else {
      state.recTrace[idx].eleSource = 'gps-fallback';
    }
  }
  _eleBusy = false;
}

let livePolyline  = null;
let _lastRecPos   = null;
let _lastRecTime  = 0;
let _noSleep      = null;
let _wakeLock     = null;
let _watchId      = null;

/* ── Callback appelé à chaque sauvegarde d'un point GPS ──
   Sera câblé par recording.js pour sauvegarder immédiatement. */
let _onNewPoint = null;
export function setOnNewPoint(cb) { _onNewPoint = cb; }

/* ── HANDLER GPS CENTRAL ── */
function _handlePosition(pos) {
  const { latitude: lat, longitude: lng, altitude: alt, accuracy, altitudeAccuracy } = pos.coords;
  const ico = L.icon({ iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg', iconSize: [14, 14], iconAnchor: [7, 7] });
  if (!markers.gps) { markers.gps = L.marker([lat, lng], { icon: ico }).addTo(map); map.setView([lat, lng], 12); }
  else markers.gps.setLatLng([lat, lng]);
  markers.gps._alt          = alt;
  markers.gps._accuracy     = accuracy;
  markers.gps._altAccuracy  = altitudeAccuracy;

  /* Alerte d'écart de trace */
  if (!accuracy || accuracy <= MAX_ACCURACY) verifierEcart(lat, lng);

  if (state.gpsTracking) {
    const now   = Date.now();
    const newLL = L.latLng(lat, lng);

    if (accuracy && accuracy > MAX_ACCURACY) { /* ignoré */ }
    else if (_lastRecPos) {
      const dist = _lastRecPos.distanceTo(newLL);
      const dt   = (now - _lastRecTime) / 1000;

      if (dist >= MIN_DIST_M) {
        const speed = dt > 0 ? dist / dt : 0;
        if (speed <= MAX_SPEED) {
          const gpsEle = (alt != null && altitudeAccuracy != null && altitudeAccuracy < 30)
            ? Math.round(alt) : 0;
          const idx = state.recTrace.length;
          state.recTrace.push({ lat, lng, ele: gpsEle, eleSource: 'gps', acc: accuracy || 0, t: now });
          _lastRecPos  = newLL;
          _lastRecTime = now;
          _eleQueue.push(idx);
          _drainEleQueue();
          _updateLiveTrace();
          /* ★ Sauvegarde immédiate à chaque point */
          if (_onNewPoint) _onNewPoint();
        }
      }
    } else {
      /* Premier point */
      const gpsEle = (alt != null && altitudeAccuracy != null && altitudeAccuracy < 30)
        ? Math.round(alt) : 0;
      const idx = state.recTrace.length;
      state.recTrace.push({ lat, lng, ele: gpsEle, eleSource: 'gps', acc: accuracy || 0, t: Date.now() });
      _lastRecPos  = newLL;
      _lastRecTime = now;
      _eleQueue.push(idx);
      _drainEleQueue();
      _updateLiveTrace();
      if (_onNewPoint) _onNewPoint();
    }
  }

  if (!markers.gps._attached) {
    markers.gps._attached = true;
    markers.gps.on('click', () => {
      const p   = markers.gps.getLatLng();
      const ga  = markers.gps._alt != null ? markers.gps._alt.toFixed(1) : null;
      const acc = markers.gps._accuracy    ? `± ${Math.round(markers.gps._accuracy)} m`    : '—';
      const aac = markers.gps._altAccuracy ? `± ${Math.round(markers.gps._altAccuracy)} m` : '—';
      markers.gps.bindPopup(
        `<b>📍 Position</b><br>Lat:${p.lat.toFixed(6)}<br>Lon:${p.lng.toFixed(6)}` +
        `<br><br>📡 Alt GPS: ${ga ? ga + ' m' : '—'} (précision ${aac})` +
        `<br>🎯 Précision horiz.: ${acc}`
      ).openPopup();
    });
  }
}

/* ── INIT / RESTART GPS ── */
export function initGPS() {
  if (!navigator.geolocation) return;
  _startWatch();
}

function _startWatch() {
  /* Annuler l'ancien watch s'il existe (sinon on double les callbacks) */
  if (_watchId != null) {
    try { navigator.geolocation.clearWatch(_watchId); } catch (e) {}
  }
  _watchId = navigator.geolocation.watchPosition(
    _handlePosition,
    err => console.warn('GPS:', err.message),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
  );
}

/* ── Force une position immédiate (réveil GPS après background) ── */
function _forceGetPosition() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    _handlePosition,
    () => {},
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function _updateLiveTrace() {
  if (!state.gpsTracking || state.recTrace.length < 1) return;
  const lls = state.recTrace.map(p => [p.lat, p.lng]);
  if (livePolyline) livePolyline.setLatLngs(lls);
  else livePolyline = L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.0, opacity: 0.9 }).addTo(routeLayer);
  if (!state.userMovedMap && lls.length) map.panTo(lls[lls.length - 1], { animate: true, duration: 0.3 });
  const fabGps = document.getElementById('fab-gps');
  if (fabGps && state.gpsTracking) fabGps.textContent = state.userMovedMap ? '📍' : '🔒';
}

export function resetLivePolyline() { livePolyline = null; }
export function clearGpsRecState() {
  _lastRecPos  = null;
  _lastRecTime = 0;
  _eleQueue    = [];
  _lastElePos  = null;
  _lastEleTime = 0;
}

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

/* ═══════════ GESTION DE L'ARRIÈRE-PLAN ═══════════
   Quand l'utilisateur change d'appli ou verrouille l'écran :
   1. hidden  → sauvegarde immédiate de la trace (fait par recording.js via callback)
   2. visible → ré-acquisition wake lock + relance GPS + notification du trou  */

let _lastVisibleTime = Date.now();
let _onSuspend       = null;   /* callback recording.js pour sauvegarder */
let _onResume        = null;   /* callback recording.js pour notifier la reprise */
export function setLifecycleCallbacks(onSuspend, onResume) {
  _onSuspend = onSuspend;
  _onResume  = onResume;
}

function _handleHidden() {
  _lastVisibleTime = Date.now();
  /* Sauvegarde immédiate avant que l'OS ne gèle la page */
  if (state.gpsTracking && _onSuspend) _onSuspend();
}

function _handleVisible() {
  const gap = Date.now() - _lastVisibleTime;
  _lastVisibleTime = Date.now();

  if (state.gpsTracking) {
    /* Ré-acquérir le wake lock (toujours relâché par l'OS au passage en arrière-plan) */
    activerWakeLock();
    /* Forcer une position immédiate — le watchPosition reprend mais peut être lent */
    _forceGetPosition();
    /* Relancer le watch au cas où le navigateur l'a tué (courant sur iOS) */
    _startWatch();
    /* Notifier recording.js du trou + mettre à jour les stats */
    if (_onResume) _onResume(gap);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') _handleHidden();
  else _handleVisible();
});

/* pagehide : dernière chance avant kill — plus fiable que beforeunload sur mobile */
window.addEventListener('pagehide', () => {
  if (state.gpsTracking && _onSuspend) _onSuspend();
});

/* freeze (Page Lifecycle API — Chrome Android) */
document.addEventListener('freeze', () => {
  if (state.gpsTracking && _onSuspend) _onSuspend();
});

/* resume (Page Lifecycle API — Chrome Android) */
document.addEventListener('resume', () => {
  if (state.gpsTracking) {
    activerWakeLock();
    _forceGetPosition();
    _startWatch();
  }
});
