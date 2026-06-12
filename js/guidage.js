/* ── guidage.js — alerte d'écart de trace ──
   Surveille la distance entre la position GPS et la trace chargée.
   Au-delà du seuil : vibration + toast. Hystérésis pour éviter le spam. */
import { state }     from './state.js';
import { showToast } from './utils.js';

const SEUIL_ALERTE  = 50;     /* m — déclenche l'alerte */
const SEUIL_RETOUR  = 35;     /* m — considéré « de retour » (hystérésis) */
const THROTTLE_MS   = 3000;   /* fréquence max de vérification */
const REALERTE_MS   = 30000;  /* re-vibrer au plus toutes les 30 s hors trace */
const PREF_KEY      = 'mapibibi_alerte_ecart';

let _horsTrace      = false;
let _derniereVerif  = 0;
let _derniereAlerte = 0;

/* ── Préférence utilisateur ── */
export function alerteActive() {
  try { return localStorage.getItem(PREF_KEY) !== '0'; } catch (e) { return true; }
}

export function toggleAlerteEcart() {
  const on = !alerteActive();
  try { localStorage.setItem(PREF_KEY, on ? '1' : '0'); } catch (e) {}
  _majToggleUI(on);
  showToast(on ? 'Alerte d\'écart activée (seuil 50 m)' : 'Alerte d\'écart désactivée');
  if (!on) _horsTrace = false;
}

export function initGuidageUI() { _majToggleUI(alerteActive()); }

function _majToggleUI(on) {
  const el = document.getElementById('ov-ecart');
  if (el) { el.textContent = on ? '●' : '○'; el.style.color = on ? '#52b788' : ''; }
}

/* ── Distance point → segment (projection équirectangulaire locale, m) ── */
function _distPointSegment(plat, plng, alat, alng, blat, blng) {
  const kx = 111320 * Math.cos(plat * Math.PI / 180);
  const ky = 110540;
  const ax = (alng - plng) * kx, ay = (alat - plat) * ky;
  const bx = (blng - plng) * kx, by = (blat - plat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.sqrt(cx * cx + cy * cy);
}

/* Distance minimale du point à la trace entière */
export function distanceALaTrace(lat, lng) {
  const c = state.manualCoords;
  if (!c || c.length < 2) return null;
  let min = Infinity;
  for (let i = 1; i < c.length; i++) {
    /* Pré-filtre grossier : si les deux extrémités du segment sont à plus
       de (min + 200 m) en latitude seule, inutile de calculer précisément */
    const dLatM = Math.min(Math.abs(c[i - 1][0] - lat), Math.abs(c[i][0] - lat)) * 110540;
    if (dLatM > min + 200) continue;
    const d = _distPointSegment(lat, lng, c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]);
    if (d < min) min = d;
    if (min < 5) break; /* déjà quasiment dessus */
  }
  return min === Infinity ? null : min;
}

/* ── Vérification appelée à chaque position GPS (throttlée) ── */
export function verifierEcart(lat, lng) {
  if (!alerteActive()) return;
  if (!state.manualCoords || state.manualCoords.length < 2) return;

  const now = Date.now();
  if (now - _derniereVerif < THROTTLE_MS) return;
  _derniereVerif = now;

  const d = distanceALaTrace(lat, lng);
  if (d == null) return;

  if (d > SEUIL_ALERTE) {
    if (!_horsTrace || now - _derniereAlerte > REALERTE_MS) {
      _horsTrace      = true;
      _derniereAlerte = now;
      if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
      showToast(`⚠ Écart de trace : ${Math.round(d)} m`, 3500);
    }
  } else if (_horsTrace && d < SEUIL_RETOUR) {
    _horsTrace = false;
    if (navigator.vibrate) navigator.vibrate(120);
    showToast('✅ De retour sur la trace', 2500);
  }
}
