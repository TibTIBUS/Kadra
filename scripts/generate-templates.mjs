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
const HEIGHTS = [1350, 1080]; // portrait et carré : chaque template est généré pour les deux
let H = 1350;             // hauteur courante, réaffectée par le générateur
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

const TITRE_BANDE = 'UNE IDÉE QUI TRAVERSE TOUT LE CARROUSEL';

const templates = [];

/**
 * Un template décrit un motif, pas une scène figée :
 *  - `full` : éléments traversant tout le carrousel. x et w en fraction de la
 *    largeur totale, ils s'étirent donc avec le nombre de slides.
 *  - `lead` / `body` / `bodyAlt` / `tail` : première slide, motif répété,
 *    variante une slide sur deux, dernière slide. Coordonnées locales.
 *
 * Le motif est construit **pour chaque hauteur** (1350 en portrait, 1080 en
 * carré) plutôt que dessiné une fois puis écrasé verticalement : un écrasement
 * transforme un médaillon rond en ovale, désaligne un cadre incliné et aplatit
 * une grille carrée.
 */
const add = (id, name, category, description, defaultSlides, background, build) => {
  const variants = {};
  for (const height of HEIGHTS) {
    H = height;
    n = 0;
    const parts = typeof build === 'function' ? build(height) : build;
    variants[String(height)] = Object.fromEntries(
      Object.entries(parts).map(([key, value]) => [key, (value ?? []).flat(Infinity)]),
    );
  }
  H = 1350;
  templates.push({
    id, name, category, description, defaultSlides,
    formats: category === 'collage'
      ? ['collage_portrait', 'collage_square']
      : ['carousel_portrait', 'carousel_square'],
    refSlideWidth: W,
    background: typeof background === 'function' ? background() : background,
    variants,
  });
};

/* ================================= COLLAGES =================================
 * Une seule slide : tout tient dans `body`.
 * ========================================================================== */

// 1. La découpe oblique, faite correctement.
add('collage-split-diagonal', 'Split diagonal', 'collage',
  'Deux photos séparées par une vraie découpe oblique, sans recouvrement.', 1,
  solid(P.vert), () => {
    const split = diagonalPair(0.14, 0.52, 12);
    return {
      body: [
        polyCell(0, 0, W, H, split.haut),
        polyCell(0, 0, W, H, split.bas),
        pill(M, H - M - T.xs * 2.1, 'AVANT / APRÈS', P.orange, P.blanc),
      ],
    };
  });

// 2. Plein cadre, voile de lisibilité, titre serré.
add('collage-plein-cadre', 'Photo plein cadre', 'collage',
  'Une photo pleine page, voile dégradé et titre en bas.', 1,
  solid(P.noir), () => {
    const titleSize = H >= 1300 ? T.display : T.xxl;
    const titleTop = H - M - 150 - titleSize * 1.02 * 2;
    return {
      body: [
        cell(0, 0, W, H),
        scrim(0, H * 0.42, W, H * 0.58),
        text(M, titleTop, CW, 'UN TITRE\nQUI PORTE', { size: titleSize, color: P.blanc }),
        line(M, H - M - 92, [0, 0, 120, 0], P.orange, 8),
        text(M, H - M - 58, CW, 'Localia · Normandie', { size: T.sm, weight: 600, color: P.menthe, caps: true }),
      ],
    };
  });

// 3. Bandeau éditorial : la photo chevauche le bloc de couleur.
add('collage-editorial', 'Bandeau éditorial', 'collage',
  'Un bloc de couleur et une photo qui le chevauche, pour la profondeur.', 1,
  solid(P.vert), () => {
    const band = H * 0.46;
    const photoTop = H * 0.35;
    const photoH = H * 0.53;
    return {
      body: [
        rect(0, 0, W, band, P.menthe),
        text(M, band * 0.19, CW - 120, 'NOS\nRÉALISATIONS', { size: T.xxl, color: P.vert }),
        cell(M, photoTop, CW, photoH, {
          radius: 8,
          shadow: { color: '#000000', blur: 60, offsetX: 0, offsetY: 24, opacity: 0.45 },
        }),
        text(M, photoTop + photoH + (H - photoTop - photoH - T.sm) / 2, CW, 'localia.fr', {
          size: T.sm, weight: 600, color: P.menthe, caps: true,
        }),
      ],
    };
  });

// 4. Duo vertical.
add('collage-duo', 'Duo vertical', 'collage',
  'Deux photos superposées, gouttière fine et légende.', 1,
  solid(P.vert), () => {
    const caption = T.lg * 1.9;
    const cellH = (H - M * 2 - G - caption) / 2;
    return {
      body: [
        cell(M, M, CW, cellH, { radius: 6 }),
        cell(M, M + cellH + G, CW, cellH, { radius: 6 }),
        text(M, M + cellH * 2 + G + caption * 0.28, CW, 'Deux moments, une histoire', {
          size: T.lg, color: P.menthe,
        }),
      ],
    };
  });

