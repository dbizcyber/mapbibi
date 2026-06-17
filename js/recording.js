/* ── recording.js — session d'enregistrement GPS ──
   v9.1 — sauvegarde à chaque point GPS + résilience arrière-plan.
   La trace survit aux changements d'appli, verrou d'écran et kill iOS. */
import { state }                     from './state.js';
import { activerWakeLock, desactiverWakeLock, resetLivePolyline, clearGpsRecState,
         setOnNewPoint, setLifecycleCallbacks } from './gps.js';
import { switchTab, showChartArea }  from './ui.js';
import { showToast, totalDist, gainElev } from './utils.js';
import { rebuildRoute }              from './routing.js';
import { drawElevation }             from './elevation.js';
import { mkEditable, updateStartEndMarkers, routeLayer } from './map.js';
import { saveLocal }                 from './storage.js';
import { REC_LIVE_KEY, REC_ENCOURS_KEY } from './storage.js';

let _statsTimer        = null;
let _saveLiveTimer     = null;
let _derniereSauvegarde = null;
let _lastSavedLength   = 0;    /* évite les réécritures inutiles */

/* ═══════════ SAUVEGARDE IMMÉDIATE ═══════════
   Appelée à chaque nouveau point GPS ET à chaque passage en arrière-plan.
   Écriture synchrone dans localStorage — indispensable avant que l'OS
   ne gèle la page (pas de promesse, pas de setTimeout). */
function _sauvegarderMaintenant() {
  if (!state.gpsTracking || !state.recTrace.length) return;
  /* N'écrire que si la trace a changé */
  if (state.recTrace.length === _lastSavedLength) return;
  try {
    localStorage.setItem(REC_LIVE_KEY, JSON.stringify(state.recTrace));
    _lastSavedLength    = state.recTrace.length;
    _derniereSauvegarde = Date.now();
  } catch (e) {
    /* localStorage plein — on continue quand même l'enregistrement */
    console.warn('[Rec] localStorage plein:', e.message);
  }
}

/* ═══════════ LIFECYCLE CALLBACKS (appelés par gps.js) ═══════════ */
function _onSuspend() {
  /* Sauvegarde immédiate AVANT que l'OS ne gèle / tue la page */
  _sauvegarderMaintenant();
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
  /* Mettre à jour l'UI immédiatement au retour */
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
    state.recTrace = [];
    _lastSavedLength = 0;
    clearGpsRecState();
    resetLivePolyline();
    routeLayer.clearLayers();
    btn.classList.add('recording');
    btn.querySelector('.tab-icon').textContent = '⏹️';
    activerWakeLock();
    /* Câbler la sauvegarde à chaque point GPS */
    setOnNewPoint(_sauvegarderMaintenant);
    /* Câbler les callbacks de cycle de vie (suspend/resume) */
    setLifecycleCallbacks(_onSuspend, _onResume);
    _demarrerSauvegardeLive();
    _demarrerStatsLive();
    document.getElementById('peek-normal').style.display = 'none';
    document.getElementById('peek-live').style.display   = 'flex';
    showToast('Enregistrement GPS démarré');
  } else {
    btn.classList.remove('recording');
    btn.querySelector('.tab-icon').textContent = '⏺️';
    /* Sauvegarder une dernière fois avant de tout nettoyer */
    _sauvegarderMaintenant();
    resetLivePolyline();
    desactiverWakeLock();
    setOnNewPoint(null);
    setLifecycleCallbacks(null, null);
    _arreterSauvegardeLive();
    _arreterStatsLive();
    document.getElementById('peek-normal').style.display = 'flex';
    document.getElementById('peek-live').style.display   = 'none';
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

/* ═══════════ SAUVEGARDE LIVE (filet de sécurité) ═══════════
   Le timer est un filet : la vraie sauvegarde se fait à chaque point
   et à chaque passage en arrière-plan. Ce timer attrape les cas où
   l'altitude est mise à jour (Open-Elevation) sans nouveau point GPS. */
function _demarrerSauvegardeLive() {
  try { localStorage.setItem(REC_ENCOURS_KEY, '1'); } catch (e) {}
  _derniereSauvegarde = null;
  _lastSavedLength = 0;
  _saveLiveTimer = setInterval(() => {
    _sauvegarderMaintenant();
  }, 5000);  /* 5 s au lieu de 15 — plus résilient si le timer est throttlé */
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

/* ═══════════ RESTAURATION APRÈS KILL iOS ═══════════ */
export function verifierTraceInterrompue() {
  try {
    if (!localStorage.getItem(REC_ENCOURS_KEY)) return;
    const raw = localStorage.getItem(REC_LIVE_KEY);
    if (!raw) { _nettoyerTraceLive(); return; }
    const pts = JSON.parse(raw);
    if (!pts || pts.length < 3) { _nettoyerTraceLive(); return; }
    window._ptsInterrompus = pts;
    const dureeMin = (pts[0].t && pts[pts.length - 1].t)
      ? Math.round((pts[pts.length - 1].t - pts[0].t) / 60000) : '?';
    document.getElementById('rec-restore-info').textContent =
      `${pts.length} points GPS sauvegardés${dureeMin !== '?' ? ' · ~' + dureeMin + ' min' : ''} — enregistrement interrompu.`;
    document.getElementById('recRestorePopup').style.display = 'flex';
  } catch (e) { _nettoyerTraceLive(); }
}

export function restaurerTraceLive(oui) {
  document.getElementById('recRestorePopup').style.display = 'none';
  _nettoyerTraceLive();
  if (!oui || !window._ptsInterrompus) { window._ptsInterrompus = null; return; }
  state.recTrace = window._ptsInterrompus;
  window._ptsInterrompus = null;
  document.getElementById('rec-choix-info').textContent = `${state.recTrace.length} points restaurés — comment afficher la trace ?`;
  document.getElementById('recChoixPopup').style.display = 'flex';
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
  const pts = _simplifierTrace(state.recTrace, 40);
  state.manualPts = pts.map(p => [p.lng, p.lat]);
  routeLayer.clearLayers();
  const coordsAvant = state.manualCoords.length;
  showToast('⏳ Recalcul sur les sentiers…', 4000);
  await rebuildRoute();
  if (state.manualCoords.length === coordsAvant && state.recTrace.length > 0) {
    showToast('⚠ Routage indisponible — tracé GPS brut affiché', 4000);
    afficherTraceBrut();
    return;
  }
  showChartArea(true);
}

function _simplifierTrace(trace, maxPts) {
  if (trace.length <= maxPts) return trace;
  const step = (trace.length - 1) / (maxPts - 1);
  const result = [];
  for (let i = 0; i < maxPts; i++) result.push(trace[Math.round(i * step)]);
  return result;
}
