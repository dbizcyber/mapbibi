/* ── map.js — carte Leaflet, couches, marqueurs ── */
import { state, markers } from './state.js';
import { showToast } from './utils.js';

/* ── INITIALISATION CARTE ── */
export const map = L.map('map', { zoomControl: false }).setView([46.8, 2.2], 6);
L.control.zoom({ position: 'topright' }).addTo(map);
map.on('dragstart', () => { state.userMovedMap = true; });
map.on('zoomstart', () => { state.userMovedMap = true; });

/* ── COUCHES DE BASE — 100 % gratuites, sans clé API ── */
export const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution: '© OpenStreetMap' });
export const otmLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  { maxZoom: 17, attribution: '© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)' });
const IGN_WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
export const ignLayer = L.tileLayer(IGN_WMTS + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&FORMAT=image/png',
  { maxZoom: 19, attribution: '© IGN-F / Géoplateforme' });
export const satLayer  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });
export const otmSatLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, opacity: 0.7 });
export const hikingOv  = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', { maxZoom: 18, opacity: 0.9 });
otmLayer.addTo(map); /* OpenTopoMap par défaut — courbes de niveau, idéal rando */

export const BASE_LAYERS = { osm: osmLayer, otm: otmLayer, ign: ignLayer, sat: satLayer };

/* ── GROUPES DE CALQUES ── */
export const markersGrp       = L.layerGroup();
export const routeLayer       = L.layerGroup().addTo(map);
export const slLayer          = L.layerGroup().addTo(map);
export const editMarkersGrp   = L.layerGroup().addTo(map);
export const editPts          = L.layerGroup();
export const searchGrp        = L.layerGroup().addTo(map);
export const restrictedLayer  = L.layerGroup();

/* ── CHANGEMENT DE COUCHE DE BASE ── */
export function switchLayer(n) {
  if (!BASE_LAYERS[n]) return;
  if (BASE_LAYERS[state.curBase]) map.removeLayer(BASE_LAYERS[state.curBase]);
  BASE_LAYERS[n].addTo(map);
  state.curBase = n;
  Object.keys(BASE_LAYERS).forEach(k => {
    document.getElementById('layer-' + k)?.classList.toggle('active', k === n);
  });
}

/* URL de tuiles du fond actif — pour le pré-cache hors-ligne */
export function currentTileTemplate() {
  const layer = BASE_LAYERS[state.curBase] || osmLayer;
  return layer._url.replace('{s}', 'a');
}

/* ── OVERLAYS ── */
export function toggleOverlay(n, loadRestrictedCb) {
  state.ovState[n] = !state.ovState[n];
  if (n === 'hiking') {
    state.ovState.hiking ? hikingOv.addTo(map) : map.removeLayer(hikingOv);
    document.getElementById('ov-hiking').textContent = state.ovState.hiking ? '●' : '○';
  }
  if (n === 'route') {
    state.ovState.route ? routeLayer.addTo(map) : map.removeLayer(routeLayer);
    document.getElementById('ov-route').textContent = state.ovState.route ? '●' : '○';
  }
  if (n === 'markers') {
    state.ovState.markers ? markersGrp.addTo(map) : map.removeLayer(markersGrp);
    state.ovState.markers ? editPts.addTo(map)    : map.removeLayer(editPts);
    document.getElementById('ov-markers').textContent = state.ovState.markers ? '●' : '○';
  }
  if (n === 'tfsat') {
    state.ovState.tfsat ? otmSatLayer.addTo(map) : map.removeLayer(otmSatLayer);
    const el = document.getElementById('ov-tfsat');
    el.textContent  = state.ovState.tfsat ? '●' : '○';
    el.style.color  = state.ovState.tfsat ? '#52b788' : '';
  }
  if (n === 'restricted') {
    const el   = document.getElementById('ov-restricted');
    const desc = document.getElementById('ov-restricted-desc');
    if (state.ovState.restricted) {
      restrictedLayer.addTo(map);
      el.textContent = '●'; el.style.color = '#cc44ff';
      desc.textContent = 'Chargement…';
      loadRestrictedCb && loadRestrictedCb();
      map.on('moveend', loadRestrictedCb);
    } else {
      map.removeLayer(restrictedLayer);
      restrictedLayer.clearLayers();
      map.off('moveend', loadRestrictedCb);
      el.textContent = '○'; el.style.color = '';
      desc.textContent = 'Privés, accès refusé — données OSM · zoom ≥ 13';
    }
  }
}

/* ── MARQUEURS DÉPART / ARRIVÉE ── */
export function updateStartEndMarkers(lls) {
  if (markers.start) { map.removeLayer(markers.start); markers.start = null; }
  if (markers.end)   { map.removeLayer(markers.end);   markers.end   = null; }
  if (!lls || lls.length < 1) return;
  const mkIcon = (letter, color) => L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700">${letter}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
  markers.start = L.marker(lls[0], { icon: mkIcon('D', '#16a34a'), zIndexOffset: 1000 }).addTo(map).bindTooltip('Départ', { direction: 'top', offset: [0, -14] });
  if (lls.length > 1) markers.end = L.marker(lls[lls.length - 1], { icon: mkIcon('A', '#dc2626'), zIndexOffset: 1000 }).addTo(map).bindTooltip('Arrivée', { direction: 'top', offset: [0, -14] });
}

/* ── POINTS ÉDITABLES ── */
export function mkEditable(lls) {
  editMarkersGrp.clearLayers();
  lls.forEach((ll, i) => {
    const mk = L.circleMarker([ll[0], ll[1]], { radius: 4, color: null, weight: 0, fillColor: '#2a66c7', fillOpacity: 1 }).addTo(markersGrp);
    const px = L.marker([ll[0], ll[1]], { opacity: 0, draggable: true }).addTo(editMarkersGrp);
    px.on('drag', e => mk.setLatLng(e.target.getLatLng()));
    px.on('dragend', e => {
      const n = e.target.getLatLng();
      if (state.manualCoords[i]) { state.manualCoords[i][0] = n.lat; state.manualCoords[i][1] = n.lng; }
      routeLayer.clearLayers();
      const lls2 = state.manualCoords.map(c => [c[0], c[1]]);
      L.polyline(lls2, { color: '#e53e3e', weight: 3, smoothFactor: 1.5 }).addTo(routeLayer);
      import('./elevation.js').then(m => m.drawElevation(state.manualCoords.map(c => c[2] ?? null), lls2));
      import('./storage.js').then(m => m.saveLocal());
    });
  });
}

export function refreshPts(rebuildCb) {
  editPts.clearLayers();
  state.manualPts.forEach((p, i) => {
    const m = L.circleMarker([p[1], p[0]], { radius: 4, color: null, weight: 0, fillColor: '#c7302a', fillOpacity: 0.9 }).addTo(editPts);
    m.on('contextmenu', () => { state.manualPts.splice(i, 1); rebuildCb(); refreshPts(rebuildCb); });
  });
}

export function centerGPS() {
  if (markers.gps) {
    state.userMovedMap = false;   /* réactive le suivi automatique */
    map.setView(markers.gps.getLatLng(), 15);
    /* Mettre à jour l'icône si enregistrement en cours */
    const fabGps = document.getElementById('fab-gps');
    if (fabGps && state.gpsTracking) fabGps.textContent = '🔒';
  } else {
    showToast('GPS non disponible');
  }
}
