/* ── recording.js — session d'enregistrement GPS ──
   v9.3 — recalage sur sentiers par MAP MATCHING (/trace_route)
   v9.2 — enregistrement indestructible :
   · sauvegarde à chaque point GPS (localStorage synchrone)
   · sauvegarde forcée sur visibilitychange/pagehide/freeze
   · reprise automatique après kill iOS / reload SW
   · flag gpsTracking persisté pour auto-reprise */
import { state }                     from './state.js';
import { activerWakeLock, desactiverWakeLock, resetLivePolyline, clearGpsRecState,
         setOnNewPoint, setLifecycleCallbacks } from './gps.js';
import { switchTab, showChartArea }  from './ui.js';
import { showToast, totalDist, gainElev } from './utils.js';
import { rebuildRoute, mapMatchTrace } from './routing.js';
import { drawElevation }             from './elevation.js';
import { mkEditable, updateStartEndMarkers, routeLayer, map } from './map.js';
import { saveLocal }                 from './storage.js';
import { REC_LIVE_KEY, REC_ENCOURS_KEY } from './storage.js';

let _statsTimer        = null;
let _saveLiveTimer     = null;
let _derniereSauvegarde = null;
let _lastSavedLength   = 0;

/* ═══════════ SAUVEGARDE IMMÉDIATE ═══════════ */
function _sauvegarderMaintenant(force) {
  if (!state.gpsTracking || !state.recTrace.length) return;
  /* Écrire si la trace a changé OU si on force (suspend/pagehide) */
  if (!force && state.recTrace.length === _lastSavedLength) return;
  try {
    localStorage.setItem(REC_LIVE_KEY, JSON.stringify(state.recTrace));
    _lastSavedLength    = state.recTrace.length;
    _derniereSauvegarde = Date.now();
  } catch (e) {
    console.warn('[Rec] localStorage plein:', e.message);
  }
}

/* ═══════════ LIFECYCLE (appelés par gps.js) ═══════════ */
function _onSuspend() {
  _sauvegarderMaintenant(true);  /* force = true : inclut les élévations enrichies */
  console.log(`[Rec] Passage arrière-plan — ${state.recTrace.length} pts sauvegardés`);
}

function _onResume(gapMs) {
  const gapSec = Math.round(gapMs / 1000);
  if (gapSec > 10) {
    const gapStr = gapSec > 120
      ? `${Math.round(gapSec / 60)} min en arrière-plan`
      : `${gapSec}s en arrière-plan`;
    showToast(`📍 Enregistrement repris — ${gapStr}`, 3500);
    console.log(`[Rec] Reprise après ${gapStr} — ${state.recTrace.length} pts`);
  }
  /* Rafraîchir le rendu de la carte (peut glitcher après un passage en arrière-plan) */
  try { map.invalidateSize(); } catch (e) {}
  _mettreAJourStatsLive();
  _mettreAJourIndicateurSauvegarde();
}

/* ═══════════ DÉMARRER / ARRÊTER ═══════════ */
export function onclickRec() {
  if (state.gpsTracking) switchTab('rec');
  else toggleAutoRecording();
}

export function stopRecording() {
  switchTab('map');
  toggleAutoRecording();
}

export function toggleAutoRecording() {
  state.gpsTracking = !state.gpsTracking;
  const btn = document.getElementById('tab-rec');
  if (state.gpsTracking) {
    _lancerEnregistrement([], true);
  } else {
    _arreterEnregistrement();
  }
}

/* Facteur commun : démarre l'enregistrement avec une trace optionnelle (vide ou restaurée) */
function _lancerEnregistrement(traceInitiale, isNew) {
  state.gpsTracking = true;
  if (isNew) {
    state.recTrace = [];
    clearGpsRecState();
    resetLivePolyline();
    routeLayer.clearLayers();
  } else {
    state.recTrace = traceInitiale;
    /* Redessiner la polyline restaurée */
    _restaurerPolyline();
  }
  _lastSavedLength = 0;
  const btn = document.getElementById('tab-rec');
  if (btn) { btn.classList.add('recording'); btn.querySelector('.tab-icon').textContent = '⏹️'; }
  activerWakeLock();
  setOnNewPoint(() => _sauvegarderMaintenant(false));
  setLifecycleCallbacks(_onSuspend, _onResume);
  _demarrerSauvegardeLive();
  _demarrerStatsLive();
  const pn = document.getElementById('peek-normal');
  const pl = document.getElementById('peek-live');
  if (pn) pn.style.display = 'none';
  if (pl) pl.style.display = 'flex';
}