// 5. Héro + deux vignettes.
add('collage-hero', 'Héro + vignettes', 'collage',
  'Une grande photo et deux vignettes, hiérarchie nette.', 1,
  solid(P.noir), () => {
    const label = T.sm * 2.2;
    const usable = H - M * 2 - G - label;
    const heroH = usable * 0.695;
    const thumbH = usable - heroH;
    return {
      body: [
        cell(M, M, CW, heroH, { radius: 6 }),
        cell(M, M + heroH + G, (CW - G) / 2, thumbH, { radius: 6 }),
        cell(M + (CW - G) / 2 + G, M + heroH + G, (CW - G) / 2, thumbH, { radius: 6 }),
        text(M, M + heroH + G + thumbH + label * 0.34, CW, 'Reportage', {
          size: T.sm, weight: 600, color: P.orange, caps: true,
        }),
      ],
    };
  });

// 6. Grille 4.
add('collage-grille-4', 'Grille 4 photos', 'collage',
  'Quatre photos, gouttière serrée, cadrage carré.', 1,
  solid(P.noir), () => {
    // Des carrés restent des carrés : on prend le côté que la page autorise.
    const size = Math.min((CW - G) / 2, (H - M * 2 - G) / 2);
    const left = (W - (size * 2 + G)) / 2;
    const top = (H - (size * 2 + G)) / 2;
    return {
      body: [
        cell(left, top, size, size, { radius: 4 }),
        cell(left + size + G, top, size, size, { radius: 4 }),
        cell(left, top + size + G, size, size, { radius: 4 }),
        cell(left + size + G, top + size + G, size, size, { radius: 4 }),
      ],
    };
  });

// 7. Mosaïque asymétrique.
add('collage-mosaique', 'Mosaïque asymétrique', 'collage',
  'Trois formats différents, équilibre asymétrique.', 1,
  solid(P.vert), () => {
    const topH = (H - M * 2 - G) * 0.52;
    const botH = H - M * 2 - G - topH;
    const wide = CW * 0.54;
    return {
      body: [
        cell(M, M, wide, topH, { radius: 6 }),
        cell(M + wide + G, M, CW - wide - G, topH, { radius: 6 }),
        cell(M, M + topH + G, CW, botH, { radius: 6 }),
        pill(M + 28, M + 28, 'LOCALIA', P.orange, P.blanc),
      ],
    };
  });

// 8. Polaroid incliné : le cadre est dimensionné pour tenir dans la page.
add('collage-polaroid', 'Polaroid', 'collage',
  'Photo encadrée de blanc, légèrement inclinée, ombre portée.', 1,
  gradient(P.vert, '#08201a', 90), () => {
    const frameH = H * 0.70;
    const frameW = frameH * (800 / 960);
    const border = frameW * 0.06;
    const photoH = frameH - border * 2 - frameH * 0.115;
    const frameX = (W - frameW) / 2;
    const frameY = (H - frameH) / 2;
    return {
      body: [
        rotateGroup([
          rect(frameX, frameY, frameW, frameH, P.blanc, {
            shadow: { color: '#000000', blur: 70, offsetX: 0, offsetY: 30, opacity: 0.5 },
          }),
          cell(frameX + border, frameY + border, frameW - border * 2, photoH),
          text(frameX + border, frameY + border + photoH + frameH * 0.022, frameW - border * 2, 'Été 2026', {
            size: T.lg, weight: 600, color: P.noir, align: 'center',
          }),
        ], W / 2, H / 2, -3.5),
      ],
    };
  });

// 9. Avant / après vertical.
add('collage-avant-apres', 'Avant / après', 'collage',
  'Deux photos côte à côte, séparation franche et étiquettes.', 1,
  solid(P.noir), () => ({
    body: [
      cell(0, 0, W / 2 - 5, H),
      cell(W / 2 + 5, 0, W / 2 - 5, H),
      scrim(0, H - 420, W, 420),
      pill(M, H - M - T.xs * 2.1, 'AVANT', P.orange, P.blanc),
      pill(W / 2 + 36, H - M - T.xs * 2.1, 'APRÈS', P.menthe, P.vert),
    ],
  }));

