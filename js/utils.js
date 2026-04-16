/* ── utils.js — fonctions mathématiques pures (aucune dépendance) ── */

export function smooth(data, a = 0.22) {
  if (!data.length) return data;
  const o = new Array(data.length);
  o[0] = data[0];
  for (let i = 1; i < data.length; i++) o[i] = o[i - 1] * (1 - a) + data[i] * a;
  o[o.length - 1] = data[data.length - 1];
  return o;
}

export function gainElev(e, threshold = 5) {
  let u = 0, d = 0, pending = 0;
  for (let i = 1; i < e.length; i++) {
    pending += e[i] - e[i - 1];
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
