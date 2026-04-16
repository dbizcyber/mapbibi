/* ── ligne-droite.js — outil ligne droite A→B ── */
import { state, markers }   from './state.js';
import { map, slLayer }     from './map.js';
import { showToast }        from './utils.js';
import { setBtnLigne }      from './ui.js';

export function startLigneDroite() {
  if (state.modeAB) {
    state.modeAB = false;
    setBtnLigne('idle');
    showToast('Ligne droite annulée');
    return;
  }
  slLayer.clearLayers();
  markers.slA = null; markers.slB = null; markers.slLine = null;
  state.modeAB = true;
  setBtnLigne('A');
  showToast('Tapez le 1er point (A)');
  map.once('click', _handlerA);
}

function _handlerA(e) {
  markers.slA = L.marker(e.latlng, { title: 'A' })
    .addTo(slLayer)
    .bindTooltip('A', { permanent: true, direction: 'top', offset: [0, -10], className: 'sl-label' })
    .openTooltip();
  setBtnLigne('B');
  showToast('Tapez le 2ème point (B)');
  map.once('click', _handlerB);
}

function _handlerB(e) {
  markers.slB = L.marker(e.latlng, { draggable: true, title: 'B' })
    .addTo(slLayer)
    .bindTooltip('B', { permanent: true, direction: 'top', offset: [0, -10], className: 'sl-label' })
    .openTooltip();
  markers.slB.on('drag', () => _updateSL());
  markers.slLine = L.polyline(
    [[markers.slA.getLatLng().lat, markers.slA.getLatLng().lng], [e.latlng.lat, e.latlng.lng]],
    { color: '#e53e3e', weight: 3, dashArray: '7,5' }
  ).addTo(slLayer);
  map.fitBounds([[markers.slA.getLatLng().lat, markers.slA.getLatLng().lng], [e.latlng.lat, e.latlng.lng]], { padding: [50, 50] });
  state.modeAB = false;
  setBtnLigne('done');
  _updateSL();
  showToast('Ligne droite tracée — B est déplaçable');
}

function _updateSL() {
  if (!markers.slA || !markers.slB || !markers.slLine) return;
  const A = markers.slA.getLatLng();
  const B = markers.slB.getLatLng();
  markers.slLine.setLatLngs([[A.lat, A.lng], [B.lat, B.lng]]);
  const dk = (A.distanceTo(B) / 1000).toFixed(2);
  slLayer.eachLayer(l => { if (l.options && l.options.icon && l.options.icon.options.className === 'distance-label') slLayer.removeLayer(l); });
  L.marker([(A.lat + B.lat) / 2, (A.lng + B.lng) / 2], {
    icon: L.divIcon({ className: 'distance-label', html: `📏 ${dk} km`, iconSize: [90, 24] }),
    interactive: false
  }).addTo(slLayer);
}

export function clearLigneDroite() {
  slLayer.clearLayers();
  markers.slA = null; markers.slB = null; markers.slLine = null;
  state.modeAB = false;
  setBtnLigne('idle');
}
