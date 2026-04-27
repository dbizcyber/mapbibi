/* ── utils.js — fonctions mathématiques pures (aucune dépendance) ── */

/**
 * Filtre un tableau d'altitudes en supprimant les valeurs null/undefined/0-parasite.
 * Retourne un tableau de même longueur avec les trous interpolés linéairement.
 * Les 0 ne sont PAS filtrés automatiquement (une altitude réelle peut être 0m NGF),
 * on se base uniquement sur null/undefined pour marquer "non fiable".
 */
export function fillEleGaps(eles) {
  if (!eles || !eles.length) return [];
  const out = eles.slice();
  // Première passe : interpoler les null/undefined
  let lastValid = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) { lastValid = i; continue; }
    // Chercher la prochaine valeur valide
    let nextValid = -1;
    for (let j = i + 1; j < out.length; j++) { if (out[j] != null) { nextValid = j; break; } }
    if (lastValid === -1 && nextValid === -1) { out[i] = 0; }
    else if (lastValid === -1) { out[i] = out[nextValid]; }
    else if (nextValid === -1) { out[i] = out[lastValid]; }
    else {
      const span = nextValid - lastValid;
      out[i] = out[lastValid] + (out[nextValid] - out[lastValid]) * ((i - lastValid) / span);
    }
  }
  return out.map(v => Math.round(v));
}

export function smooth(data, a = 0.22) {
  if (!data.length) return data;
  // Interpoler les trous avant de lisser
  const filled = fillEleGaps(data);
  const o = new Array(filled.length);
  o[0] = filled[0];
  for (let i = 1; i < filled.length; i++) o[i] = o[i - 1] * (1 - a) + filled[i] * a;
  o[o.length - 1] = filled[filled.length - 1];
  return o;
}

export function gainElev(e, threshold = 5) {
  // Filtrer les nulls/undefined avant calcul
  const valid = fillEleGaps(e);
  let u = 0, d = 0, pending = 0;
  for (let i = 1; i < valid.length; i++) {
    pending += valid[i] - valid[i - 1];
    if (pending > threshold)       { u += pending;           pending = 0; }
    else if (pending < -threshold) { d += Math.abs(pending); pending = 0; }
  }
  return { pos: Math.round(u), neg: Math.round(d) };
}

export function totalDist(lls) {
  let t = 0;
  for (let i = 1; i < lls.length; i++) t += L.latLng(lls[i - 1]).distanceTo(L.latLng(lls[i]));
  return t;
}

export function cumDist(lls) {
  let a = [0], t = 0;
  for (let i = 1; i < lls.length; i++) {
    t += L.latLng(lls[i - 1]).distanceTo(L.latLng(lls[i]));
    a.push((t / 1000).toFixed(3));
  }
  return a;
}

export function showToast(txt, dur = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = txt;
  el.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { el.style.display = 'none'; }, dur);
}