// 10. Médaillon : le portrait reste rond quelle que soit la hauteur.
add('collage-medaillon', 'Médaillon', 'collage',
  'Un portrait en cercle sur aplat, pour une présentation.', 1,
  solid(P.vert), () => {
    const d = Math.min(CW * 0.64, H * 0.45);
    const top = H * 0.16;
    const cx = W / 2;
    const cy = top + d / 2;
    return {
      body: [
        circle(cx, cy, d * 0.55, P.menthe, { opacity: 0.18 }),
        ellipseCell(cx - d / 2, top, d, d, { stroke: P.menthe, strokeWidth: 8 }),
        text(M, cy + d * 0.62, CW, 'THIBAUT', { size: T.xxl, color: P.blanc, align: 'center' }),
        text(M, cy + d * 0.62 + T.xxl * 1.35, CW, 'Fondateur · Localia', {
          size: T.sm, weight: 600, color: P.menthe, align: 'center', caps: true,
        }),
        line(cx - 60, cy + d * 0.62 + T.xxl * 1.35 + T.sm * 2.4, [0, 0, 120, 0], P.orange, 8),
      ],
    };
  });

/* ================================ CARROUSELS ================================
 * `full` : x et w en fraction de la largeur totale (0 → 1).
 * ========================================================================== */

// 11. Panorama : une seule photo, étirée sur toutes les slides.
add('carrousel-panorama', 'Panorama plein cadre', 'carousel',
  'Une seule photo panoramique qui traverse tout le carrousel.', 3,
  solid(P.noir), () => ({
    full: [cell(0, 0, 1, H)],
    lead: [
      scrim(0, H * 0.5, W, H * 0.5),
      // Le trait d'accent se place au-dessus du titre : posé en dessous, il
      // tombait dans la seconde ligne.
      line(M, H - M - T.xl * 1.02 * 2 - 44, [0, 0, 90, 0], P.orange, 8),
      text(M, H - M - T.xl * 1.02 * 2, CW, 'FAITES\nGLISSER', { size: T.xl, color: P.blanc }),
    ],
  }));

// 12. Découpe oblique continue : deux photos, sur toute la longueur.
add('carrousel-diagonale', 'Diagonale continue', 'carousel',
  'Deux photos séparées par une découpe oblique qui traverse tout le carrousel.', 3,
  solid(P.vert), () => {
    const split = diagonalPair(0.10, 0.55, 14);
    return {
      full: [
        polyCell(0, 0, 1, H, split.haut),
        polyCell(0, 0, 1, H, split.bas),
      ],
      lead: [pill(M, M, 'LOCALIA', P.orange, P.blanc)],
    };
  });

// 13. Une photo par slide, bord à bord.
add('carrousel-galerie', 'Galerie plein cadre', 'carousel',
  'Une photo plein cadre par slide, numérotée.', 5,
  solid(P.noir), () => ({
    body: [
      cell(0, 0, W, H),
      scrim(0, H - 300, W, 300),
      text(M, H - M - 48, CW, 'Localia', { size: T.sm, weight: 600, color: P.blanc, caps: true }),
    ],
  }));

// 14. Fil conducteur : une photo par slide, alternée de part et d'autre.
add('carrousel-fil', 'Fil conducteur', 'carousel',
  'Une ligne traverse tout le carrousel, les photos alternent de part et d\'autre.', 4,
  solid(P.vert), () => ({
    full: [line(0, H / 2, [0, 0, 1, 0], P.menthe, 5)],
    body: [
      cell(M, M, CW, H / 2 - M - 44, { radius: 6 }),
      circle(W / 2, H / 2, 16, P.orange),
      text(M, H / 2 + 44, CW, '{nn}', { size: T.lg, color: P.menthe }),
    ],
    bodyAlt: [
      cell(M, H / 2 + 44, CW, H / 2 - M - 44, { radius: 6 }),
      circle(W / 2, H / 2, 16, P.orange),
      text(M, H / 2 - 44 - T.lg * 1.3, CW, '{nn}', { size: T.lg, color: P.menthe }),
    ],
  }));

// 15. Couverture éditoriale puis galerie.
add('carrousel-couverture', 'Couverture + galerie', 'carousel',
  'Une slide de couverture typographique, puis une photo par slide.', 4,
  solid(P.vert), () => ({
    lead: [
      text(M, 380, CW, 'NOTRE\nSÉLECTION', { size: T.hero, color: P.menthe }),
      line(M, 760, [0, 0, 140, 0], P.orange, 10),
      text(M, 820, CW, 'Swipez pour découvrir', { size: T.sm, weight: 600, color: P.blanc, caps: true }),
    ],
    body: [cell(0, 0, W, H)],
  }));

// 16. Avant / après : la première et la dernière slide portent les étiquettes.
add('carrousel-avant-apres', 'Avant / après', 'carousel',
  'La première slide « avant », la dernière « après », les étapes au milieu.', 2,
  solid(P.noir), () => ({
    lead: [
      cell(0, 0, W, H),
      scrim(0, H - 380, W, 380),
      pill(M, H - M - T.xs * 2.1, 'AVANT', P.orange, P.blanc),
    ],
    body: [
      cell(0, 0, W, H),
      scrim(0, H - 380, W, 380),
      pill(M, H - M - T.xs * 2.1, 'ÉTAPE {n}', P.blanc, P.noir),
    ],
    tail: [
      cell(0, 0, W, H),
      scrim(0, H - 380, W, 380),
      pill(M, H - M - T.xs * 2.1, 'APRÈS', P.menthe, P.vert),
    ],
  }));