function _arreterEnregistrement() {
  state.gpsTracking = false;
  _sauvegarderMaintenant(true);
  const btn = document.getElementById('tab-rec');
  if (btn) { btn.classList.remove('recording'); btn.querySelector('.tab-icon').textContent = '⏺️'; }
  resetLivePolyline();
  desactiverWakeLock();
  setOnNewPoint(null);
  setLifecycleCallbacks(null, null);
  _arreterSauvegardeLive();
  _arreterStatsLive();
  /* Effacer le flag de persistance */
  try { localStorage.removeItem(REC_ENCOURS_KEY); } catch (e) {}
  const pn = document.getElementById('peek-normal');
  const pl = document.getElementById('peek-live');
  if (pn) pn.style.display = 'flex';
  if (pl) pl.style.display = 'none';
  const fabGps = document.getElementById('fab-gps');
  if (fabGps) fabGps.textContent = '📍';
  if (state.recTrace.length > 2) {
    document.getElementById('rec-choix-info').textContent = `${state.recTrace.length} points enregistrés — comment afficher la trace ?`;
    document.getElementById('recChoixPopup').style.display = 'flex';
  } else {
    _nettoyerTraceLive();
    showToast('Enregistrement arrêté — pas assez de points');
  }
}

/* Redessine la polyline à partir de la trace en mémoire */
function _restaurerPolyline() {
  if (!state.recTrace.length) return;
  resetLivePolyline();
  /* routeLayer.clearLayers(); — NE PAS effacer, on AJOUTE la trace restaurée */
  const lls = state.recTrace.map(p => [p.lat, p.lng]);
  const poly = L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.0, opacity: 0.9 }).addTo(routeLayer);
  /* Réassigner pour que _updateLiveTrace puisse l'utiliser via gps.js */
  /* On importe resetLivePolyline mais on a besoin de réassigner le livePolyline
     dans gps.js — on passe par une astuce : on reconstruit et gps.js
     détectera qu'il n'a pas de livePolyline et en créera un nouveau au prochain point */
  if (lls.length) map.panTo(lls[lls.length - 1]);
}

/* ═══════════ REPRISE AUTOMATIQUE APRÈS KILL/RELOAD ═══════════
   Appelée par app.js au démarrage. Si un enregistrement était en cours,
   on le reprend automatiquement au lieu de juste proposer la restauration. */
export function verifierTraceInterrompue() {
  try {
    const encours = localStorage.getItem(REC_ENCOURS_KEY);
    if (!encours) return;
    const raw = localStorage.getItem(REC_LIVE_KEY);
    if (!raw) { _nettoyerTraceLive(); return; }
    const pts = JSON.parse(raw);
    if (!pts || pts.length < 2) { _nettoyerTraceLive(); return; }

    /* ★ Reprise AUTOMATIQUE — l'enregistrement continue comme s'il ne s'était rien passé */
    _lancerEnregistrement(pts, false);
    const dureeMin = (pts[0].t && pts[pts.length - 1].t)
      ? Math.round((pts[pts.length - 1].t - pts[0].t) / 60000) : null;
    const msg = dureeMin
      ? `📍 Enregistrement repris — ${pts.length} pts, ~${dureeMin} min`
      : `📍 Enregistrement repris — ${pts.length} pts`;
    showToast(msg, 4000);
    console.log(`[Rec] Auto-reprise : ${pts.length} pts restaurés`);
  } catch (e) {
    console.error('[Rec] restauration:', e);
    _nettoyerTraceLive();
  }
}

/* Ancienne API conservée pour le popup de restauration (cas extrême) */
export function restaurerTraceLive(oui) {
  document.getElementById('recRestorePopup').style.display = 'none';
  _nettoyerTraceLive();
  if (!oui || !window._ptsInterrompus) { window._ptsInterrompus = null; return; }
  state.recTrace = window._ptsInterrompus;
  window._ptsInterrompus = null;
  document.getElementById('rec-choix-info').textContent = `${state.recTrace.length} points restaurés — comment afficher la trace ?`;
  document.getElementById('recChoixPopup').style.display = 'flex';
}

/* ═══════════ STATS LIVE ═══════════ */
function _demarrerStatsLive() {
  _mettreAJourStatsLive();
  _statsTimer = setInterval(_mettreAJourStatsLive, 5000);
}
function _arreterStatsLive() {
  if (_statsTimer) { clearInterval(_statsTimer); _statsTimer = null; }
}

