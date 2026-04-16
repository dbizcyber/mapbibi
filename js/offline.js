/* ── offline.js — pré-cache tuiles + détection réseau ── */
import { map }       from './map.js';
import { showToast } from './utils.js';

/* ── DÉTECTION HORS-LIGNE ── */
export function updateOnlineStatus() {
  document.getElementById('offline-bar').classList.toggle('visible', !navigator.onLine);
}

/* ── MODAL PRÉ-CACHE ── */
export function openPrecacheModal() {
  const zoom = Math.min(map.getZoom(), 16);
  document.getElementById('precache-zoom-label').textContent = zoom;
  document.getElementById('precache-status').textContent = 'Prêt à télécharger.';
  document.getElementById('precache-bar').style.width = '0%';
  document.getElementById('btn-start-precache').disabled = false;
  document.getElementById('btn-start-precache').textContent = '⬇️ Télécharger';
  document.getElementById('precache-modal').classList.add('open');
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'TILES_INFO' });
  }
  /* fermer le panel options pour voir la carte */
  import('./ui.js').then(m => m.switchTab('map'));
}

export function closePrecacheModal() {
  document.getElementById('precache-modal').classList.remove('open');
}

export function startPrecache() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    showToast("Service Worker non disponible — rechargez l'appli"); return;
  }
  if (!navigator.onLine) { showToast('Connexion requise pour télécharger les tuiles'); return; }
  const b      = map.getBounds();
  const zoom   = Math.min(map.getZoom(), 16);
  const bounds = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
  document.getElementById('btn-start-precache').disabled = true;
  document.getElementById('btn-start-precache').textContent = '⏳ En cours…';
  document.getElementById('precache-status').textContent = 'Connexion au Service Worker…';
  navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_TILES', bounds, zoom });
}

export function clearTilesCache() {
  if (!confirm('Vider tout le cache de tuiles ?')) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_TILES' });
  }
}

/* ── MESSAGES SW → app ── */
export function initSwMessages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', e => {
    const { type, fetched, total, errors, count, max, msg } = e.data || {};
    const bar    = document.getElementById('precache-bar');
    const status = document.getElementById('precache-status');
    const tcount = document.getElementById('tiles-count');
    if (type === 'PRECACHE_START')    { status.textContent = `Démarrage — ${total} tuiles à télécharger…`; }
    if (type === 'PRECACHE_PROGRESS') { bar.style.width = Math.round(fetched / total * 100) + '%'; status.textContent = `${fetched} / ${total} tuiles (${errors} erreurs)`; }
    if (type === 'PRECACHE_DONE')     {
      bar.style.width = '100%';
      status.textContent = `✅ Terminé — ${fetched} tuiles (${errors} erreurs)`;
      document.getElementById('btn-start-precache').disabled = false;
      document.getElementById('btn-start-precache').textContent = '⬇️ Télécharger';
      showToast(`✅ Zone téléchargée — ${fetched} tuiles en cache`);
    }
    if (type === 'PRECACHE_ERROR')    {
      status.textContent = '❌ ' + msg;
      document.getElementById('btn-start-precache').disabled = false;
      document.getElementById('btn-start-precache').textContent = '⬇️ Télécharger';
    }
    if (type === 'TILES_INFO_RESULT') { if (tcount) tcount.textContent = `Cache : ${count} / ${max} tuiles`; }
    if (type === 'CLEAR_TILES_DONE')  { showToast('Cache tuiles vidé'); if (tcount) tcount.textContent = 'Cache : 0 tuiles'; closePrecacheModal(); }
  });
}
