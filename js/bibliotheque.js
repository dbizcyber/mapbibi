/* ── bibliotheque.js — bibliothèque de traces (IndexedDB) ──
   Sauvegarde nommée, liste, chargement et suppression de traces.
   Indépendant du slot localStorage « trace courante » (storage.js). */
import { state }                          from './state.js';
import { showToast, totalDist, gainElev, estimerTemps } from './utils.js';
import { saveLocal }                      from './storage.js';
import { map, routeLayer, editMarkersGrp, mkEditable, updateStartEndMarkers, refreshPts } from './map.js';
import { drawElevation }                  from './elevation.js';
import { showChartArea }                  from './ui.js';
import { rebuildRoute }                   from './routing.js';

const DB_NAME  = 'mapibibi-db';
const DB_VER   = 1;
const STORE    = 'traces';

/* ── Helpers IndexedDB (promesses) ── */
function _openDB() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror   = () => rej(rq.error);
  });
}

function _tx(db, mode, fn) {
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    tx.onerror    = () => rej(tx.error);
  });
}

async function _listerTraces() {
  const db = await _openDB();
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    rq.onsuccess = () => res(rq.result || []);
    rq.onerror   = () => rej(rq.error);
  });
}

/* ── Sauvegarder la trace courante ── */
export async function sauvegarderTrace() {
  if (!state.manualCoords || state.manualCoords.length < 2) {
    showToast('Aucune trace à sauvegarder'); return;
  }
  const d   = new Date();
  const def = `Rando du ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
  const name = prompt('Nom de la trace :', def);
  if (name === null) return;               /* annulé */

  const lls  = state.manualCoords.map(c => [c[0], c[1]]);
  const dist = totalDist(lls);
  const g    = gainElev(state.manualCoords.map(c => c[2] ?? null));

  try {
    const db = await _openDB();
    await _tx(db, 'readwrite', s => s.add({
      name:  (name || def).trim() || def,
      date:  Date.now(),
      coords: state.manualCoords,
      pts:    state.manualPts,
      dist:   Math.round(dist),
      dpos:   g.pos,
      dneg:   g.neg,
    }));
    showToast(`💾 « ${(name || def).trim() || def} » sauvegardée`);
    _rafraichirListe();
  } catch (e) {
    console.error('[Bibliothèque] sauvegarde:', e);
    showToast('Erreur de sauvegarde');
  }
}

/* ── Charger une trace ── */
export async function chargerTrace(id) {
  if (state.gpsTracking) { showToast('Arrêtez l\'enregistrement avant de charger une trace'); return; }
  if (state.manualCoords.length > 1 && !confirm('Remplacer la trace actuelle ?')) return;
  try {
    const db = await _openDB();
    const t  = await new Promise((res, rej) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      rq.onsuccess = () => res(rq.result);
      rq.onerror   = () => rej(rq.error);
    });
    if (!t) { showToast('Trace introuvable'); return; }

    state.manualCoords  = t.coords || [];
    state.manualPts     = t.pts    || [];
    state.importedTrace = true;     /* protège contre l'écrasement par un tap */
    state.userMovedMap  = true;

    routeLayer.clearLayers();
    editMarkersGrp.clearLayers();
    const lls = state.manualCoords.map(c => [c[0], c[1]]);
    L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
    mkEditable(lls);
    refreshPts(() => rebuildRoute());
    updateStartEndMarkers(lls);
    drawElevation(state.manualCoords.map(c => c[2] ?? null), lls);
    map.fitBounds(lls, { padding: [20, 20] });
    saveLocal();
    showChartArea(true);
    fermerBibliotheque();
    showToast(`📂 « ${t.name} » chargée`);
  } catch (e) {
    console.error('[Bibliothèque] chargement:', e);
    showToast('Erreur de chargement');
  }
}

/* ── Supprimer une trace ── */
export async function supprimerTrace(id, name) {
  if (!confirm(`Supprimer « ${name} » ?`)) return;
  try {
    const db = await _openDB();
    await _tx(db, 'readwrite', s => s.delete(id));
    showToast('Trace supprimée');
    _rafraichirListe();
  } catch (e) {
    console.error('[Bibliothèque] suppression:', e);
    showToast('Erreur de suppression');
  }
}

/* ── Panneau ── */
export function ouvrirBibliotheque() {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('visible'));
  document.getElementById('library-panel').classList.add('visible');
  _rafraichirListe();
}

export function fermerBibliotheque() {
  document.getElementById('library-panel').classList.remove('visible');
}

async function _rafraichirListe() {
  const wrap = document.getElementById('library-list');
  if (!wrap) return;
  let traces = [];
  try { traces = await _listerTraces(); }
  catch (e) { wrap.innerHTML = '<p class="lib-empty">IndexedDB indisponible sur ce navigateur.</p>'; return; }

  if (!traces.length) {
    wrap.innerHTML = '<p class="lib-empty">Aucune trace sauvegardée.<br>Tracez un itinéraire puis « 💾 Sauvegarder la trace actuelle ».</p>';
    return;
  }
  traces.sort((a, b) => b.date - a.date);
  wrap.innerHTML = traces.map(t => {
    const d   = new Date(t.date);
    const dat = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const km  = (t.dist / 1000).toFixed(1);
    const tps = estimerTemps(t.dist, t.dpos, t.dneg);
    return `<div class="lib-item">
      <div class="lib-info" onclick="chargerTrace(${t.id})">
        <div class="lib-name">${_esc(t.name)}</div>
        <div class="lib-meta">${dat} · ${km} km · D+ ${t.dpos} m · D− ${t.dneg} m · ⏱ ${tps}</div>
      </div>
      <button class="lib-del" onclick="supprimerTrace(${t.id}, '${_esc(t.name).replace(/'/g, '\\&#39;')}')">🗑️</button>
    </div>`;
  }).join('');
}

function _esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
