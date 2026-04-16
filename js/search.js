/* ── search.js — géocodage Nominatim ── */
import { state }          from './state.js';
import { map, searchGrp } from './map.js';

let _searchTimer = null;

export function openSearch() {
  document.getElementById('searchResults').style.display = 'block';
  document.getElementById('search-overlay').classList.add('visible');
  setTimeout(() => document.getElementById('searchInput').focus(), 60);
}

export function closeSearch() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('search-overlay').classList.remove('visible');
  document.getElementById('searchInput').value = '';
  document.getElementById('search-items').innerHTML = '';
}

export async function searchLocation() {
  const q     = document.getElementById('searchInput').value.trim();
  const items = document.getElementById('search-items');
  if (!q) { items.innerHTML = ''; return; }
  items.innerHTML = '<div class="search-item"><div class="sname">🔎 Recherche…</div></div>';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}&addressdetails=1&accept-language=fr`, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    if (!data.length) { items.innerHTML = '<div class="search-item"><div class="sname">Aucun résultat</div></div>'; return; }
    items.innerHTML = '';
    data.forEach(pl => {
      const nm  = pl.display_name || (pl.name || 'Lieu inconnu');
      const lat = parseFloat(pl.lat), lng = parseFloat(pl.lon);
      const el  = document.createElement('div');
      el.className = 'search-item';
      el.innerHTML = `<div class="sname">${nm}</div><div class="stype">${pl.type || ''}</div>`;
      el.onclick = () => {
        map.setView([lat, lng], Math.max(13, pl.zoom ? +pl.zoom : 14));
        state.userMovedMap = true;
        searchGrp.clearLayers();
        L.marker([lat, lng]).addTo(searchGrp).bindPopup(`<b>${nm}</b>`).openPopup();
        closeSearch();
      };
      items.appendChild(el);
    });
  } catch (e) {
    items.innerHTML = `<div class="search-item"><div class="sname" style="color:#fc8181">Erreur: ${e.message}</div></div>`;
  }
}

export function initSearchListeners() {
  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); clearTimeout(_searchTimer); searchLocation(); }
    if (e.key === 'Escape') closeSearch();
  });
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = document.getElementById('searchInput').value.trim();
    if (q.length < 3) { document.getElementById('search-items').innerHTML = ''; return; }
    _searchTimer = setTimeout(searchLocation, 500);
  });
  document.getElementById('search-overlay').addEventListener('click', () => closeSearch());
  map.on('click', () => { document.getElementById('searchResults').style.display = 'none'; });
}