// 17. Étapes numérotées, une par slide.
add('carrousel-etapes', 'Storytelling par étapes', 'carousel',
  'Une étape par slide : photo, titre et phrase courte, même rythme partout.', 5,
  solid(P.vert), () => {
    const bloc = T.xl * 1.25 + T.lg * 1.35 + T.sm * 1.45 * 2;
    const photoH = H - M * 2 - bloc - H * 0.03;
    const numTop = M + photoH + H * 0.03;
    return {
      body: [
        cell(M, M, CW, photoH, { radius: 6 }),
        text(M, numTop, CW, '{nn}', { size: T.xl, color: P.orange }),
        text(M, numTop + T.xl * 1.25, CW, 'Étape {n}', { size: T.lg, color: P.blanc }),
        text(M, numTop + T.xl * 1.25 + T.lg * 1.35, CW - 40, 'Une phrase courte pour décrire cette étape.', {
          size: T.sm, weight: 400, color: P.menthe, lineHeight: 1.45,
        }),
      ],
    };
  });

// 18. Mosaïque continue : deux photos par slide, rythme inversé une fois sur deux.
add('carrousel-mosaique', 'Mosaïque continue', 'carousel',
  'Deux photos par slide, en rythme alterné, qui traversent les découpes.', 3,
  solid(P.noir), () => {
    const topH = (H - M * 2 - G) * 0.55;
    const botH = H - M * 2 - topH - G;
    const wide = CW * 0.62;
    const narrow = CW - wide - G;
    return {
      body: [
        cell(M, M, wide, topH, { radius: 6 }),
        cell(M + wide + G, M, narrow, topH, { radius: 6 }),
        cell(M, M + topH + G, CW, botH, { radius: 6 }),
      ],
      bodyAlt: [
        cell(M, M, CW, topH, { radius: 6 }),
        cell(M, M + topH + G, narrow, botH, { radius: 6 }),
        cell(M + narrow + G, M + topH + G, wide, botH, { radius: 6 }),
      ],
    };
  });

// 19. Titre géant sur toute la longueur, photo panoramique au-dessus.
add('carrousel-bande-texte', 'Bande de texte continue', 'carousel',
  'Un titre géant et une photo qui courent sur toute la longueur.', 3,
  gradient(P.vert, '#08201a', 0), () => {
    // Le titre occupe deux lignes : sa taille est déduite de la place restante
    // sous la photo, sinon il déborde du cadre en format carré.
    const photoH = (H - M * 2) * 0.52;
    const textTop = M + photoH + H * 0.055;
    const available = H - M - 40 - textTop;
    // Deux contraintes : la place verticale, et la largeur du carrousel le plus
    // court (2 slides), où le titre doit encore tenir sur deux lignes.
    const parLigne = TITRE_BANDE.length / 2;
    const size = Math.min(
      232,
      Math.floor(available / (2 * 0.98)),
      Math.floor((W * 2 - M * 2) / (parLigne * 0.52)),
    );
    return {
      full: [
        cell(0, M, 1, photoH, { radius: 6 }),
        text(0, textTop, 1, TITRE_BANDE, {
          size, color: P.menthe, lineHeight: 0.98, letterSpacing: -size * 0.043,
        }),
        line(0, H - M - 40, [0, 0, 1, 0], P.orange, 6),
      ],
    };
  });

// 20. Galerie puis appel à l'action.
add('carrousel-cta', 'Galerie + appel à l\'action', 'carousel',
  'Une photo par slide, puis une slide finale d\'appel à l\'action.', 4,
  solid(P.vert), () => ({
    body: [cell(0, 0, W, H)],
    tail: [
      rect(0, 0, W, H, P.menthe),
      text(M, 340, CW, 'ON EN\nPARLE ?', { size: T.hero, color: P.vert }),
      line(M, 700, [0, 0, 140, 0], P.orange, 10),
      text(M, 760, CW - 80, 'Écrivez-nous, on répond sous 24 h.', { size: T.md, weight: 400, color: P.vert, lineHeight: 1.4 }),
      pill(M, 920, 'LOCALIA.FR', P.vert, P.menthe),
    ],
  }));

/* ================================== Écriture ================================ */

for (const file of readdirSync(OUT)) {
  if (file.endsWith('.json')) unlinkSync(`${OUT}/${file}`);
}
for (const template of templates) {
  writeFileSync(`${OUT}/${template.id}.json`, `${JSON.stringify(template, null, 2)}\n`);
}
console.log(`${templates.length} templates écrits`);
