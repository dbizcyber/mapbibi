/* ── recording.js — session d'enregistrement GPS ── */
import { state }                     from './state.js';
import { activerWakeLock, desactiverWakeLock, resetLivePolyline, clearGpsRecState } from './gps.js';
import { switchTab, showChartArea }  from './ui.js';
import { showToast, totalDist, gainElev } from './utils.js';
import { rebuildRoute }              from './routing.js';
import { drawElevation }             from './elevation.js';
import { mkEditable, updateStartEndMarkers, routeLayer } from './map.js';
import { saveLocal }                 from './storage.js';
import { REC_LIVE_KEY, REC_ENCOURS_KEY } from './storage.js';

let _statsTimer    = null;
let _saveLiveTimer = null;
let _derniereSauvegarde = null;

/* ── DÉMARRER / ARRÊTER ── */
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
    clearGpsRecState();
    resetLivePolyline();
    routeLayer.clearLayers();
    btn.classList.add('recording');
    btn.querySelector('.tab-icon').textContent = '⏹️';
    activerWakeLock();
    _demarrerSauvegardeLive();
    _demarrerStatsLive();
    document.getElementById('peek-normal').style.display = 'none';
    document.getElementById('peek-live').style.display   = 'flex';
    showToast('Enregistrement GPS démarré');
  } else {
    btn.classList.remove('recording');
    btn.querySelector('.tab-icon').textContent = '⏺️';
    resetLivePolyline();
    desactiverWakeLock();
    _arreterSauvegardeLive();
    _arreterStatsLive();
    _nettoyerTraceLive();
    document.getElementById('peek-normal').style.display = 'flex';
    document.getElementById('peek-live').style.display   = 'none';
    if (state.recTrace.length > 2) {
      document.getElementById('rec-choix-info').textContent = `${state.recTrace.length} points enregistrés — comment afficher la trace ?`;
      document.getElementById('recChoixPopup').style.display = 'flex';
    } else {
      showToast(`Enregistrement arrêté — pas assez de points`);
    }
  }
}

/* ── STATS LIVE ── */
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
  /* N'utiliser que les altitudes validées (terrain ou GPS barométrique fiable) */
  const eles = state.recTrace.map(p => p.eleValid ? p.ele : null);
  const gain = gainElev(eles);
  /* Altitude actuelle : dernier point avec altitude valide */
  const dernierValid = [...state.recTrace].reverse().find(p => p.eleValid && p.ele != null);
  const altActuelle  = dernierValid ? Math.round(dernierValid.ele) : null;
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
  set('rp-alt', altActuelle != null ? altActuelle : '—'); set('rp-pts', state.recTrace.length); set('rp-spd', spdInst); set('rp-avg', spdAvg);
  _mettreAJourIndicateurSauvegarde();
}

/* ── SAUVEGARDE LIVE ── */
function _demarrerSauvegardeLive() {
  try { localStorage.setItem(REC_ENCOURS_KEY, '1'); } catch (e) {}
  _derniereSauvegarde = null;
  _saveLiveTimer = setInterval(() => {
    if (!state.gpsTracking || !state.recTrace.length) return;
    try {
      localStorage.setItem(REC_LIVE_KEY, JSON.stringify(state.recTrace));
      _derniereSauvegarde = Date.now();
      _mettreAJourIndicateurSauvegarde();
    } catch (e) {
      const el = document.getElementById('rp-save-status');
      if (el) el.textContent = '⚠ Sauvegarde impossible — mémoire pleine ?';
    }
  }, 15000);
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

/* ── RESTAURATION APRÈS KILL iOS ── */
export function verifierTraceInterrompue() {
  try {
    if (!localStorage.getItem(REC_ENCOURS_KEY)) return;
    const raw = localStorage.getItem(REC_LIVE_KEY);
    if (!raw) { _nettoyerTraceLive(); return; }
    const pts = JSON.parse(raw);
    if (!pts || pts.length < 3) { _nettoyerTraceLive(); return; }
    window._ptsInterrompus = pts;
    const dureeMin = (pts[0].t && pts[pts.length-1].t) ? Math.round((pts[pts.length-1].t - pts[0].t) / 60000) : '?';
    document.getElementById('rec-restore-info').textContent = `${pts.length} points GPS sauvegardés${dureeMin !== '?' ? ' · ~' + dureeMin + ' min' : ''} — enregistrement interrompu.`;
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

/* ── AFFICHAGE APRÈS ENREGISTREMENT ── */
export function afficherTraceBrut() {
  document.getElementById('recChoixPopup').style.display = 'none';
  state.manualCoords = state.recTrace.map(p => [p.lat, p.lng, p.eleValid ? (p.ele ?? null) : null]);
  routeLayer.clearLayers();
  const lls = state.recTrace.map(p => [p.lat, p.lng]);
  L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
  mkEditable(lls);
  updateStartEndMarkers(lls);
  drawElevation(state.recTrace.map(p => p.eleValid ? (p.ele ?? null) : null), lls);
  saveLocal();
  showChartArea(true);
  showToast(`Tracé GPS brut — ${state.recTrace.length} points`);
}

export async function afficherTraceSentiers() {
  document.getElementById('recChoixPopup').style.display = 'none';
  const pts = _simplifierTrace(state.recTrace, 40);
  state.manualPts = pts.map(p => [p.lng, p.lat]);
  routeLayer.clearLayers();
  const coordsAvant = state.manualCoords.length;
  showToast('⏳ Recalcul sur les sentiers…', 4000);
  await rebuildRoute();
  if (state.manualCoords.length === coordsAvant && state.recTrace.length > 0) {
    showToast('⚠ ORS indisponible — tracé GPS brut affiché', 4000);
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
