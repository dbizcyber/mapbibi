/* ── gps.js — suivi GPS + wake lock ── */
import { state, markers }     from './state.js';
import { map }                from './map.js';
import { routeLayer }         from './map.js';
import { showToast }          from './utils.js';

const MIN_DIST_M   = 5;
const MAX_ACCURACY = 50;
const MAX_SPEED    = 55;

/* ── Élévation terrain ── */
const ELE_CACHE_DIST = 30;     /* mètres : ne re-requête pas si < 30 m du dernier point enrichi */
const ELE_COOLDOWN   = 20000;  /* ms : délai minimum entre deux requêtes Open-Elevation */
let _lastElePos      = null;
let _lastEleTime     = 0;
let _eleQueue        = [];      /* points en attente d'enrichissement */
let _eleBusy         = false;

/**
 * Demande l'altitude terrain via Open-Elevation pour un point.
 * Retourne l'altitude terrain (m) ou null si échec.
 */
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
  } catch (e) {
    return null;
  }
}

/**
 * Enrichit les points de recTrace dont ele === 0 ou altSource === 'gps'
 * avec les données terrain. Traitement séquentiel, un point à la fois.
 */
async function _drainEleQueue() {
  if (_eleBusy) return;
  _eleBusy = true;
  while (_eleQueue.length > 0) {
    const idx = _eleQueue.shift();
    const pt  = state.recTrace[idx];
    if (!pt) continue;
    const now  = Date.now();
    const pos  = L.latLng(pt.lat, pt.lng);
    /* Cooldown entre requêtes */
    const elapsed = now - _lastEleTime;
    if (elapsed < ELE_COOLDOWN) {
      await new Promise(r => setTimeout(r, ELE_COOLDOWN - elapsed));
    }
    /* Ne re-requête pas si trop proche du dernier point enrichi */
    if (_lastElePos && _lastElePos.distanceTo(pos) < ELE_CACHE_DIST) {
      if (_lastElePos._terrainEle != null) {
        state.recTrace[idx].ele       = _lastElePos._terrainEle;
        state.recTrace[idx].eleValid  = true;
        state.recTrace[idx].eleSource = 'terrain-cache';
      }
      continue;
    }
    const terrainEle = await _fetchTerrainEle(pt.lat, pt.lng);
    _lastEleTime = Date.now();
    if (terrainEle !== null) {
      state.recTrace[idx].ele       = terrainEle;
      state.recTrace[idx].eleValid  = true;
      state.recTrace[idx].eleSource = 'terrain';
      _lastElePos = pos;
      _lastElePos._terrainEle = terrainEle;
    } else {
      /* Fallback : conserver l'altitude GPS barométrique si disponible */
      state.recTrace[idx].eleSource = 'gps-fallback';
      /* eleValid reste ce qu'il était (true si GPS fiable, false sinon) */
    }
  }
  _eleBusy = false;
}

let livePolyline  = null;
let _lastRecPos   = null;
let _lastRecTime  = 0;
let _noSleep      = null;
let _wakeLock     = null;

/* ── WATCH POSITION ── */
export function initGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng, altitude: alt, accuracy, altitudeAccuracy } = pos.coords;
    const ico = L.icon({ iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg', iconSize: [14, 14], iconAnchor: [7, 7] });
    if (!markers.gps) { markers.gps = L.marker([lat, lng], { icon: ico }).addTo(map); map.setView([lat, lng], 12); }
    else markers.gps.setLatLng([lat, lng]);
    markers.gps._alt             = alt;
    markers.gps._accuracy        = accuracy;
    markers.gps._altAccuracy     = altitudeAccuracy;

    if (state.gpsTracking) {
      const now   = Date.now();
      const newLL = L.latLng(lat, lng);

      /* Filtre 1 : précision horizontale insuffisante */
      if (accuracy && accuracy > MAX_ACCURACY) {
        /* ignoré */
      } else if (_lastRecPos) {
        const dist  = _lastRecPos.distanceTo(newLL);
        const dt    = (now - _lastRecTime) / 1000;

        /* Filtre 2 : déplacement trop faible */
        if (dist >= MIN_DIST_M) {
          /* Filtre 3 : vitesse aberrante */
          const speed = dt > 0 ? dist / dt : 0;
          if (speed <= MAX_SPEED) {
            /* Altitude GPS barométrique — sera enrichie par Open-Elevation */
            const gpsAltFiable = alt != null && altitudeAccuracy != null && altitudeAccuracy < 30;
            const gpsEle = gpsAltFiable ? Math.round(alt) : null;  /* null = non fiable, PAS 0 */
            const idx = state.recTrace.length;
            state.recTrace.push({ lat, lng, ele: gpsEle, eleValid: gpsAltFiable, eleSource: 'gps', acc: accuracy || 0, t: now });
            _lastRecPos  = newLL;
            _lastRecTime = now;
            /* Planifier enrichissement terrain */
            _eleQueue.push(idx);
            _drainEleQueue();
            _updateLiveTrace();
          }
        }
      } else {
        /* Premier point */
        const gpsAltFiable = alt != null && altitudeAccuracy != null && altitudeAccuracy < 30;
        const gpsEle = gpsAltFiable ? Math.round(alt) : null;  /* null = non fiable, PAS 0 */
        const idx = state.recTrace.length;
        state.recTrace.push({ lat, lng, ele: gpsEle, eleValid: gpsAltFiable, eleSource: 'gps', acc: accuracy || 0, t: Date.now() });
        _lastRecPos  = newLL;
        _lastRecTime = now;
        _eleQueue.push(idx);
        _drainEleQueue();
        _updateLiveTrace();
      }
    }

    if (!markers.gps._attached) {
      markers.gps._attached = true;
      markers.gps.on('click', async () => {
        const p   = markers.gps.getLatLng();
        const ga  = markers.gps._alt != null ? markers.gps._alt.toFixed(1) : null;
        const acc = markers.gps._accuracy     ? `± ${Math.round(markers.gps._accuracy)} m`    : '—';
        const aac = markers.gps._altAccuracy  ? `± ${Math.round(markers.gps._altAccuracy)} m` : '—';
        markers.gps.bindPopup(
          `<b>📍 Position</b><br>Lat:${p.lat.toFixed(6)}<br>Lon:${p.lng.toFixed(6)}` +
          `<br><br>📡 Alt GPS: ${ga ? ga + ' m' : '—'} (précision ${aac})` +
          `<br>🎯 Précision horiz.: ${acc}`
        ).openPopup();
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
export function clearGpsRecState()  {
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

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.gpsTracking) activerWakeLock();
});


