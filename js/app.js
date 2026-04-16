/* ══════════════════════════════════════════════════════════
   app.js — point d'entrée MapiBiBi v8
   Importe tous les modules et câble les événements globaux
   ══════════════════════════════════════════════════════════ */

import { state }                               from './state.js';
import { showToast }                           from './utils.js';
import { saveLocal, loadLocal, loadCounters, resetCounters } from './storage.js';
import { switchTab, initBottomSheet, showChartArea, toggleChartArea,
         updateCounterUI, closeStartupPopup, applyUpdate,
         showUpdateToast, updateOnlineStatus, setLoading, setBtnLigne } from './ui.js';
import { map, switchLayer, toggleOverlay,
         updateStartEndMarkers, mkEditable, refreshPts,
         routeLayer, editMarkersGrp, editPts, markersGrp,
         centerGPS }                           from './map.js';
import { rebuildRoute }                        from './routing.js';
import { drawElevation, destroyCharts }        from './elevation.js';
import { initGPS }                             from './gps.js';
import { onclickRec, stopRecording, verifierTraceInterrompue,
         restaurerTraceLive, afficherTraceBrut, afficherTraceSentiers } from './recording.js';
import { handleImport, triggerImport, exportGPX, initGpxListeners } from './gpx.js';
import { openSearch, closeSearch, initSearchListeners } from './search.js';
import { openBouclePanel, annulerBoucle, boucleHandleTap } from './boucle.js';
import { startLigneDroite, clearLigneDroite }  from './ligne-droite.js';
import { computeIBP }                          from './ibp.js';
import { loadRestrictedPaths }                 from './overpass.js';
import { updateOnlineStatus as _netStatus,
         openPrecacheModal, closePrecacheModal, startPrecache,
         clearTilesCache, initSwMessages }     from './offline.js';

/* ── Exposer au HTML inline (onclick="…") ── */
Object.assign(window, {
  /* tabs */
  switchTab,
  /* UI */
  closeStartupPopup,
  applyUpdate,
  toggleChartArea,
  /* carte */
  centerGPS,
  switchLayer,
  toggleOverlay: (n) => toggleOverlay(n, loadRestrictedPaths),
  /* tracé */
  exportGPX,
  triggerImport,
  removeLastPoint,
  confirmClearAll,
  startLigneDroite,
  /* boucle */
  openBouclePanel,
  annulerBoucle,
  /* enregistrement */
  onclickRec,
  stopRecording,
  restaurerTraceLive,
  afficherTraceBrut,
  afficherTraceSentiers,
  /* recherche */
  openSearch,
  closeSearch,
  /* IBP */
  computeIBP,
  /* offline */
  openPrecacheModal,
  closePrecacheModal,
  startPrecache,
  clearTilesCache,
  /* compteurs */
  resetCounters: () => { const c = resetCounters(); if (c) { updateCounterUI(c); showToast('Compteurs réinitialisés'); } },
});

/* ── CLIC CARTE ── */
map.on('click', e => {
  if (state.modeAB) return;
  if (state.modeBoucle) {
    if (state.importedTrace) {
      if (!confirm('Une trace GPX est chargée.\nLa boucle va l\'effacer. Continuer ?')) return;
      state.importedTrace = false;
      state.manualCoords  = [];
      routeLayer.clearLayers();
      editMarkersGrp.clearLayers();
    }
    boucleHandleTap(e.latlng);
    return;
  }
  if (state.importedTrace) {
    if (!confirm('Une trace GPX est chargée.\nUn clic va démarrer un nouveau tracé et l\'effacer. Continuer ?')) return;
    state.importedTrace = false;
    state.manualCoords  = [];
    routeLayer.clearLayers();
    editMarkersGrp.clearLayers();
  }
  state.manualPts.push([e.latlng.lng, e.latlng.lat]);
  rebuildRoute();
});

/* ── ACTIONS TRACÉ ── */
function removeLastPoint() {
  if (!state.manualPts.length) return;
  state.manualPts.pop();
  rebuildRoute();
  refreshPts(() => rebuildRoute());
}

function confirmClearAll() {
  const hasRoute = state.manualCoords.length || state.manualPts.length;
  const hasSL    = window._slA || window._slB;
  if (!hasRoute && !hasSL) { showToast('Rien à effacer'); return; }
  if (!confirm('Effacer la trace, les points A/B et la ligne droite ?')) return;
  clearAll();
}

function clearAll() {
  state.manualPts     = [];
  state.manualCoords  = [];
  state.importedTrace = false;
  state.userMovedMap  = false;
  import('./gps.js').then(m => m.resetLivePolyline());
  const { markers }   = import('./state.js');
  routeLayer.clearLayers();
  markersGrp.clearLayers();
  editMarkersGrp.clearLayers();
  editPts.clearLayers();
  clearLigneDroite();
  updateStartEndMarkers([]);
  ['stat-dist','stat-dp','stat-dm','sp-dist','sp-dp','sp-dm','sp-ibp','stat-ibp']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
  const distEl = document.getElementById('distance');   if (distEl) distEl.innerHTML = '';
  const obEl   = document.getElementById('obtain');     if (obEl)   obEl.innerHTML  = '';
  const istEl  = document.getElementById('importStatus'); if (istEl) istEl.textContent = '';
  const ibpD   = document.getElementById('ibp-desc');   if (ibpD)   ibpD.textContent = 'Via ibpindex.com — sans téléchargement';
  const ibpA   = document.getElementById('ibp-arrow');  if (ibpA)   ibpA.textContent = '›';
  destroyCharts();
  showChartArea(false);
  import('./storage.js').then(m => m.clearLocal());
}

/* ── RÉSEAU ── */
window.addEventListener('online',  _netStatus);
window.addEventListener('offline', _netStatus);

/* ── INIT ── */
window.addEventListener('load', async () => {
  /* Popup de bienvenue */
  document.getElementById('startupPopup').style.display = 'flex';

  /* Statut réseau */
  _netStatus();

  /* Compteurs */
  updateCounterUI();

  /* Bottom sheet swipe */
  initBottomSheet();

  /* GPS */
  initGPS();

  /* Listeners clavier/recherche */
  initSearchListeners();

  /* Listeners GPX */
  initGpxListeners();

  /* Messages SW → app */
  initSwMessages();

  /* Restaurer trace locale */
  if (loadLocal()) {
    const lls = state.manualCoords.map(c => [c[0], c[1]]);
    L.polyline(lls, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
    mkEditable(lls);
    updateStartEndMarkers(lls);
    drawElevation(state.manualCoords.map(c => c[2] || 0), lls);
    map.fitBounds(lls, { padding: [20, 20] });
    showToast('Trace restaurée');
    showChartArea(true);
  }

  /* Vérifier enregistrement interrompu (iOS kill) */
  verifierTraceInterrompue();

  /* Service Worker */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[SW] enregistré', reg.scope);
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast();
        });
      });
    }).catch(e => console.warn('[SW] erreur:', e));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  setTimeout(() => map.invalidateSize(), 300);
});
