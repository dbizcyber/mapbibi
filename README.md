# MapiBiBi v9.0 — 100 % outils gratuits

Traceur de randonnée pédestre (PWA) — sans aucune clé API.

- **Routage** : Valhalla OSM public (`valhalla1.openstreetmap.de`) — piéton, polyline6 auto-détecté, altitudes intégrées (`elevation_interval: 30`)
- **Altitude terrain** : Open-Elevation (SRTM 30 m) en enrichissement GPS
- **Fonds de carte** : OpenTopoMap (défaut), Plan IGN (Géoplateforme), OpenStreetMap, Satellite Esri + surcouche Waymarked Trails
- **Hors-ligne** : Service Worker v9 — modules JS cachés à l'installation, pré-cache des tuiles du fond actif
- **Recherche** : Nominatim · **Sentiers interdits** : Overpass · **IBP** : ibpindex.com
*************
MapiBiBi v9.0 reconstruite sur la bonne base — l'architecture modulaire v8.7 (17 modules ES). Bonne nouvelle : cette version avait déjà le meilleur du travail précédent (Valhalla public direct avec elevation_interval: 30, auto-détection polyline6/polyline5, fillEleGaps() dans utils.js, enrichissement Open-Elevation dans gps.js). J'ai donc gardé tout ça intact et complété ce qui manquait pour du 100 % gratuit.
Ce qui a changé (fichiers modifiés : map.js, state.js, offline.js, index.html, sw.js, plus quelques retouches null-safe)
Thunderforest et sa clé API disparaissent de map.js, remplacés par OpenTopoMap par défaut (courbes de niveau, idéal rando) et Plan IGN via la Géoplateforme, gratuit sans clé — un vrai plus autour d'Avignon. Le switchLayer est maintenant générique via un objet BASE_LAYERS, plus de if/else par couche. La surcouche « Sentiers sur satellite » devient « Relief sur satellite » (OpenTopoMap à 70 %).
Côté hors-ligne, deux vraies améliorations : le Service Worker pré-cache désormais les 17 modules JS dès l'installation — avant, ils n'étaient mis en cache qu'au fil de la navigation, donc une première installation suivie d'un passage en mode avion cassait l'appli ; et le téléchargement de zone récupère les tuiles du fond actif (nouvelle fonction currentTileTemplate() dans map.js, transmise par offline.js au SW) au lieu de toujours OSM. J'ai aussi appliqué les correctifs SW connus : skipWaiting() déplacé dans waitUntil(), et installation tolérante aux échecs individuels au lieu du cache.addAll qui échoue en bloc si un seul fichier manque.
Enfin, les p.ele || 0 restants dans recording.js, app.js, gpx.js et map.js deviennent ?? null pour que les altitudes invalides traversent la chaîne jusqu'à fillEleGaps() sans créer de D+/D− fictifs — la logique null-aware existait dans utils.js mais ces appels la court-circuitaient. jQuery (chargé mais jamais utilisé) est supprimé de index.html et du SW.
Tous les modules passent la vérification syntaxique, le manifest est valide, et le cache passe à mapybibi-app-v9-0 donc la mise à jour sera proposée automatiquement. Déploiement habituel : glisse le contenu du ZIP sur GitHub — le .nojekyll est inclus (indispensable ici puisque le dossier js/ existe), vérifie qu'il apparaît bien dans le commit.
*********************
v9.1
MapiBiBi v9.1 avec le trio promis. Deux nouveaux modules dans js/ (guidage.js et bibliotheque.js), plus des retouches dans utils.js, elevation.js, gps.js, app.js, index.html et sw.js.
⏱ Temps de marche estimé — Formule randonneur classique : 1 h par 4 km + 1 h par 300 m de D+ + 1 h par 500 m de D−. Il s'affiche dans le bandeau du bas à côté de Dist/D+/D−, dans l'onglet Stats (nouvelle case « temps estimé »), et sous le profil altimétrique. Recalculé automatiquement à chaque modification du tracé. Testé : 12 km / 600 m D+ / 600 m D− → 6h12.
🧭 Alerte d'écart de trace — À chaque position GPS (si la précision est correcte), guidage.js calcule la distance au segment le plus proche de la trace chargée par projection équirectangulaire. Au-delà de 50 m : vibration triple + toast « ⚠ Écart de trace : XX m ». L'hystérésis évite le spam : pas de nouvelle alerte avant 30 s, et il faut repasser sous 35 m pour le « ✅ De retour sur la trace » (vibration courte). Le calcul est throttlé à une vérification toutes les 3 s avec pré-filtre par latitude, donc négligeable pour la batterie. Désactivable dans Options → Guidage (préférence mémorisée). Testé : 0 m sur la trace, 40 m et 100 m d'écart détectés au mètre près. Note : la vibration fonctionne sur Android ; iOS ne supporte pas navigator.vibrate, le toast reste visible dans tous les cas.
📚 Bibliothèque de traces — Fini l'écrasement : bouton « 📚 Mes traces » dans le panneau d'actions (aussi dans Options). En haut du panneau, « 💾 Sauvegarder la trace actuelle » demande un nom (proposé par défaut : « Rando du 12/06 14h30 ») et stocke en IndexedDB la trace complète avec ses waypoints — modifiable après rechargement, donc. La liste affiche date, km, D+/D−, temps estimé ; un tap charge la trace (avec confirmation si une autre est en cours, et blocage pendant un enregistrement), 🗑️ supprime. IndexedDB tient sans problème des centaines de traces, contrairement au localStorage.
******************
routing.js — trois changements dans les options Valhalla : max_hiking_difficulty: 6 (le correctif principal : les sentiers cotés « randonnée montagne » et au-delà redeviennent visibles pour le routeur), walkway_factor: 0.5 (les sentiers coûtent moitié prix, donc le routeur les choisit même quand la route est un peu plus courte), use_tracks: 1.0 (préférence maximale pour les pistes). Et suppression du use_trails qui était ignoré.
sw.js — uniquement le numéro de cache v9-1 → v9-2, pour forcer la mise à jour chez les utilisateurs au prochain chargement.

