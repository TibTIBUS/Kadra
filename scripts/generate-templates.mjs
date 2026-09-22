import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';

const OUT = new URL('../src/templates', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

/* =============================== Design system ==============================
 * Une seule grille, une seule échelle typographique, un seul accent.
 * Les marges suivent la zone de sécurité Instagram (60 px minimum) portée à 72
 * pour respirer. Les titres portent un interlettrage négatif : c'est ce qui
 * distingue une composition dessinée d'un texte posé par défaut.
 * ========================================================================== */

const P = { vert: '#0f3d2e', menthe: '#7ed6ad', orange: '#ef8a3f', blanc: '#ffffff', noir: '#111111' };

const W = 1080;           // largeur d'une slide
const H = 1350;           // hauteur de référence
const M = 72;             // marge
const G = 18;             // gouttière entre photos
const CW = W - M * 2;     // largeur utile

// Échelle modulaire de raison 1,26
const T = { xs: 30, sm: 38, md: 48, lg: 60, xl: 76, xxl: 96, display: 122, hero: 154 };

/** Interlettrage : serré sur les grands titres, ouvert sur les petites capitales. */
const track = (size, caps = false) => {
  if (caps && size <= T.sm) return size * 0.12;
  if (size >= T.xxl) return -size * 0.035;
  if (size >= T.lg) return -size * 0.022;
  return 0;
};

let n = 0;
const id = (prefix) => `${prefix}${++n}`;

const cell = (x, y, w, h, extra = {}) => ({
  id: id('c'),
  type: 'photoCell',
  x, y, w, h,
  radius: extra.radius ?? 0,
  crop: { offsetX: 0, offsetY: 0, scale: 1 },
  ...extra,
});

/** Cellule découpée par un polygone (points normalisés dans la boîte). */
const polyCell = (x, y, w, h, points, extra = {}) =>
  cell(x, y, w, h, { mask: { type: 'polygon', points }, ...extra });

const ellipseCell = (x, y, w, h, extra = {}) =>
  cell(x, y, w, h, { mask: { type: 'ellipse' }, ...extra });

const text = (x, y, w, value, o = {}) => {
  const size = o.size ?? T.md;
  return {
    id: id('t'),
    type: 'text',
    x, y, w,
    text: value,
    font: 'Poppins',
    weight: o.weight ?? 800,
    size,
    color: o.color ?? P.blanc,
    align: o.align ?? 'left',
    lineHeight: o.lineHeight ?? (size >= T.xl ? 1.02 : 1.28),
    letterSpacing: o.letterSpacing ?? track(size, o.caps),
    ...(o.rotation ? { rotation: o.rotation } : {}),
    ...(o.shadow ? { shadow: o.shadow } : {}),
  };
};

const rect = (x, y, w, h, fill, o = {}) => ({
  id: id('s'), type: 'shape', shape: 'rect', x, y, w, h, fill, radius: o.radius ?? 0, ...o,
});
const circle = (x, y, r, fill, o = {}) => ({ id: id('s'), type: 'shape', shape: 'circle', x, y, r, fill, ...o });
const line = (x, y, points, stroke, strokeWidth = 6) => ({
  id: id('s'), type: 'shape', shape: 'line', x, y, points, stroke, strokeWidth,
});

/** Voile dégradé : garantit la lisibilité d'un texte posé sur une photo. */
const scrim = (x, y, w, h, color = '#0b1a15', angle = 90, strength = 0.92) =>
  rect(x, y, w, h, undefined, {
    gradient: { from: 'rgba(0,0,0,0)', to: hexToRgba(color, strength), angle },
  });

const hexToRgba = (hex, alpha) => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/** Étiquette en capitales : petite, espacée, sur pastille pleine. */
const pill = (x, y, label, fill, color) => {
  const paddingX = 30;
  const size = T.xs;
  const width = label.length * size * 0.72 + paddingX * 2;
  const height = size * 2.1;
  return [
    rect(x, y, width, height, fill, { radius: height / 2 }),
    text(x, y + height / 2 - size * 0.72, width, label, {
      size, weight: 600, color, align: 'center', caps: true,
    }),
  ];
};

/**
 * Deux découpes obliques qui partagent exactement la même arête, séparées par
 * une bande de fond régulière. C'est la géométrie qui fait la netteté : aucune
 * photo ne peut déborder sur l'autre puisque les arêtes sont identiques.
 */
const diagonalPair = (tilt, at = 0.5, gapPx = 10) => {
  const gap = gapPx / H / 2;
  const left = at - tilt / 2;
  const right = at + tilt / 2;
  return {
    haut: [0, 0, 1, 0, 1, right - gap, 0, left - gap],
    bas: [0, left + gap, 1, right + gap, 1, 1, 0, 1],
  };
};

/**
 * Fait pivoter plusieurs éléments autour d'un pivot commun. Sans cela, chaque
 * élément tournerait autour de son propre centre et le groupe se disloquerait.
 * Cellules photo et rectangles pivotent sur leur centre, textes et traits sur
 * leur point d'ancrage : le pivot est donc appliqué à la bonne référence.
 */
const rotateGroup = (elements, pivotX, pivotY, angle) => {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const turn = (x, y) => {
    const dx = x - pivotX;
    const dy = y - pivotY;
    return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
  };

  return elements.map((element) => {
    const centred = element.type === 'photoCell' || (element.type === 'shape' && element.shape === 'rect');
    if (centred) {
      const w = element.w ?? 0;
      const h = element.h ?? 0;
      const [cx, cy] = turn(element.x + w / 2, element.y + h / 2);
      return { ...element, x: cx - w / 2, y: cy - h / 2, rotation: angle };
    }
    const [x, y] = turn(element.x, element.y);
    return { ...element, x, y, rotation: angle };
  });
};

const solid = (color) => ({ type: 'solid', color });
const gradient = (from, to, angle = 90) => ({ type: 'gradient', from, to, angle });

const templates = [];
const add = (slug, name, category, description, slideCount, background, elements) => {
  n = 0;
  templates.push({
    id: slug, name, category, description, slideCount,
    formats: category === 'collage' ? ['collage_portrait', 'collage_square'] : ['carousel_portrait', 'carousel_square'],
    scene: { width: W * slideCount, height: H, slideWidth: W, background, elements: elements.flat(Infinity) },
  });
};

/* ================================= COLLAGES ================================= */

// 1. La découpe oblique, faite correctement.
{
  const split = diagonalPair(0.14, 0.52, 12);
  add('collage-split-diagonal', 'Split diagonal', 'collage',
    'Deux photos séparées par une vraie découpe oblique, sans recouvrement.', 1,
    solid(P.vert), [
      polyCell(0, 0, W, H, split.haut),
      polyCell(0, 0, W, H, split.bas),
      ...pill(M, H - M - T.xs * 2.1, 'AVANT / APRÈS', P.orange, P.blanc),
    ]);
}

// 2. Plein cadre, voile de lisibilité, titre serré.
{
  const titleSize = T.display;
  const titleTop = H - M - 150 - titleSize * 1.02 * 2;
  add('collage-plein-cadre', 'Photo plein cadre', 'collage',
    'Une photo pleine page, voile dégradé et titre en bas.', 1,
    solid(P.noir), [
      cell(0, 0, W, H),
      scrim(0, H * 0.42, W, H * 0.58),
      text(M, titleTop, CW, 'UN TITRE\nQUI PORTE', { size: titleSize, color: P.blanc }),
      line(M, H - M - 92, [0, 0, 120, 0], P.orange, 8),
      text(M, H - M - 58, CW, 'Localia · Normandie', {
        size: T.sm, weight: 600, color: P.menthe, caps: true,
      }),
    ]);
}

// 3. Bandeau éditorial : la photo chevauche le bloc de couleur.
add('collage-editorial', 'Bandeau éditorial', 'collage',
  'Un bloc de couleur et une photo qui le chevauche, pour la profondeur.', 1,
  solid(P.vert), [
    rect(0, 0, W, 620, P.menthe),
    text(M, 120, CW - 120, 'NOS\nRÉALISATIONS', { size: T.xxl, color: P.vert }),
    cell(M, 470, CW, 700, {
      radius: 8,
      shadow: { color: '#000000', blur: 60, offsetX: 0, offsetY: 24, opacity: 0.45 },
    }),
    text(M, H - 108, CW, 'localia.fr', { size: T.sm, weight: 600, color: P.menthe, caps: true }),
  ]);

// 4. Grille 2 photos, gouttière fine, légende sobre.
add('collage-duo', 'Duo vertical', 'collage',
  'Deux photos superposées, gouttière fine et légende.', 1,
  solid(P.vert), [
    cell(M, M, CW, 560, { radius: 6 }),
    cell(M, M + 560 + G, CW, 560, { radius: 6 }),
    text(M, M + 560 * 2 + G + 40, CW, 'Deux moments, une histoire', {
      size: T.lg, color: P.menthe,
    }),
  ]);

// 5. Héro + deux vignettes.
add('collage-hero', 'Héro + vignettes', 'collage',
  'Une grande photo et deux vignettes, hiérarchie nette.', 1,
  solid(P.noir), [
    cell(M, M, CW, 780, { radius: 6 }),
    cell(M, M + 780 + G, (CW - G) / 2, 340, { radius: 6 }),
    cell(M + (CW - G) / 2 + G, M + 780 + G, (CW - G) / 2, 340, { radius: 6 }),
    text(M, M + 780 + G + 340 + 34, CW, 'Reportage', {
      size: T.sm, weight: 600, color: P.orange, caps: true,
    }),
  ]);

// 6. Grille 4, gouttière serrée.
{
  const size = (CW - G) / 2;
  add('collage-grille-4', 'Grille 4 photos', 'collage',
    'Quatre photos, gouttière serrée, cadrage carré.', 1,
    solid(P.noir), [
      cell(M, (H - (size * 2 + G)) / 2, size, size, { radius: 4 }),
      cell(M + size + G, (H - (size * 2 + G)) / 2, size, size, { radius: 4 }),
      cell(M, (H - (size * 2 + G)) / 2 + size + G, size, size, { radius: 4 }),
      cell(M + size + G, (H - (size * 2 + G)) / 2 + size + G, size, size, { radius: 4 }),
    ]);
}

// 7. Mosaïque asymétrique.
add('collage-mosaique', 'Mosaïque asymétrique', 'collage',
  'Trois formats différents, équilibre asymétrique.', 1,
  solid(P.vert), [
    cell(M, M, 560, 560, { radius: 6 }),
    cell(M + 560 + G, M, CW - 560 - G, 560, { radius: 6 }),
    cell(M, M + 560 + G, CW, H - M * 2 - 560 - G, { radius: 6 }),
    ...pill(M + 28, M + 28, 'LOCALIA', P.orange, P.blanc),
  ]);

// 8. Polaroid légèrement incliné, avec vrai cadre.
add('collage-polaroid', 'Polaroid', 'collage',
  'Photo encadrée de blanc, légèrement inclinée, ombre portée.', 1,
  gradient(P.vert, '#08201a', 90), [
    rotateGroup([
      rect(140, 230, 800, 960, P.blanc, {
        shadow: { color: '#000000', blur: 70, offsetX: 0, offsetY: 30, opacity: 0.5 },
      }),
      cell(188, 278, 704, 760),
      text(188, 1070, 704, 'Été 2026', {
        size: T.lg, weight: 600, color: P.noir, align: 'center',
      }),
    ], W / 2, H / 2, -3.5),
  ]);

// 9. Avant / après vertical, séparation franche.
add('collage-avant-apres', 'Avant / après', 'collage',
  'Deux photos côte à côte, séparation franche et étiquettes.', 1,
  solid(P.noir), [
    cell(0, 0, W / 2 - 5, H),
    cell(W / 2 + 5, 0, W / 2 - 5, H),
    scrim(0, H - 420, W, 420),
    ...pill(M, H - M - T.xs * 2.1, 'AVANT', P.orange, P.blanc),
    ...pill(W / 2 + 36, H - M - T.xs * 2.1, 'APRÈS', P.menthe, P.vert),
  ]);

// 10. Portrait en médaillon.
add('collage-medaillon', 'Médaillon', 'collage',
  'Un portrait en cercle sur aplat, pour une présentation.', 1,
  solid(P.vert), [
    circle(W / 2, 470, 330, P.menthe, { opacity: 0.18 }),
    ellipseCell(W / 2 - 300, 170, 600, 600, {
      stroke: P.menthe,
      strokeWidth: 8,
    }),
    text(M, 860, CW, 'THIBAUT', { size: T.xxl, color: P.blanc, align: 'center' }),
    text(M, 990, CW, 'Fondateur · Localia', {
      size: T.sm, weight: 600, color: P.menthe, align: 'center', caps: true,
    }),
    line(W / 2 - 60, 1090, [0, 0, 120, 0], P.orange, 8),
  ]);

/* ================================ CARROUSELS ================================ */

// 11. Panorama plein cadre sur 3 slides.
add('carrousel-panorama', 'Panorama 3 slides', 'carousel',
  'Une photo panoramique plein cadre, titre sur la première slide.', 3,
  solid(P.noir), [
    cell(0, 0, W * 3, H),
    scrim(0, H * 0.5, W, H * 0.5),
    text(M, H - M - 190, CW, 'FAITES\nGLISSER', { size: T.xl, color: P.blanc }),
    line(M, H - M - 60, [0, 0, 90, 0], P.orange, 8),
  ]);

// 12. Découpe oblique continue sur 3 slides.
{
  const split = diagonalPair(0.10, 0.55, 14);
  add('carrousel-diagonale', 'Diagonale continue', 'carousel',
    'Une découpe oblique qui traverse les trois slides sans rupture.', 3,
    solid(P.vert), [
      polyCell(0, 0, W * 3, H, split.haut),
      polyCell(0, 0, W * 3, H, split.bas),
      ...pill(M, M, 'LOCALIA', P.orange, P.blanc),
    ]);
}

// 13. Photo géante sur deux slides, puis bloc de texte.
add('carrousel-photo-geante', 'Photo géante + texte', 'carousel',
  'Une photo à cheval sur deux slides, la troisième porte le message.', 3,
  solid(P.vert), [
    cell(0, 0, W * 2 - 6, H),
    rect(W * 2 + 6, 0, W - 6, H, P.menthe),
    text(W * 2 + M, 300, CW, 'LE MOT\nDE LA FIN', { size: T.xxl, color: P.vert }),
    text(W * 2 + M, 620, CW - 60, 'Une phrase courte qui conclut le carrousel et invite à réagir.', {
      size: T.md, weight: 400, color: P.vert, lineHeight: 1.45,
    }),
    ...pill(W * 2 + M, 900, 'ON EN PARLE ?', P.vert, P.menthe),
  ]);

// 14. Fil conducteur qui traverse les slides.
add('carrousel-fil', 'Fil conducteur', 'carousel',
  'Une ligne traverse les trois slides et relie les photos en quinconce.', 3,
  solid(P.vert), [
    line(0, H / 2, [0, 0, W * 3, 0], P.menthe, 5),
    cell(M, M, CW, H / 2 - M - 40, { radius: 6 }),
    cell(W + M, H / 2 + 40, CW, H / 2 - M - 40, { radius: 6 }),
    cell(W * 2 + M, M, CW, H / 2 - M - 40, { radius: 6 }),
    circle(W / 2, H / 2, 16, P.orange),
    circle(W * 1.5, H / 2, 16, P.orange),
    circle(W * 2.5, H / 2, 16, P.orange),
  ]);

// 15. Couverture éditoriale puis galerie.
add('carrousel-couverture', 'Couverture + galerie', 'carousel',
  'Une slide de couverture typographique, puis trois photos plein cadre.', 4,
  solid(P.vert), [
    text(M, 380, CW, 'NOTRE\nSÉLECTION', { size: T.hero, color: P.menthe }),
    line(M, 760, [0, 0, 140, 0], P.orange, 10),
    text(M, 820, CW, 'Swipez pour découvrir', { size: T.sm, weight: 600, color: P.blanc, caps: true }),
    cell(W, 0, W, H),
    cell(W * 2, 0, W, H),
    cell(W * 3, 0, W, H),
  ]);

// 16. Avant / après sur deux slides, la découpe sert de séparation.
add('carrousel-avant-apres', 'Avant / après', 'carousel',
  'Une slide avant, une slide après : la découpe fait la transition.', 2,
  solid(P.noir), [
    cell(0, 0, W, H),
    cell(W, 0, W, H),
    scrim(0, H - 380, W, 380),
    scrim(W, H - 380, W, 380),
    ...pill(M, H - M - T.xs * 2.1, 'AVANT', P.orange, P.blanc),
    ...pill(W + M, H - M - T.xs * 2.1, 'APRÈS', P.menthe, P.vert),
  ]);

// 17. Cinq étapes numérotées.
add('carrousel-etapes', 'Storytelling 5 étapes', 'carousel',
  'Cinq étapes numérotées, une par slide, rythme identique.', 5,
  solid(P.vert), [
    [0, 1, 2, 3, 4].map((i) => [
      cell(W * i + M, M, CW, 700, { radius: 6 }),
      text(W * i + M, M + 748, CW, `0${i + 1}`, { size: T.xl, color: P.orange }),
      text(W * i + M, M + 872, CW, `Étape ${i + 1}`, { size: T.lg, color: P.blanc }),
      text(W * i + M, M + 968, CW - 40, 'Une phrase courte pour décrire cette étape.', {
        size: T.sm, weight: 400, color: P.menthe, lineHeight: 1.45,
      }),
      line(W * i + M, H - M, [0, 0, CW * ((i + 1) / 5), 0], P.menthe, 5),
    ]),
  ]);

// 18. Mosaïque qui ne s'interrompt pas aux découpes.
add('carrousel-mosaique', 'Mosaïque continue', 'carousel',
  'Une mosaïque qui traverse les découpes sans s\'interrompre.', 3,
  solid(P.noir), [
    cell(M, M, W * 1.25, 660, { radius: 6 }),
    cell(M + W * 1.25 + G, M, W * 3 - M * 2 - W * 1.25 - G, 660, { radius: 6 }),
    cell(M, M + 660 + G, W * 0.85, H - M * 2 - 660 - G, { radius: 6 }),
    cell(M + W * 0.85 + G, M + 660 + G, W * 3 - M * 2 - W * 0.85 - G, H - M * 2 - 660 - G, { radius: 6 }),
  ]);

// 19. Titre géant qui court sur tout le carrousel.
add('carrousel-bande-texte', 'Bande de texte continue', 'carousel',
  'Un titre géant qui court d\'une slide à l\'autre, au-dessus d\'une photo.', 3,
  gradient(P.vert, '#08201a', 0), [
    cell(M, M, W * 3 - M * 2, 640, { radius: 6 }),
    text(M, M + 726, W * 3 - M * 2, 'UNE IDÉE QUI TRAVERSE TOUT LE CARROUSEL', {
      size: 232, color: P.menthe, lineHeight: 0.98, letterSpacing: -10,
    }),
    line(M, H - M - 40, [0, 0, W * 3 - M * 2, 0], P.orange, 6),
  ]);

// 20. Récapitulatif puis appel à l'action.
add('carrousel-cta', 'Galerie + appel à l\'action', 'carousel',
  'Trois photos plein cadre, puis une slide d\'appel à l\'action.', 4,
  solid(P.vert), [
    cell(0, 0, W, H),
    cell(W, 0, W, H),
    cell(W * 2, 0, W, H),
    rect(W * 3, 0, W, H, P.menthe),
    text(W * 3 + M, 340, CW, 'ON EN\nPARLE ?', { size: T.hero, color: P.vert }),
    line(W * 3 + M, 700, [0, 0, 140, 0], P.orange, 10),
    text(W * 3 + M, 760, CW - 80, 'Écrivez-nous, on répond sous 24 h.', {
      size: T.md, weight: 400, color: P.vert, lineHeight: 1.4,
    }),
    ...pill(W * 3 + M, 920, 'LOCALIA.FR', P.vert, P.menthe),
  ]);

/* ================================== Écriture ================================ */

for (const file of readdirSync(OUT)) {
  if (file.endsWith('.json')) unlinkSync(`${OUT}/${file}`);
}
for (const template of templates) {
  writeFileSync(`${OUT}/${template.id}.json`, `${JSON.stringify(template, null, 2)}\n`);
}
console.log(`${templates.length} templates écrits`);
