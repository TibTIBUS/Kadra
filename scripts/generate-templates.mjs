import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('../src/templates', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const P = { vert: '#0f3d2e', menthe: '#7ed6ad', orange: '#ef8a3f', blanc: '#ffffff', noir: '#111111' };
const W = 1080, H = 1350, M = 60, G = 24;

let n = 0;
const cell = (x, y, w, h, radius = 24) => ({ id: `c${++n}`, type: 'photoCell', x, y, w, h, radius, crop: { offsetX: 0, offsetY: 0, scale: 1 } });
const text = (x, y, w, t, o = {}) => ({ id: `t${++n}`, type: 'text', x, y, w, text: t, font: 'Poppins', weight: 800, size: 72, color: P.blanc, align: 'left', lineHeight: 1.15, ...o });
const rect = (x, y, w, h, fill, o = {}) => ({ id: `s${++n}`, type: 'shape', shape: 'rect', x, y, w, h, fill, radius: 0, ...o });
const circle = (x, y, r, fill, o = {}) => ({ id: `s${++n}`, type: 'shape', shape: 'circle', x, y, r, fill, ...o });
const line = (x, y, points, stroke, strokeWidth = 8) => ({ id: `s${++n}`, type: 'shape', shape: 'line', x, y, points, stroke, strokeWidth });

const solid = (color) => ({ type: 'solid', color });
const gradient = (from, to, angle = 90) => ({ type: 'gradient', from, to, angle });

const templates = [];
const add = (id, name, category, description, slideCount, background, elements) => {
  n = 0;
  templates.push({
    id, name, category, description, slideCount,
    formats: category === 'collage' ? ['collage_portrait', 'collage_square'] : ['carousel_portrait', 'carousel_square'],
    scene: { width: W * slideCount, height: H, slideWidth: W, background, elements },
  });
};

/* ---------------------------------- COLLAGES --------------------------------- */

add('collage-grille-2', 'Grille 2 photos', 'collage', 'Deux photos empilées, bandeau de titre entre les deux.', 1, solid(P.vert), [
  cell(M, M, W - M * 2, 580),
  cell(M, M + 580 + G + 96, W - M * 2, H - (M * 2 + 580 + G + 96)),
  text(M, M + 580 + G + 12, W - M * 2, 'VOTRE TITRE', { size: 64, color: P.menthe }),
]);

add('collage-grille-3', 'Grille 3 photos', 'collage', 'Une photo large au-dessus, deux vignettes en dessous.', 1, solid(P.vert), [
  cell(M, M, W - M * 2, 760),
  cell(M, M + 760 + G, (W - M * 2 - G) / 2, 420),
  cell(M + (W - M * 2 - G) / 2 + G, M + 760 + G, (W - M * 2 - G) / 2, 420),
  text(M, M + 760 + G + 420 + 24, W - M * 2, 'Localia · Normandie', { size: 40, weight: 600, color: P.menthe }),
]);

add('collage-grille-4', 'Grille 4 photos', 'collage', 'Quatre photos en carré parfait.', 1, solid(P.noir), [
  cell(M, M, (W - M * 2 - G) / 2, (H - M * 2 - G) / 2),
  cell(M + (W - M * 2 - G) / 2 + G, M, (W - M * 2 - G) / 2, (H - M * 2 - G) / 2),
  cell(M, M + (H - M * 2 - G) / 2 + G, (W - M * 2 - G) / 2, (H - M * 2 - G) / 2),
  cell(M + (W - M * 2 - G) / 2 + G, M + (H - M * 2 - G) / 2 + G, (W - M * 2 - G) / 2, (H - M * 2 - G) / 2),
]);

add('collage-hero-vignettes', 'Photo héro + 2 vignettes', 'collage', 'Une grande photo et deux vignettes latérales.', 1, solid(P.vert), [
  cell(M, M, 640, H - M * 2),
  cell(M + 640 + G, M, W - M * 2 - 640 - G, (H - M * 2 - G) / 2),
  cell(M + 640 + G, M + (H - M * 2 - G) / 2 + G, W - M * 2 - 640 - G, (H - M * 2 - G) / 2),
  circle(M + 640 + G + 40, H - M - 40, 20, P.orange),
]);

add('collage-mosaique', 'Mosaïque asymétrique', 'collage', 'Quatre photos de tailles différentes.', 1, solid(P.noir), [
  cell(M, M, 600, 600),
  cell(M + 600 + G, M, W - M * 2 - 600 - G, 290),
  cell(M + 600 + G, M + 290 + G, W - M * 2 - 600 - G, 286),
  cell(M, M + 600 + G, W - M * 2, H - M * 2 - 600 - G),
]);

add('collage-polaroid', 'Cadre polaroid', 'collage', 'Photo encadrée de blanc avec légende manuscrite.', 1, gradient(P.vert, P.noir, 90), [
  rect(M + 40, 180, W - (M + 40) * 2, 1000, P.blanc, { radius: 12 }),
  cell(M + 40 + 48, 180 + 48, W - (M + 40) * 2 - 96, 780, 0),
  text(M + 40 + 48, 180 + 48 + 780 + 48, W - (M + 40) * 2 - 96, 'Un moment Localia', { size: 56, weight: 600, color: P.noir, align: 'center' }),
]);

add('collage-avant-apres', 'Avant / Après', 'collage', 'Deux photos côte à côte avec étiquettes.', 1, solid(P.vert), [
  cell(M, 220, (W - M * 2 - G) / 2, H - 220 - M),
  cell(M + (W - M * 2 - G) / 2 + G, 220, (W - M * 2 - G) / 2, H - 220 - M),
  rect(M, 120, 240, 72, P.orange, { radius: 36 }),
  text(M, 136, 240, 'AVANT', { size: 40, align: 'center', color: P.blanc }),
  rect(M + (W - M * 2 - G) / 2 + G, 120, 240, 72, P.menthe, { radius: 36 }),
  text(M + (W - M * 2 - G) / 2 + G, 136, 240, 'APRÈS', { size: 40, align: 'center', color: P.vert }),
]);

add('collage-bandeau-titre', 'Bandeau titre + photos', 'collage', 'Un bandeau de titre puis trois photos en colonne.', 1, solid(P.menthe), [
  rect(0, 0, W, 320, P.vert),
  text(M, 96, W - M * 2, 'NOS RÉALISATIONS', { size: 76, color: P.menthe }),
  cell(M, 380, W - M * 2, 400),
  cell(M, 380 + 400 + G, (W - M * 2 - G) / 2, H - M - (380 + 400 + G)),
  cell(M + (W - M * 2 - G) / 2 + G, 380 + 400 + G, (W - M * 2 - G) / 2, H - M - (380 + 400 + G)),
]);

add('collage-split-diagonal', 'Split diagonal', 'collage', 'Deux photos séparées par une diagonale.', 1, solid(P.noir), [
  cell(0, 0, W, 700, 0),
  cell(0, 700, W, H - 700, 0),
  line(0, 700, [0, 40, W, -40], P.orange, 14),
  text(M, H - 240, W - M * 2, 'Avant / après', { size: 56, weight: 600, color: P.blanc }),
]);

add('collage-plein-cadre', 'Photo plein cadre + texte', 'collage', 'Une photo pleine page et un bloc de texte en bas.', 1, solid(P.noir), [
  cell(0, 0, W, H, 0),
  rect(0, H - 420, W, 420, 'rgba(15,61,46,0.85)'),
  text(M, H - 360, W - M * 2, 'UN TITRE FORT', { size: 84 }),
  text(M, H - 230, W - M * 2, 'Une phrase de contexte, courte et claire.', { size: 40, weight: 400, color: P.menthe }),
]);

/* --------------------------------- CARROUSELS -------------------------------- */

add('carrousel-panorama-3', 'Panorama 3 slides', 'carousel', 'Une seule photo panoramique répartie sur trois slides.', 3, solid(P.vert), [
  cell(M, M, W * 3 - M * 2, H - M * 2, 0),
  text(M + 40, H - 240, 800, 'Faites glisser →', { size: 48, weight: 600, color: P.blanc }),
]);

add('carrousel-photo-geante', 'Photo géante sur 2 slides', 'carousel', 'Une photo à cheval sur deux slides, texte sur la troisième.', 3, solid(P.noir), [
  cell(M, M, W * 2 - M * 2 + W * 0, H - M * 2, 24),
  cell(W * 2 + M, M, W - M * 2, 620, 24),
  text(W * 2 + M, M + 620 + 48, W - M * 2, 'LE MOT DE LA FIN', { size: 72, color: P.menthe }),
  text(W * 2 + M, M + 620 + 180, W - M * 2, 'Un paragraphe court pour conclure le carrousel.', { size: 38, weight: 400 }),
]);

add('carrousel-fil-conducteur', 'Fil conducteur', 'carousel', 'Une ligne menthe traverse les trois slides et relie les photos.', 3, solid(P.vert), [
  line(0, H / 2, [0, 0, W * 3, 0], P.menthe, 10),
  cell(M, M, W - M * 2, H / 2 - M - 40, 24),
  cell(W + M, H / 2 + 40, W - M * 2, H / 2 - M - 40, 24),
  cell(W * 2 + M, M, W - M * 2, H / 2 - M - 40, 24),
  circle(W / 2, H / 2, 22, P.orange),
  circle(W * 1.5, H / 2, 22, P.orange),
  circle(W * 2.5, H / 2, 22, P.orange),
]);

add('carrousel-titre-galerie', 'Titre + galerie', 'carousel', 'Une slide de titre puis trois slides de photos.', 4, solid(P.vert), [
  text(M, 420, W - M * 2, 'NOTRE\nSÉLECTION', { size: 110, color: P.menthe }),
  text(M, 760, W - M * 2, 'Swipez pour découvrir', { size: 40, weight: 400 }),
  rect(M, 700, 160, 8, P.orange),
  cell(W + M, M, W - M * 2, H - M * 2, 24),
  cell(W * 2 + M, M, W - M * 2, H - M * 2, 24),
  cell(W * 3 + M, M, W - M * 2, H - M * 2, 24),
]);

add('carrousel-avant-apres', 'Avant / après sur 2 slides', 'carousel', 'Une slide avant, une slide après, séparées par la découpe.', 2, solid(P.noir), [
  cell(0, 0, W, H, 0),
  cell(W, 0, W, H, 0),
  rect(M, M, 280, 80, P.orange, { radius: 40 }),
  text(M, M + 18, 280, 'AVANT', { size: 44, align: 'center' }),
  rect(W + M, M, 280, 80, P.menthe, { radius: 40 }),
  text(W + M, M + 18, 280, 'APRÈS', { size: 44, align: 'center', color: P.vert }),
]);

add('carrousel-storytelling-5', 'Storytelling 5 slides', 'carousel', 'Cinq étapes numérotées, une par slide.', 5, solid(P.vert), [
  ...[0, 1, 2, 3, 4].flatMap((i) => [
    cell(W * i + M, M, W - M * 2, 780, 24),
    circle(W * i + M + 60, M + 880, 48, P.orange),
    text(W * i + M + 24, M + 848, 72, String(i + 1), { size: 56, align: 'center' }),
    text(W * i + M, M + 980, W - M * 2, `Étape ${i + 1}`, { size: 64, color: P.menthe }),
    text(W * i + M, M + 1080, W - M * 2, 'Décrivez cette étape en une phrase.', { size: 36, weight: 400 }),
  ]),
]);

add('carrousel-mosaique-continue', 'Mosaïque continue', 'carousel', 'Une mosaïque de photos qui ne s\'interrompt pas entre les slides.', 3, solid(P.noir), [
  cell(M, M, 700, 620, 16),
  cell(M + 700 + G, M, W * 3 - M * 2 - 700 - G - 700 - G, 620, 16),
  cell(W * 3 - M - 700, M, 700, 620, 16),
  cell(M, M + 620 + G, 900, H - M * 2 - 620 - G, 16),
  cell(M + 900 + G, M + 620 + G, W * 3 - M * 2 - 900 - G, H - M * 2 - 620 - G, 16),
]);

add('carrousel-bande-texte', 'Bande de texte continue', 'carousel', 'Un titre qui court sur toute la largeur du carrousel.', 3, gradient(P.vert, P.noir, 0), [
  cell(M, M, W * 3 - M * 2, 760, 24),
  text(M, M + 820, W * 3 - M * 2, 'UNE IDÉE QUI TRAVERSE TOUT LE CARROUSEL', { size: 120, color: P.menthe, lineHeight: 1.05 }),
  rect(M, H - 200, W * 3 - M * 2, 6, P.orange),
]);

add('carrousel-zoom-progressif', 'Zoom progressif', 'carousel', 'Trois cadrages de plus en plus serrés sur la même scène.', 3, solid(P.vert), [
  cell(M + 120, M + 150, W - (M + 120) * 2, H - (M + 150) * 2, 24),
  cell(W + M + 60, M + 80, W - (M + 60) * 2, H - (M + 80) * 2, 24),
  cell(W * 2 + M, M, W - M * 2, H - M * 2, 24),
  text(M + 120, H - 130, 600, 'Large', { size: 40, weight: 600, color: P.menthe }),
  text(W + M + 60, H - 130, 600, 'Moyen', { size: 40, weight: 600, color: P.menthe }),
  text(W * 2 + M, H - 130, 600, 'Serré', { size: 40, weight: 600, color: P.menthe }),
]);

add('carrousel-recap-cta', 'Récap final + CTA', 'carousel', 'Trois slides de contenu et une slide d\'appel à l\'action.', 4, solid(P.vert), [
  cell(M, M, W - M * 2, H - M * 2, 24),
  cell(W + M, M, W - M * 2, H - M * 2, 24),
  cell(W * 2 + M, M, W - M * 2, H - M * 2, 24),
  rect(W * 3, 0, W, H, P.menthe),
  text(W * 3 + M, 420, W - M * 2, 'ON EN PARLE ?', { size: 96, color: P.vert }),
  rect(W * 3 + M, 700, 520, 110, P.orange, { radius: 55 }),
  text(W * 3 + M, 732, 520, 'Écrivez-nous', { size: 44, align: 'center', color: P.blanc }),
  text(W * 3 + M, 900, W - M * 2, 'localia.fr', { size: 40, weight: 400, color: P.vert }),
]);

for (const template of templates) {
  writeFileSync(`${OUT}/${template.id}.json`, `${JSON.stringify(template, null, 2)}\n`);
}
console.log(`${templates.length} templates écrits`);
