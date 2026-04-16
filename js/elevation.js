/* ── elevation.js — profil altimétrique via Chart.js ── */
import { smooth, gainElev, totalDist, cumDist } from './utils.js';

let chart1 = null, chart2 = null;

export function drawElevation(elevs, lls = []) {
  const raw = elevs && elevs.length ? elevs.map(e => Math.round(e || 0)) : [];
  const s   = raw.length ? smooth(raw) : [];
  const g   = gainElev(raw);
  const km  = lls.length ? (totalDist(lls) / 1000).toFixed(2) : '0.00';
  const cum = lls.length ? cumDist(lls) : s.map((_, i) => i);

  /* peek & stats panel */
  ['stat-dist', 'sp-dist'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = km; });
  ['stat-dp',   'sp-dp'  ].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = g.pos; });
  ['stat-dm',   'sp-dm'  ].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = g.neg; });

  const distEl = document.getElementById('distance');
  if (distEl) distEl.innerHTML = `<b>Distance:</b> ${km} km &nbsp;⬆️ D+ ${g.pos} m &nbsp;⬇️ D- ${g.neg} m`;

  const cfg = {
    type: 'line',
    data: {
      labels: cum,
      datasets: [{
        label: 'Altitude (m)', data: s,
        borderWidth: 2, fill: true,
        borderColor: '#52b788',
        backgroundColor: 'rgba(82,183,136,.15)',
        tension: 0.25, pointRadius: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,.5)', maxTicksLimit: 5 }, grid: { color: 'rgba(255,255,255,.07)' }, title: { display: true, text: 'km', color: 'rgba(255,255,255,.4)' } },
        y: { ticks: { color: 'rgba(255,255,255,.5)' }, grid: { color: 'rgba(255,255,255,.07)' }, title: { display: true, text: 'm', color: 'rgba(255,255,255,.4)' } }
      }
    }
  };

  const c1 = document.getElementById('elevationChart');
  if (c1) { if (chart1) chart1.destroy(); chart1 = new Chart(c1.getContext('2d'), JSON.parse(JSON.stringify(cfg))); }

  const c2 = document.getElementById('elevationChartStats');
  if (c2) { if (chart2) chart2.destroy(); chart2 = new Chart(c2.getContext('2d'), JSON.parse(JSON.stringify(cfg))); }
}

export function destroyCharts() {
  if (chart1) { chart1.destroy(); chart1 = null; }
  if (chart2) { chart2.destroy(); chart2 = null; }
}
