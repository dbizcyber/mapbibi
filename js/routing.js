/* ── routing.js — routage pédestre ORS/Valhalla via proxy Supabase ── */
import { state }                      from './state.js';
import { setLoading }                 from './ui.js';
import { saveLocal, incrementCounter } from './storage.js';
import { drawElevation }              from './elevation.js';
import { mkEditable, updateStartEndMarkers, refreshPts, routeLayer, editMarkersGrp, editPts, map } from './map.js';

const VALHALLA_URL = 'https://whlxbfnmyqdflmxosfse.supabase.co/functions/v1/valhalla-proxy';
const TIMEOUT_MS   = 15000;
let _routeAbort    = null;

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
  const pts      = state.manualPts.slice();
  let ok         = false;
  let newCoords  = [];

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });

  try {
    const fetchPromise = fetch(VALHALLA_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: pts })
    });
    const r = await Promise.race([fetchPromise, timeoutPromise]);
    if (!r.ok) throw new Error('Proxy ' + r.status);
    const d = await r.json();
    if (!d.coords || !d.coords.length) throw new Error('Réponse vide');
    d.coords.forEach((c, i) => newCoords.push([c[0], c[1], d.elevations?.[i] || 0]));
    ok = true;
    const c = incrementCounter(d.engine || 'valhalla');
    const { updateCounterUI } = await import('./ui.js');
    updateCounterUI(c);
    console.log(`[Route] ${d.engine === 'ors' ? 'ORS' : 'Valhalla'} OK — ${d.coords.length} pts`);
  } catch (e) {
    if (e.name === 'AbortError') { return; }
    if (e.message === 'timeout') { setLoading(false, '⚠ Délai dépassé — réseau trop lent, réessayez'); return; }
    console.error('[Route] Proxy échoué:', e.message);
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
