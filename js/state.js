/* ── state.js — source unique de vérité (singleton exporté) ── */

export const state = {
  /* Tracé manuel */
  manualPts:     [],   /* waypoints envoyés à ORS [ [lng,lat], … ] */
  manualCoords:  [],   /* coordonnées routées retournées [ [lat,lng,ele], … ] */
  importedTrace: false,
  userMovedMap:  false,

  /* Enregistrement GPS */
  gpsTracking:   false,
  recTrace:      [],   /* points GPS bruts { lat,lng,ele,acc,t } */

  /* Carte */
  curBase:  'tf',
  ovState:  { hiking: false, route: true, markers: false, restricted: false, tfsat: false },

  /* Mode boucle */
  modeBoucle:   false,
  boucleDepart: null,

  /* Mode ligne droite */
  modeAB: false,
};

/* Marqueurs Leaflet — non sérialisables, hors state */
export const markers = {
  start:    null,
  end:      null,
  gps:      null,
  boucleD:  null,
  boucleA:  null,
  slA:      null,
  slB:      null,
  slLine:   null,
};