*** Une limite à connaître, indépendante du code : Valhalla utilise les données OpenStreetMap. Si vous tracez sur le fond Plan IGN, certains sentiers visibles sur l'IGN n'existent pas dans OSM — le routeur ne pourra jamais les suivre, quels que soient les réglages. Sur les fonds OpenTopoMap et OSM en revanche, ce que vous voyez est exactement ce que le routeur connaît. Si après le correctif un sentier précis résiste, basculez sur le fond OpenTopoMap pour vérifier qu'il y figure : s'il n'y est pas, c'est un trou dans OSM, pas un bug de l'appli.***
********************
v 9.1.1 du 17 JUIN 2026
Correction du problème suivant : l'appli sauvegarde seulement toutes les 15 secondes, ne sauvegarde rien quand on quitte le premier plan, et le watchPosition n'est pas relancé au retour. Sur iOS, le navigateur gèle la page en ~30 s, le timer ne tire plus et les données sont perdues.Préparé explication des modifications apportéesPréparé explication des modifications apportéesLe problème venait de trois faiblesses cumulées. La v9.1.1 les corrige toutes dans gps.js et recording.js (réécrits), plus des nettoyages dans ui.js et index.html.
Ce qui causait la perte de trace
L'ancien code sauvegardait la trace sur un setInterval(15000). Or quand tu changes d'appli, iOS gèle la page en ~30 secondes : le timer ne tire plus, rien n'est sauvegardé. Si iOS tue ensuite la page pour libérer la mémoire, les 15 dernières secondes (voire plus) de trace disparaissent. Sur Android c'est moins brutal mais les timers sont aussi throttlés en arrière-plan à ~1 appel par minute. Par ailleurs, aucune sauvegarde ne se déclenchait au moment précis du passage en arrière-plan — le moment le plus critique.
Les trois correctifs
Premièrement, la trace est sauvegardée dans localStorage à chaque nouveau point GPS, plus sur un timer. Le callback setOnNewPoint est câblé par recording.js dans gps.js : dès qu'un point passe les filtres (précision, distance min, vitesse max), il est ajouté à recTrace puis immédiatement persisté. Un flag _lastSavedLength évite les réécritures inutiles. Le timer de 5 s reste comme filet de sécurité pour les mises à jour d'altitude (Open-Elevation enrichit les points en différé).
Deuxièmement, des écouteurs visibilitychange → hidden, pagehide et freeze déclenchent une sauvegarde synchrone instantanée avant que l'OS ne gèle la page. C'est la dernière chance de persister les données — pagehide est plus fiable que beforeunload sur mobile, et freeze couvre le Page Lifecycle API de Chrome Android.
Troisièmement, quand l'appli revient au premier plan (visibilitychange → visible + resume), trois actions : ré-acquisition du wake lock (toujours relâché par l'OS en arrière-plan), getCurrentPosition forcé avec maximumAge: 0 pour réveiller la puce GPS immédiatement (le watchPosition reprend mais peut mettre plusieurs secondes), et relance du watchPosition au cas où le navigateur l'a tué (fréquent sur iOS). Un toast informe du temps passé en arrière-plan (« 📍 Enregistrement repris — 3 min en arrière-plan ») pour que tu saches qu'il y a eu un trou.
En bonus — j'ai aussi nettoyé les dernières références « ORS » qui traînaient dans l'UI : le label de surcouche, le texte du popup d'enregistrement, les compteurs de stats, et l'indicateur de chargement. Tout dit maintenant « Valhalla » / « gratuit » / « sans clé ».
Ce qui reste inévitable : sur iOS, si l'appli est gelée pendant 10 minutes, il y aura un trou dans la trace — aucune PWA ne peut faire tourner du GPS en arrière-plan sur iOS. Mais les données avant le trou sont maintenant garanties, et la restauration après kill fonctionne. Sur Android, watchPosition reste souvent actif en arrière-plan avec une fréquence réduite, donc le trou sera bien plus petit, voire inexistant.
*************************
# MapiBiBi v9.1.1 — 100 % outils gratuits

