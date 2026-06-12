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
