/* ── storage.js — persistance localStorage ── */
import { state } from './state.js';

const SKEY         = 'traceur_manual_route_v1';
const COUNTER_KEY  = 'mapibibi_route_counters';
export const REC_LIVE_KEY    = 'mapibibi_rec_live';
export const REC_ENCOURS_KEY = 'mapibibi_rec_encours';

/* ── Trace manuelle ── */
export function saveLocal() {
  try {
    if (!state.manualCoords.length) { localStorage.removeItem(SKEY); return; }
    localStorage.setItem(SKEY, JSON.stringify(state.manualCoords));
  } catch (e) {}
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(SKEY);
    if (!raw) return false;
    const coords = JSON.parse(raw);
    if (!coords.length) return false;
    state.manualCoords = coords;
    return true;
  } catch (e) { return false; }
}

export function clearLocal() {
  try { localStorage.removeItem(SKEY); } catch (e) {}
}

/* ── Compteurs de requêtes routage ── */
export function loadCounters() {
  try {
    const raw  = localStorage.getItem(COUNTER_KEY);
    const d    = raw ? JSON.parse(raw) : {};
    const now  = new Date();
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (d.month !== month) return { month, ors: 0, valhalla: 0 };
    return { month, ors: d.ors || 0, valhalla: d.valhalla || 0 };
  } catch (e) { return { month: '', ors: 0, valhalla: 0 }; }
}

export function saveCounters(c) {
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify(c)); } catch (e) {}
}

export function incrementCounter(engine) {
  const c = loadCounters();
  if (engine === 'ors') c.ors++; else c.valhalla++;
  saveCounters(c);
  return c;
}

export function resetCounters() {
  if (!confirm('Réinitialiser les compteurs ?')) return;
  const c = { month: '', ors: 0, valhalla: 0 };
  saveCounters(c);
  return c;
}