Traceur de randonnée pédestre (PWA) — sans aucune clé API.

- **Routage** : Valhalla OSM public (`valhalla1.openstreetmap.de`) — piéton, polyline6 auto-détecté, altitudes intégrées
- **Altitude terrain** : Open-Elevation (SRTM 30 m) en enrichissement GPS
- **Fonds de carte** : OpenTopoMap (défaut), Plan IGN (Géoplateforme), OpenStreetMap, Satellite Esri + Waymarked Trails
- **Hors-ligne** : Service Worker v9 — modules JS cachés à l'installation, pré-cache du fond actif

## v9.1.1 — Enregistrement indestructible
- Sauvegarde localStorage **à chaque point GPS** (plus toutes les 15 s)
- Sauvegarde immédiate sur `visibilitychange`, `pagehide`, `freeze` — avant que l'OS ne gèle la page
- Reprise automatique au retour premier plan : ré-acquisition wake lock, relance watchPosition + getCurrentPosition, toast de reprise
- Enregistrement compatible changement d'appli, verrou d'écran, kill iOS

## v9.1
- **⏱ Temps de marche estimé** (4 km/h + D+/300 + D−/500)
- **🧭 Alerte d'écart de trace** : vibration au-delà de 50 m (hystérésis, désactivable)
- **📚 Bibliothèque de traces** : sauvegarde nommée IndexedDB, chargement, suppression

  
** v9.2
  Voici l'audit complet et les correctifs. 19 modules, 100 exports vérifiés, toutes les fonctions onclick du HTML validées contre les expositions window.
Bugs trouvés et corrigés
1. Bug critique — controllerchange rechargeait la page pendant l'enregistrement (app.js)

C'est la cause la plus probable de ta perte de trace. Quand le Service Worker se met à jour (ce qui arrive à chaque visite après un déploiement), il déclenche controllerchange → window.location.reload(). Toute la mémoire JS disparaît : state.gpsTracking redevient false, la polyline s'évapore. Maintenant, si un enregistrement est en cours, le reload est bloqué et un toast informe que la mise à jour sera appliquée après l'arrêt.
2. Pas de reprise automatique après kill (recording.js)

Quand iOS tue la page et que l'utilisateur revient, verifierTraceInterrompue se contentait d'afficher un popup de restauration. Si l'utilisateur ne comprenait pas le popup, la trace semblait « disparue ». Maintenant la reprise est automatique : si le flag REC_ENCOURS_KEY est trouvé au démarrage avec une trace sauvegardée, l'enregistrement redémarre immédiatement — wake lock, GPS, polyline restaurée, stats recalculées, toast « 📍 Enregistrement repris — N pts, ~X min ».
3. Sauvegarde de sécurité trop timide (recording.js)

La sauvegarde de sécurité (timer 5 s) ignorait les points dont seule l'altitude avait changé (enrichissement Open-Elevation). Le timer force maintenant la sauvegarde systématiquement (force = true), pas seulement quand la longueur du tableau change.
4. gpsEle tombait à 0 au lieu de null (gps.js)

Quand l'altitude GPS était indisponible ou imprécise, le point stockait ele: 0 au lieu de null. Ça propageait une fausse altitude zéro dans fillEleGaps, smooth et gainElev, créant des D+/D− fictifs.
5. const { markers } = import('./state.js') cassé (app.js)

Un import() dynamique utilisé sans await — renvoyait une Promise, pas le module. Variable markers inutilisée donc sans effet visible, mais du code mort incorrect. Supprimé.
6. map.invalidateSize() manquant au retour de l'arrière-plan (recording.js)

Leaflet peut avoir un rendu corrompu après un passage en arrière-plan sur mobile. L'appel à invalidateSize() dans le callback de reprise force le rafraîchissement du canvas.
Vérification d'interop automatisée — script Python qui croise les 100 exports des 19 modules contre tous les imports : aucune incohérence. Les 30 fonctions onclick du HTML sont toutes présentes dans Object.assign(window, {...}).
