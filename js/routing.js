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

/* ── Décodage Polyline encodée ──
   Valhalla utilise par défaut la précision 1e6 (6 décimales) pour lat/lng
   et 1e0 × 0.1 pour l'altitude quand elevation_interval est demandé.
   Si les coordonnées semblent hors-zone, le fallback Polyline5 (1e5) est utilisé. ── */
function _decodePolyline(encoded, precision) {
  const factor = Math.pow(10, precision);
  const coords = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/* Fusionne les coordonnées 2D décodées avec les altitudes du tableau separé */
function _mergeElevations(coords2d, elevations) {
  return coords2d.map((c, i) => [c[0], c[1], elevations?.[i] ?? 0]);
}

/* ── Corps de requête Valhalla natif ── */
function _buildRequest(pts) {
  return {
    locations: pts.map(p => ({
      lon:           p[0],
      lat:           p[1],
      type:          'break',
      search_radius: 100,
    })),
    costing: 'pedestrian',
    costing_options: {
      pedestrian: {
        walking_speed: 4.5,
        use_trails:    0.5,
        use_hills:     0.5,
        use_ferry:     0.0,
      }
    },
    directions_options: { units: 'kilometers' },
    shape_format: 'polyline6',   /* demander explicitement Polyline6 (précision 1e6) */
    elevation_interval: 30,      /* altitude tous les 30 m, retournée dans leg.elevation */
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

    legs.forEach((leg, legIdx) => {
      /* Auto-détection de la précision : on compare le 1er point décodé
         avec le waypoint source correspondant pour choisir entre 1e5 et 1e6 */
      const ref   = pts[legIdx];   /* [lng, lat] du waypoint départ du leg */
      let coords2d;
      const c6 = _decodePolyline(leg.shape, 6);
      const c5 = _decodePolyline(leg.shape, 5);
      /* Écart entre 1er point décodé et waypoint connu */
      const d6 = Math.abs(c6[0][0] - ref[1]) + Math.abs(c6[0][1] - ref[0]);
      const d5 = Math.abs(c5[0][0] - ref[1]) + Math.abs(c5[0][1] - ref[0]);
      coords2d = d6 <= d5 ? c6 : c5;
      console.log(`[Route] précision détectée: ${d6 <= d5 ? '1e6 (polyline6)' : '1e5 (polyline5)'}`);

      const elevations = leg.elevation || [];
      const merged = coords2d.map((c, i) => {
        const ratio = elevations.length > 1 ? i / (coords2d.length - 1) * (elevations.length - 1) : 0;
        const lo = Math.floor(ratio), hi = Math.min(Math.ceil(ratio), elevations.length - 1);
        const ele = elevations.length
          ? elevations[lo] + (elevations[hi] - elevations[lo]) * (ratio - lo)
          : 0;
        return [c[0], c[1], Math.round(ele)];
      });
      merged.forEach(c => newCoords.push(c));
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
