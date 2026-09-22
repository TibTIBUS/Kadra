# KADRA

Studio de montage photo pour Instagram et Facebook — collages et **carrousels seamless**
(une grande composition découpée en slides qui s'enchaînent au swipe), puis export des
images pour publication manuelle.

Application **local-first** : aucun backend, aucun compte, aucune donnée ne quitte le poste.
Tout vit dans IndexedDB (projets + photos), le rendu et l'export sont 100 % côté client.

## Démarrer

```bash
npm install
npm run dev        # serveur de développement Vite
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # prévisualiser le build
npm run templates  # régénérer les 20 templates JSON
```

Navigateur cible : **Chrome sur ordinateur**. Safari efface les données d'un site non visité
pendant 7 jours — l'application l'indique et invite à exporter une sauvegarde. C'est une limite
du navigateur, pas de l'app : elle s'applique aussi à Safari sur iPhone et iPad.

### Smartphones et tablettes

En dessous de 900 px de large, l'éditeur passe en disposition tactile : une seule colonne
(barre d'outils défilante, plan de travail, barre d'actions en bas), les deux panneaux
devenant des feuilles escamotables. Au-delà, la disposition à trois colonnes est conservée.

Le glisser-déposer HTML5 n'existe pas sur iOS : on touche une photo pour l'armer, puis la
cellule qui doit la recevoir. Le recadrage se fait au doigt, avec pincement à deux doigts
pour le zoom. Les zones sûres de l'encoche et de la barre de gestes sont respectées
(`viewport-fit=cover` + `env(safe-area-inset-*)`), et les hauteurs utilisent `dvh` pour ne
pas être faussées par la barre d'URL de Safari.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` construit et publie `dist/` à chaque push.
Le site est servi depuis un sous-chemin (`https://<compte>.github.io/Kadra/`) : le workflow
passe `BASE_PATH` à Vite, et l'application utilise un routeur à hash, donc aucune règle de
réécriture n'est nécessaire.

Prérequis côté dépôt, à faire une fois à la main : **Settings → Pages → Source : GitHub
Actions**. Le workflow demande l'activation automatique (`enablement: true`), mais le
`GITHUB_TOKEN` d'Actions n'a pas le droit de créer le site Pages d'un dépôt : GitHub répond
« Resource not accessible by integration ». Une fois l'interrupteur activé, chaque push
publie le site sur `https://tibtibus.github.io/Kadra/`.

## Déploiement Netlify

`netlify.toml` est prêt : commande `npm run build`, dossier publié `dist`, redirection SPA.
La protection de l'URL se fait via le mot de passe de site Netlify (selon le plan).

## Fonctionnalités

- **Projets** : liste avec miniatures, création, renommage, duplication, suppression
  (les photos d'un projet sont supprimées dans la même transaction), autosave toutes les 5 s.
- **Formats** : collage portrait (1080 × 1350), collage carré (1080 × 1080), carrousel
  seamless portrait ou carré de 2 à 10 slides. Un carrousel de N slides est une scène de
  N × 1080 px de large, découpée en N images à l'export.
- **Photos** : glisser-déposer multi-fichiers, JPEG / PNG / WEBP / **HEIC** (converti en JPEG
  côté client), redimensionnement à 3000 px max, aperçu 1200 px pour l'éditeur.
- **Éditeur Konva** : les cadres photo des templates sont **verrouillés** — un doigt déplace la
  photo dans son cadre, deux doigts la zooment, le cadre ne bouge jamais. Découpes sur mesure,
  cadres, textes et formes libres, palette imposée, ajout/retrait de slides, undo/redo 50
  niveaux (Ctrl+Z / Ctrl+Maj+Z).
- **Repères d'édition** : lignes de découpe entre slides, zone de sécurité de 60 px, bande du
  recadrage 3:4 de la grille du profil, alerte si un texte chevauche une découpe. Ces repères
  sont dessinés dans une couche dédiée et **n'existent pas au rendu d'export**.
- **Aperçus** : maquette Instagram avec swipe réel et pagination, grille du profil, Facebook.
- **Variante Facebook** : une Page affiche un post multi-photos en mosaïque, l'effet seamless
  est perdu — l'app produit donc un visuel unique, au choix *panorama* ou *collage résumé*.
- **Export** : les images sont rendues en pleine résolution, puis proposées selon l'appareil.
  Sur ordinateur, un ZIP contenant `instagram/01.jpg…` dans l'ordre de publication et
  `facebook/facebook.jpg`. Sur iPhone et iPad, la feuille de partage du système, dont
  « Enregistrer les images » dépose les JPEG **dans la pellicule** plutôt que dans Fichiers —
  le ZIP reste proposé en repli. Export d'une slide seule dans les deux cas. JPEG qualité 0,92
  aux dimensions exactes.
- **Sauvegardes** : export/import d'un projet en `.kadra` (ZIP : `scene.json` + photos),
  sauvegarde complète de tous les projets, rappel si aucune sauvegarde depuis 7 jours.
- **Stockage** : `navigator.storage.persist()` demandé au premier lancement, état et espace
  utilisé affichés dans les réglages.

## Architecture

```
src/
  data/          couche d'accès aux données (repository pattern, Dexie/IndexedDB)
  lib/           logique métier : images, scène, rendu Konva, export, aperçus, sauvegardes
  store/         état de l'éditeur (zustand) : scène, sélection, historique, autosave
  templates/     20 templates en JSON + chargement et adaptation au format
  components/    composants d'interface (aucune logique métier)
  pages/         accueil et éditeur
  theme.ts       palette et typographie — remplacé par les kits de marque en V2
```

Tout accès aux données passe par `src/data/` : brancher un backend en V2 (Netlify Blobs +
Netlify DB) se fait sans toucher à l'interface.

Le rendu d'export est **indépendant de l'éditeur** : `lib/render.ts` construit une scène Konva
hors écran à la résolution exacte, `lib/export.ts` la découpe par slide. Les repères d'édition
ne peuvent donc jamais se retrouver dans une image exportée.

### Composition : masques, pivots, voiles

Une cellule photo n'est pas forcément un rectangle. `CellMask` accepte un rectangle
(éventuellement arrondi), un ovale, ou un **polygone** dont les points sont normalisés de 0 à 1
dans la boîte de la cellule. C'est ce qui permet une découpe oblique correcte : deux cellules
qui déclarent la même arête se raccordent au pixel près, aucune photo ne peut déborder sur
l'autre. Le tracé vit dans `lib/mask.ts` et sert **à la fois** à l'éditeur et au rendu
d'export, ce qui garantit que l'aperçu et le JPEG sont identiques.

Tout ce qui a une boîte — cellule photo comme rectangle décoratif — pivote autour de son
centre. Deux éléments superposés restent donc alignés quand on les incline. Pour faire pivoter
plusieurs éléments comme un seul bloc, `rotateGroup` (dans le script de génération) applique un
pivot commun.

Les textes posés sur une photo reçoivent un **voile dégradé** : c'est ce qui sépare un visuel
lisible d'un titre noyé dans l'image. Les grands titres portent un interlettrage négatif, les
petites capitales un interlettrage ouvert.

### Cadres verrouillés et gestes

Un cadre photo de template ne se déplace pas et ne se redimensionne pas : ni poignée de
transformation, ni glissement. La mise en page reste celle du template, quel que soit le geste.
Seule la photo bouge à l'intérieur — glissement à un doigt ou à la souris, pincement à deux
doigts ou molette pour le zoom. Textes et formes, eux, restent librement déplaçables.

Le zoom est **ancré** sur le point visé (curseur, ou milieu des deux doigts) : sans cela
l'image fuit sous le doigt pendant le pincement. Le décalage est borné à chaque instant, la
photo ne peut donc jamais laisser apparaître un vide dans son cadre.

Le pincement est branché sur des écouteurs DOM plutôt que sur le système d'événements de
Konva : dès qu'un glissement est en cours, Konva cesse d'émettre ses propres événements
tactiles et le geste ne recevrait qu'un seul événement, puis plus rien. Quand le second doigt
se pose, le glissement amorcé par le premier est interrompu, sinon l'image saute.

### Enregistrer dans la pellicule

Aucune API web ne permet d'écrire directement dans la photothèque d'un iPhone. Le seul chemin
est `navigator.share()` avec des fichiers : la feuille de partage du système s'ouvre et son
entrée « Enregistrer les images » les dépose dans Photos. Un ZIP ne peut pas y entrer, d'où la
séparation entre `renderExportImages` (les JPEG) et `zipExportedImages` (la mise en archive).

Contrainte à respecter : iOS refuse un partage qui ne part pas directement d'un geste de
l'utilisateur. Les images sont donc rendues **à l'ouverture** de la fenêtre d'export, et le
bouton appelle `navigator.share()` sans aucune attente intermédiaire. Le repli est automatique :
`canShareFiles` est faux sur tous les navigateurs de bureau, qui reçoivent alors le ZIP.

### Typographie

Poppins (graisses 400, 600, 800) est **embarquée** dans `public/fonts`, pas chargée depuis
Google Fonts : le rendu des JPEG exportés ne dépend plus d'une requête réseau qui pourrait
échouer ou arriver après le rendu, et aucune donnée de visite ne part chez un tiers. Police
sous SIL Open Font License 1.1.

### Templates : des motifs, pas des scènes figées

Un template ne décrit pas une composition figée mais un **motif**, réassemblé pour le nombre de
slides demandé. Sans cela, un carrousel conçu pour 3 slides et créé en 10 gardait sa photo
panoramique large de 3 slides et recevait 7 cellules génériques : une seule photo plaçable, et
une composition incohérente.

Quatre emplacements, tous optionnels :

| Clé | Rôle | Coordonnées |
|---|---|---|
| `full` | éléments traversant tout le carrousel (photo panoramique, fil conducteur) | `x` et `w` en **fraction** de la largeur totale |
| `lead` | première slide : couverture, titre | locales à une slide |
| `body` | motif répété sur les slides courantes | locales à une slide |
| `bodyAlt` | variante appliquée une slide sur deux, pour créer un rythme | locales à une slide |
| `tail` | dernière slide : récapitulatif, appel à l'action | locales à une slide |

Dans un texte, `{n}` devient le numéro de slide et `{nn}` le même sur deux chiffres : un motif
répété peut donc se numéroter tout seul.

L'éditeur suit la même logique : ajouter ou retirer une slide **étire ou rétracte** les
éléments qui traversaient déjà toute la scène, au lieu d'empiler des cellules génériques à
côté d'une photo panoramique restée courte.

Déposer un fichier JSON dans `src/templates/` suffit à ajouter un template (repris par
`import.meta.glob`). Les coordonnées sont définies en 1080 × 1350 par slide et mises à
l'échelle pour les formats carrés. `scripts/generate-templates.mjs` régénère les 20 livrés.

## Hors périmètre V1

Publication automatique via l'API Meta, programmation, kits de marque multi-clients, IA,
grilles de feed, retouche photo, vidéo.
