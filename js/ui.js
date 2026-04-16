/* ── ui.js — tabs, bottom sheet, toasts, popups ── */
import { loadCounters } from './storage.js';
import { showToast } from './utils.js';

/* ── TABS ── */
export function switchTab(n) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('visible'));
  if (n === 'map')     document.getElementById('tab-map').classList.add('active');
  if (n === 'rec')     { document.getElementById('tab-rec').classList.add('active');     document.getElementById('rec-panel').classList.add('visible'); }
  if (n === 'stats')   { document.getElementById('tab-stats').classList.add('active');   document.getElementById('stats-panel').classList.add('visible'); }
  if (n === 'options') { document.getElementById('tab-options').classList.add('active'); document.getElementById('options-panel').classList.add('visible'); updateCounterUI(); }
}

/* ── BOTTOM SHEET ── */
export function initBottomSheet() {
  const sh = document.getElementById('bottom-sheet');
  const hw = document.getElementById('sheet-handle-wrap');
  let sy = 0, dragging = false;
  hw.addEventListener('click', () => { sh.classList.toggle('collapsed'); sh.classList.toggle('expanded'); });
  hw.addEventListener('touchstart', e => { sy = e.touches[0].clientY; dragging = true; sh.style.transition = 'none'; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy  = e.touches[0].clientY - sy;
    const cur = new DOMMatrix(getComputedStyle(sh).transform).m42;
    sh.style.transform = `translateY(${Math.max(0, cur + dy - sy)}px)`;
    sy = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sh.style.transition = '';
    const ty = new DOMMatrix(getComputedStyle(sh).transform).m42;
    if (ty > sh.offsetHeight * 0.3) { sh.classList.add('collapsed'); sh.classList.remove('expanded'); }
    else { sh.classList.remove('collapsed'); sh.classList.add('expanded'); }
    sh.style.transform = '';
  });
}

export function showChartArea(v) {
  document.getElementById('sheet-chart-area').classList.toggle('visible', v);
  document.getElementById('btn-chart').classList.toggle('is-active', v);
  if (v) {
    const sh = document.getElementById('bottom-sheet');
    sh.classList.remove('collapsed');
    sh.classList.add('expanded');
  }
}

export function toggleChartArea() {
  showChartArea(!document.getElementById('sheet-chart-area').classList.contains('visible'));
}

/* ── COMPTEURS UI ── */
export function updateCounterUI(c) {
  c = c || loadCounters();
  const orsEl  = document.getElementById('counter-ors');
  const valEl  = document.getElementById('counter-valhalla');
  const orsBdg = document.getElementById('counter-ors-badge');
  const valBdg = document.getElementById('counter-valhalla-badge');
  if (orsEl)  orsEl.textContent  = `${c.ors} requête${c.ors > 1 ? 's' : ''} ce mois`;
  if (valEl)  valEl.textContent  = `${c.valhalla} requête${c.valhalla > 1 ? 's' : ''} ce mois — ${Math.round(c.valhalla * 20)} crédits`;
  if (orsBdg) { orsBdg.textContent = c.ors;      orsBdg.style.color = c.ors      > 1800 ? '#f87171' : '#4ade80'; }
  if (valBdg) { valBdg.textContent = c.valhalla; valBdg.style.color = c.valhalla > 100  ? '#f87171' : '#c084fc'; }
}

/* ── INDICATEUR CHARGEMENT ORS ── */
export function setLoading(on, errMsg) {
  const ind  = document.getElementById('ors-indicator');
  const ibp  = document.getElementById('stat-ibp-wrap');
  const stat = document.getElementById('importStatus');
  if (on) {
    if (ind)  { ind.style.display = 'inline'; ind.textContent = '⟳ ORS…'; }
    if (ibp)  ibp.style.display = 'none';
    if (stat) { stat.textContent = ''; stat.style.color = ''; }
  } else {
    if (ind) ind.style.display = 'none';
    if (ibp) ibp.style.display = 'inline';
    if (errMsg && stat) {
      stat.textContent  = errMsg;
      stat.style.color  = '#fc8181';
      setTimeout(() => { stat.textContent = ''; stat.style.color = ''; }, 4000);
    }
  }
}

/* ── POPUP DÉMARRAGE ── */
export function closeStartupPopup() {
  document.getElementById('startupPopup').style.display = 'none';
}

/* ── PWA UPDATE TOAST ── */
export function showUpdateToast() {
  document.getElementById('update-toast').classList.add('visible');
}

export function applyUpdate() {
  document.getElementById('update-toast').classList.remove('visible');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      else window.location.reload();
    });
  } else {
    window.location.reload();
  }
}

/* ── LIGNE DROITE — état du bouton ── */
export function setBtnLigne(s) {
  const btn   = document.getElementById('btn-ligne');
  const label = document.getElementById('btn-ligne-label');
  if (!btn || !label) return;
  btn.classList.remove('is-active');
  const iconEl = btn.querySelector('.act-icon');
  if (s === 'A')    { btn.classList.add('is-active'); iconEl.textContent = '🅰️'; label.textContent = 'Tapez A…'; }
  else if (s === 'B') { btn.classList.add('is-active'); iconEl.textContent = '🅱️'; label.textContent = 'Tapez B…'; }
  else if (s === 'done') { iconEl.textContent = '📏'; label.textContent = 'Ligne tracée'; }
  else { iconEl.textContent = '📏'; label.textContent = 'Ligne droite'; }
}

/* ── HORS-LIGNE ── */
export function updateOnlineStatus() {
  document.getElementById('offline-bar').classList.toggle('visible', !navigator.onLine);
}