function _mettreAJourStatsLive() {
  if (!state.recTrace.length) return;
  const lls    = state.recTrace.map(p => [p.lat, p.lng]);
  const distKm = (totalDist(lls) / 1000).toFixed(2);
  const debut  = state.recTrace[0].t || Date.now();
  const durSec = Math.round((Date.now() - debut) / 1000);
  const hh = Math.floor(durSec / 3600);
  const mm = Math.floor((durSec % 3600) / 60);
  const ss = durSec % 60;
  const durStr = hh > 0 ? `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  const eles = state.recTrace.map(p => p.ele ?? null);
  const gain = gainElev(eles);
  const altActuelle = Math.round(state.recTrace[state.recTrace.length - 1].ele || 0);
  let spdInst = '—', spdAvg = '—';
  if (state.recTrace.length >= 2) {
    const p1 = state.recTrace[state.recTrace.length - 2];
    const p2 = state.recTrace[state.recTrace.length - 1];
    const d  = L.latLng(p1.lat, p1.lng).distanceTo(L.latLng(p2.lat, p2.lng));
    const dt = p2.t && p1.t ? (p2.t - p1.t) / 1000 : 0;
    if (dt > 0) spdInst = (d / dt * 3.6).toFixed(1);
  }
  if (durSec > 0) spdAvg = (parseFloat(distKm) / durSec * 3600).toFixed(1);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('live-dist', distKm); set('live-dp', gain.pos); set('live-dm', gain.neg); set('live-dur', durStr);
  set('rp-dist', distKm);   set('rp-dur', durStr);    set('rp-dp', gain.pos);  set('rp-dm', gain.neg);
  set('rp-alt', altActuelle); set('rp-pts', state.recTrace.length); set('rp-spd', spdInst); set('rp-avg', spdAvg);
  _mettreAJourIndicateurSauvegarde();
}

/* ═══════════ SAUVEGARDE LIVE — filet de sécurité ═══════════ */
function _demarrerSauvegardeLive() {
  try { localStorage.setItem(REC_ENCOURS_KEY, '1'); } catch (e) {}
  _derniereSauvegarde = null;
  _lastSavedLength = 0;
  _saveLiveTimer = setInterval(() => _sauvegarderMaintenant(true), 5000);
}
function _arreterSauvegardeLive() {
  if (_saveLiveTimer) { clearInterval(_saveLiveTimer); _saveLiveTimer = null; }
}
function _nettoyerTraceLive() {
  try { localStorage.removeItem(REC_LIVE_KEY); localStorage.removeItem(REC_ENCOURS_KEY); } catch (e) {}
}
function _mettreAJourIndicateurSauvegarde() {
  const el = document.getElementById('rp-save-status');
  if (!el || !_derniereSauvegarde) return;
  const secAgo = Math.round((Date.now() - _derniereSauvegarde) / 1000);
  el.textContent = secAgo < 5 ? '💾 Trace sauvegardée' : `💾 Sauvegardée il y a ${secAgo}s`;
}

/* ═══════════ AFFICHAGE APRÈS ENREGISTREMENT ═══════════ */
export function afficherTraceBrut() {
  document.getElementById('recChoixPopup').style.display = 'none';
  _nettoyerTraceLive();
  state.manualCoords = state.recTrace.map(p => [p.lat, p.lng, p.ele ?? null]);
  routeLayer.clearLayers();
  const lls = state.recTrace.map(p => [p.lat, p.lng]);
  L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
  mkEditable(lls);
  updateStartEndMarkers(lls);
  drawElevation(state.recTrace.map(p => p.ele ?? null), lls);
  saveLocal();
  showChartArea(true);
  showToast(`Tracé GPS brut — ${state.recTrace.length} points`);
}

export async function afficherTraceSentiers() {
  document.getElementById('recChoixPopup').style.display = 'none';
  _nettoyerTraceLive();
  showToast('⏳ Calage de la trace sur les sentiers…', 5000);

  /* ★ v9.3 — MAP MATCHING (/trace_route) et non plus routage (/route).
     /route calculait un itinéraire OPTIMAL entre 40 waypoints simplifiés :
     entre deux waypoints Valhalla prenait librement n'importe quel chemin,
     d'où une trace qui ne suivait pas les sentiers réellement empruntés.
     Le map matching colle la trace GPS dense sur le parcours RÉEL. */
  const matched = await mapMatchTrace(state.recTrace);

  if (matched && matched.length >= 2) {
    state.manualCoords = matched;
    /* Waypoints d'édition (poignées) : version simplifiée de la trace */
    const pts = _simplifierTrace(state.recTrace, 40);
    state.manualPts = pts.map(p => [p.lng, p.lat]);
    routeLayer.clearLayers();
    const lls = state.manualCoords.map(c => [c[0], c[1]]);
    L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
    mkEditable(lls);
    updateStartEndMarkers(lls);
    drawElevation(state.manualCoords.map(c => c[2] ?? null), lls);
    saveLocal();
    showChartArea(true);
    showToast(`🥾 Trace recalée sur les sentiers — ${matched.length} points`);
    return;
  }

  /* Repli 1 : ancien recalcul par itinéraire (mieux que rien si matching KO) */
  console.warn('[Rec] Map matching indisponible — repli sur /route');
  const pts = _simplifierTrace(state.recTrace, 40);
  state.manualPts = pts.map(p => [p.lng, p.lat]);
  routeLayer.clearLayers();
  const coordsAvant = state.manualCoords.length;
  await rebuildRoute();
  if (state.manualCoords.length === coordsAvant && state.recTrace.length > 0) {
    /* Repli 2 : trace GPS brute */
    showToast('⚠ Routage indisponible — tracé GPS brut affiché', 4000);
    afficherTraceBrut();
    return;
  }
  showToast('⚠ Calage approximatif (itinéraire recalculé)', 4000);
  showChartArea(true);
}

function _simplifierTrace(trace, maxPts) {
  if (trace.length <= maxPts) return trace;
  const step = (trace.length - 1) / (maxPts - 1);
  const result = [];
  for (let i = 0; i < maxPts; i++) result.push(trace[Math.round(i * step)]);
  return result;
}

/* ═══════════ QUERY (pour app.js — bloquer le reload SW) ═══════════ */
export function isRecording() { return state.gpsTracking; }
