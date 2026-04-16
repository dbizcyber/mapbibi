/* ── gpx.js — import et export GPX ── */
import { state }                         from './state.js';
import { map, routeLayer, editMarkersGrp, mkEditable, updateStartEndMarkers } from './map.js';
import { drawElevation }                 from './elevation.js';
import { saveLocal }                     from './storage.js';
import { showToast }                     from './utils.js';
import { showChartArea }                 from './ui.js';

/* ── IMPORT ── */
function _gpx2geo(xml) {
  if (window.toGeoJSON && typeof window.toGeoJSON.gpx === 'function') return window.toGeoJSON.gpx(xml);
  if (window.togeojson && typeof window.togeojson.gpx === 'function') return window.togeojson.gpx(xml);
  throw new Error('Lib toGeoJSON absente');
}

function _readFileText(file) {
  return new Promise((res, rej) => {
    if (file.text) { file.text().then(res).catch(() => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = e => rej(e); fr.readAsText(file); }); }
    else { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = e => rej(e); fr.readAsText(file); }
  });
}

export async function handleImport(file) {
  if (!file) return;
  const st = document.getElementById('importStatus');
  const setErr = msg => { st.textContent = '❌ ' + msg; st.style.color = '#fc8181'; setTimeout(() => { st.textContent = ''; st.style.color = ''; }, 5000); };
  try {
    st.textContent = 'Import en cours…'; st.style.color = '';
    const text = await _readFileText(file);
    const isGPX = (file.name && file.name.toLowerCase().endsWith('.gpx')) || (typeof text === 'string' && (text.trim().startsWith('<gpx') || text.includes('<trk') || text.includes('<trkpt')));
    let geo = isGPX ? _gpx2geo(new DOMParser().parseFromString(text, 'text/xml')) : JSON.parse(text);
    if (!geo || !geo.features || !geo.features.length) { setErr('Aucune trace exploitable'); return; }
    state.manualPts = []; state.manualCoords = [];
    routeLayer.clearLayers(); editMarkersGrp.clearLayers();
    let coords = [];
    geo.features.forEach(f => {
      if (!f.geometry) return;
      if (f.geometry.type === 'LineString')      coords.push(...f.geometry.coordinates);
      if (f.geometry.type === 'MultiLineString') f.geometry.coordinates.forEach(s => coords.push(...s));
    });
    if (!coords.length) { setErr('Trace non lisible'); return; }
    /* Interpoler altitudes manquantes */
    const rawEle = coords.map(c => c.length >= 3 && c[2] != null && c[2] !== 0 ? c[2] : null);
    for (let i = 0; i < rawEle.length; i++) {
      if (rawEle[i] === null) {
        let prev = i - 1; while (prev >= 0 && rawEle[prev] === null) prev--;
        let next = i + 1; while (next < rawEle.length && rawEle[next] === null) next++;
        if (prev >= 0 && next < rawEle.length) rawEle[i] = rawEle[prev] + (rawEle[next] - rawEle[prev]) * (i - prev) / (next - prev);
        else if (prev >= 0) rawEle[i] = rawEle[prev];
        else if (next < rawEle.length) rawEle[i] = rawEle[next];
        else rawEle[i] = 0;
      }
    }
    coords.forEach((c, i) => { if (c.length >= 2) state.manualCoords.push([c[1], c[0], rawEle[i]]); });
    const lls = state.manualCoords.map(c => [c[0], c[1]]);
    L.polyline(lls, { color: 'red', weight: 4 }).addTo(routeLayer);
    mkEditable(lls); updateStartEndMarkers(lls);
    map.fitBounds(lls, { padding: [20, 20] });
    drawElevation(state.manualCoords.map(c => c[2] || 0), lls);
    state.importedTrace = true; state.userMovedMap = false;
    st.textContent = '✅ Import OK'; st.style.color = '#52b788';
    setTimeout(() => { st.textContent = ''; st.style.color = ''; }, 2000);
    showChartArea(true);
  } catch (e) { console.error('Import:', e); setErr(e.message || 'Erreur inconnue'); }
}

export function triggerImport() {
  document.getElementById('importFile').value = '';
  document.getElementById('importFile').click();
}

/* ── EXPORT ── */
export function exportGPX() {
  if (state.manualCoords.length < 2) { showToast('Aucune trace à exporter'); return; }
  if (typeof togpx !== 'function') { showToast('Lib togpx non chargée'); return; }
  const geo = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: state.manualCoords.map(c => [c[1], c[0], c[2] || 0]) }, properties: { name: 'Trace ORS' } }] };
  const gpx  = togpx(geo);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `trace_${dd}-${mm}-${now.getFullYear()}_${hh}h${min}.gpx`;
  a.click();
  showChartArea(true);
}

/* ── INIT drag & drop + input ── */
export function initGpxListeners() {
  document.getElementById('importFile').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleImport(f);
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) handleImport(e.dataTransfer.files[0]);
  });
}
