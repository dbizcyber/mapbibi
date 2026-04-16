/* ── overpass.js — sentiers interdits via Overpass API ── */
import { state }             from './state.js';
import { map, restrictedLayer } from './map.js';
import { showToast }         from './utils.js';

let _restrictedLoading = false;

export async function loadRestrictedPaths() {
  if (!state.ovState.restricted) return;
  if (_restrictedLoading) return;
  if (map.getZoom() < 13) {
    document.getElementById('ov-restricted-desc').textContent = 'Zoomez davantage (zoom ≥ 13)';
    return;
  }
  _restrictedLoading = true;
  const desc = document.getElementById('ov-restricted-desc');
  desc.textContent = 'Chargement…';

  const b    = map.getBounds();
  const bbox = `${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)}`;
  const query = `
    [out:json][timeout:20];
    (
      way[highway][access=private](${bbox});
      way[highway][access=no](${bbox});
      way[highway][foot=no](${bbox});
      way[highway][foot=private](${bbox});
    );
    out geom;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    restrictedLayer.clearLayers();
    let count = 0;
    (data.elements || []).forEach(el => {
      if (el.type !== 'way' || !el.geometry) return;
      const lls  = el.geometry.map(p => [p.lat, p.lon]);
      if (lls.length < 2) return;
      count++;
      const tags  = el.tags || {};
      let reason  = '';
      if (tags.access === 'private')    reason = 'Accès privé';
      else if (tags.access === 'no')    reason = 'Accès interdit';
      else if (tags.foot === 'no')      reason = 'Interdit aux piétons';
      else if (tags.foot === 'private') reason = 'Piétons : accès privé';
      const name  = tags.name ? `<b>${tags.name}</b><br>` : '';
      const owner = tags['owner'] || tags['operator'] || '';
      const poly  = L.polyline(lls, { color: '#cc44ff', weight: 4, opacity: 0.85, dashArray: '8,5' }).addTo(restrictedLayer);
      poly.bindPopup(
        `<div style="font-size:13px;min-width:140px">${name}<span style="color:#cc44ff;font-weight:700">🚫 ${reason}</span>${owner ? '<br><span style="color:#aaa;font-size:11px">' + owner + '</span>' : ''}</div>`,
        { className: 'restricted-popup' }
      );
    });
    desc.textContent = count > 0
      ? `${count} tronçon${count > 1 ? 's' : ''} interdit${count > 1 ? 's' : ''} — données OSM`
      : 'Aucun sentier interdit dans cette zone';
  } catch (e) {
    console.error('Overpass restricted:', e);
    const msg = !navigator.onLine ? 'Hors-ligne — données indisponibles' : 'Erreur chargement (' + e.message + ')';
    desc.textContent = '⚠ ' + msg;
    showToast('⚠ Sentiers interdits : ' + msg, 3500);
  } finally {
    _restrictedLoading = false;
  }
}
