/* ── boucle.js — générateur de boucle (Mode A) ── */
import { state, markers } from './state.js';
import { map, routeLayer, editMarkersGrp } from './map.js';
import { rebuildRoute }   from './routing.js';
import { showToast }      from './utils.js';
import { showChartArea }  from './ui.js';

function setBoucleStatus(txt) {
  const el = document.getElementById('boucle-status');
  if (el) el.textContent = txt;
}

export function openBouclePanel() {
  const panel = document.getElementById('boucle-panel');
  const btn   = document.getElementById('btn-boucle');
  const isOpen = panel.style.display !== 'none';
  if (isOpen) { annulerBoucle(); return; }
  panel.style.display = 'block';
  btn.classList.add('is-active');
  const sh = document.getElementById('bottom-sheet');
  sh.classList.remove('collapsed'); sh.classList.add('expanded');
  state.modeBoucle   = true;
  state.boucleDepart = null;
  document.getElementById('boucle-annuler-btn').style.display = 'inline-block';
  setBoucleStatus('Tapez le point de départ sur la carte');
  showToast('Mode boucle — tapez le départ');
}

export function annulerBoucle() {
  state.modeBoucle   = false;
  state.boucleDepart = null;
  if (markers.boucleD) { map.removeLayer(markers.boucleD); markers.boucleD = null; }
  if (markers.boucleA) { map.removeLayer(markers.boucleA); markers.boucleA = null; }
  document.getElementById('boucle-panel').style.display = 'none';
  document.getElementById('btn-boucle').classList.remove('is-active');
  document.getElementById('boucle-annuler-btn').style.display = 'none';
  setBoucleStatus('');
}

const _mkBoucleIcon = (letter, color) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">${letter}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11]
});

export function boucleHandleTap(latlng) {
  if (!state.boucleDepart) {
    state.boucleDepart = [latlng.lng, latlng.lat];
    if (markers.boucleD) map.removeLayer(markers.boucleD);
    markers.boucleD = L.marker([latlng.lat, latlng.lng], { icon: _mkBoucleIcon('D', '#16a34a') }).addTo(map).bindTooltip('Départ boucle', { direction: 'top', offset: [0, -14] });
    setBoucleStatus("Tapez le point d'arrivée sur la carte");
    showToast("Départ posé — tapez l'arrivée");
  } else {
    const arrivee = [latlng.lng, latlng.lat];
    if (markers.boucleA) map.removeLayer(markers.boucleA);
    markers.boucleA = L.marker([latlng.lat, latlng.lng], { icon: _mkBoucleIcon('A', '#dc2626') }).addTo(map).bindTooltip('Arrivée boucle', { direction: 'top', offset: [0, -14] });
    setBoucleStatus('⏳ Calcul de la boucle…');
    state.modeBoucle = false;
    _genererBoucle(state.boucleDepart, arrivee);
  }
}

async function _genererBoucle(depart, arrivee) {
  if (markers.boucleD) { map.removeLayer(markers.boucleD); markers.boucleD = null; }
  if (markers.boucleA) { map.removeLayer(markers.boucleA); markers.boucleA = null; }
  const pivot = _calculerPivot(depart, arrivee);
  state.manualPts = [depart, pivot, arrivee, [depart[0], depart[1]]];
  routeLayer.clearLayers(); editMarkersGrp.clearLayers();
  const coordsAvant = state.manualCoords.length;
  await rebuildRoute();
  if (state.manualCoords.length === coordsAvant) {
    setBoucleStatus('❌ Calcul échoué — vérifiez la connexion');
    document.getElementById('boucle-annuler-btn').style.display = 'inline-block';
    return;
  }
  setBoucleStatus('✅ Boucle calculée');
  setTimeout(() => { annulerBoucle(); showChartArea(true); }, 2000);
}

function _calculerPivot(depart, arrivee) {
  const mLng = (depart[0] + arrivee[0]) / 2;
  const mLat = (depart[1] + arrivee[1]) / 2;
  const dLng = arrivee[0] - depart[0];
  const dLat = arrivee[1] - depart[1];
  const len  = Math.sqrt(dLng * dLng + dLat * dLat);
  if (len === 0) return [depart[0], depart[1] + 0.01];
  const pLng = -dLat / len;
  const pLat =  dLng / len;
  const offset = len / 2;
  return [mLng + pLng * offset, mLat + pLat * offset];
}
