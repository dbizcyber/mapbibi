/* ── ibp.js — calcul IBP via ibpindex.com ── */
import { state }         from './state.js';
import { showToast }     from './utils.js';
import { showChartArea } from './ui.js';

const SKEY = 'traceur_manual_route_v1';

export async function computeIBP() {
  if (state.manualCoords.length < 2)  { showToast('Pas de trace à analyser'); return; }
  if (typeof togpx !== 'function')     { showToast('Lib togpx non chargée — vérifiez la connexion'); return; }

  const arrow  = document.getElementById('ibp-arrow');
  const desc   = document.getElementById('ibp-desc');
  const obtain = document.getElementById('obtain');
  if (arrow)  arrow.textContent  = '⏳';
  if (desc)   desc.textContent   = 'Calcul en cours…';
  if (obtain) obtain.innerHTML   = '⏳ Calcul IBP en cours…';
  showToast('Calcul IBP en cours…', 4000);
  showChartArea(true);

  try {
    const geo = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature',
        geometry: { type: 'LineString', coordinates: state.manualCoords.map(c => [c[1], c[0], c[2] || 0]) },
        properties: { name: 'Trace IBP' }
      }]
    };
    const gpxStr  = togpx(geo);
    const gpxBlob = new Blob([gpxStr], { type: 'application/gpx+xml' });
    const gpxFile = new File([gpxBlob], 'trace.gpx', { type: 'application/gpx+xml' });
    const fd      = new FormData();
    fd.append('key',  'ifwh7wlwykzixzxcg6rb');
    fd.append('type', 'hiking');
    fd.append('file', gpxFile, 'trace.gpx');

    const res = await fetch('https://www.ibpindex.com/api/', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();

    const v   = j.hiking && j.hiking.ibp !== undefined ? j.hiking.ibp : null;
    const dpl = j.hiking && j.hiking.accuclimb ? j.hiking.accuclimb : '—';

    if (v !== null) {
      ['sp-ibp', 'stat-ibp'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = v; });
      try { if (localStorage.getItem(SKEY)) localStorage.setItem('traceur_ibp_v1', JSON.stringify({ ibp: v, ts: Date.now() })); } catch (e) {}
    }
    if (obtain) obtain.innerHTML =
      `<b>IBP :</b> <span style="font-size:18px;color:#52b788">${v ?? '—'}</span>` +
      ` &nbsp; D+ accumulé : ${dpl} m` +
      (j.hiking && j.hiking.totalstoptime ? ` &nbsp; Temps arrêt : ${j.hiking.totalstoptime} s` : '');
    if (arrow) arrow.textContent = '✅';
    if (desc)  desc.textContent  = `IBP = ${v ?? '—'}`;
    showToast(`IBP calculé : ${v ?? '—'}`, 3000);
  } catch (err) {
    console.error('IBP:', err);
    if (obtain) obtain.innerHTML = '❌ Erreur IBP : ' + err.message;
    if (arrow)  arrow.textContent = '❌';
    if (desc)   desc.textContent  = 'Erreur — vérifiez la connexion';
    showToast('Erreur calcul IBP', 3000);
  }
}
