/* ── routing.js — routage pédestre via Valhalla public OSM (sans clé, sans quota) ── */
import { state }         from './state.js';
import { setLoading }    from './ui.js';
import { saveLocal }     from './storage.js';
import { drawElevation } from './elevation.js';
import { mkEditable, updateStartEndMarkers, refreshPts,
         routeLayer, editMarkersGrp, editPts, map } from './map.js';

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';
const TIMEOUT_MS   = 15000;
let _routeAbort    = null;

/* ── Décodage Polyline6 encodée (Google Polyline + 3ème dimension altitude) ── */
function _decodePolyline6(encoded) {
  const coords = [];
  let idx = 0, lat = 0, lng = 0, ele = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    ele += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e6, lng / 1e6, ele / 10]);  /* précision 1e6 lat/lng, 10e0 altitude */
  }
  return coords;
}

/* ── Corps de requête Valhalla natif ── */
function _buildRequest(pts) {
  /* Premier et dernier point en 'break', intermédiaires en 'via'
     pour forcer le passage exact par chaque waypoint */
  const locations = pts.map((p, i) => ({
    lon:  p[0],
    lat:  p[1],
    type: (i === 0 || i === pts.length - 1) ? 'break' : 'via',
  }));

  return {
    locations,
    costing: 'pedestrian',
    costing_options: {
      pedestrian: {
        walking_speed:       4.5,   /* km/h */
        use_trails:          1.0,   /* favoriser les sentiers balisés */
        use_hills:           0.5,
        use_ferry:           0.0,
        use_living_streets:  0.5,
        /* Pénalités fortes pour forcer le réseau OSM */
        alley_factor:        2.0,
        country_crossing_penalty: 600,
      }
    },
    directions_options: { units: 'kilometers' },
    elevation_interval: 30,
    format: 'json',
  };
}

export async function rebuildRoute() {
  if (_routeAbort) _routeAbort.abort();
  const ctrl = new AbortController();
  _routeAbort = ctrl;

  if (state.manualPts.length < 2) {
    routeLayer.clearLayers();
    editMarkersGrp.clearLayers();
    editPts.clearLayers();
    state.manualCoords = [];
    drawElevation([], []);
    saveLocal();
    setLoading(false);
    return;
  }

  setLoading(true);
  const pts     = state.manualPts.slice();
  let newCoords = [];
  let ok        = false;

  const timeoutId = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);

  try {
    const r = await fetch(VALHALLA_URL, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(_buildRequest(pts)),
    });
    clearTimeout(timeoutId);

    if (!r.ok) throw new Error('Valhalla HTTP ' + r.status);
    const d = await r.json();

    const legs = d?.trip?.legs;
    if (!legs || !legs.length) throw new Error('Réponse vide');

    legs.forEach(leg => {
      _decodePolyline6(leg.shape).forEach(c => newCoords.push([c[0], c[1], c[2]]));
    });

    if (!newCoords.length) throw new Error('Aucune coordonnée décodée');
    ok = true;
    console.log(`[Route] Valhalla OSM OK — ${newCoords.length} pts, ${pts.length} waypoints`);

  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      if (ctrl.signal.reason === 'timeout') {
        setLoading(false, '⚠ Délai dépassé — réseau trop lent, réessayez');
      }
      return;
    }
    console.error('[Route] Valhalla échoué:', e.message);
    setLoading(false, '⚠ Erreur réseau — vérifiez la connexion');
    return;
  }

  setLoading(false);
  if (ctrl.signal.aborted) return;

  if (ok && newCoords.length) {
    state.manualCoords = newCoords;
    routeLayer.clearLayers();
    editMarkersGrp.clearLayers();
    editPts.clearLayers();
    const lls = state.manualCoords.map(c => [c[0], c[1]]);
    if (!map.hasLayer(routeLayer)) routeLayer.addTo(map);
    L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
    mkEditable(lls);
    updateStartEndMarkers(lls);
    drawElevation(state.manualCoords.map(c => c[2] || 0), lls);
    refreshPts(() => rebuildRoute());
    saveLocal();
    if (!state.userMovedMap && lls.length) map.panTo(lls[lls.length - 1], { animate: true, duration: 0.4 });
  }
}
