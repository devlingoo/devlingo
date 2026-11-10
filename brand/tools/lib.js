"use strict";
// Peças da identidade visual do Devlingo: cores, fontes, símbolo, logotipo e ícones.
// Tudo vira SVG puro (o texto é convertido em curvas, então não depende de fonte instalada).
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

// ---------------------------------------------------------------- cores
const COLORS = {
  violet: { hex: "#6C4DFF", name: "Violeta Devlingo", role: "Cor principal: botões, links, destaques e o balão do símbolo" },
  violetDeep: { hex: "#4A2FD6", name: "Violeta profundo", role: "Estados de pressionado e sombras da cor principal" },
  violetLight: { hex: "#A99BFF", name: "Violeta claro", role: "A cor principal sobre fundos escuros" },
  violetTint: { hex: "#EEEAFF", name: "Violeta névoa", role: "Fundos suaves, cartões e realces" },
  midnight: { hex: "#17123A", name: "Meia-noite", role: "Fundo escuro principal" },
  ink: { hex: "#1B1740", name: "Tinta", role: "Texto principal sobre fundo claro" },
  mist: { hex: "#6B6890", name: "Bruma", role: "Texto secundário e elementos discretos" },
  cloud: { hex: "#F7F5FF", name: "Nuvem", role: "Fundo claro principal" },
  mint: { hex: "#2BD9A8", name: "Menta", role: "Acerto, sucesso e progresso" },
  spark: { hex: "#FFB224", name: "Faísca", role: "Sequência, XP, conquistas e comemorações" },
  flame: { hex: "#FF7A2F", name: "Chama", role: "O laranja do degradê da chama da sequência" },
  coral: { hex: "#FF5C7A", name: "Coral", role: "Erro e alertas (sem agressividade)" },
};
const hex = (name) => COLORS[name].hex;

// Contraste WCAG entre duas cores (hex).
function luminance(h) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ---------------------------------------------------------------- fontes
const FONT_DIR = path.join(__dirname, "node_modules", "@fontsource");
function loadFont(pkg, file) {
  const buf = fs.readFileSync(path.join(FONT_DIR, pkg, "files", file));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}
const fonts = {
  black: () => loadFont("nunito", "nunito-latin-900-normal.woff"),
  extra: () => loadFont("nunito", "nunito-latin-800-normal.woff"),
  bold: () => loadFont("nunito", "nunito-latin-700-normal.woff"),
  mono: () => loadFont("jetbrains-mono", "jetbrains-mono-latin-500-normal.woff"),
};
const fontFile = (pkg, file) => path.join(FONT_DIR, pkg, "files", file);

// Texto -> curva SVG. Devolve { d, width, box }.
function textPath(font, str, x, y, size, opts = {}) {
  const o = { kerning: true, letterSpacing: opts.letterSpacing ?? 0 };
  const p = font.getPath(str, x, y, size, o);
  return { d: p.toPathData(2), width: font.getAdvanceWidth(str, size, o), box: p.getBoundingBox() };
}

// ---------------------------------------------------------------- símbolo
// Área desenhada do símbolo dentro da caixa 512x512 (sem sobra), usada para alinhar nos logotipos.
const MARK = { x: 56, y: 34, w: 400, h: 448 };

// O símbolo: balão de fala (o "lingo") com rosto de colchetes (o "dev") e antena com faísca (o bot).
// variant "color": cores da marca. variant "mono": uma cor só, rosto vazado.
// small: versão para tamanhos minúsculos (favicon): traços mais grossos e sem o brilho.
function mark({ id = "mk", variant = "color", fill = "#FFFFFF", small = false } = {}) {
  const eye = small ? 42 : 32;
  const mouth = small ? 36 : 28;
  const face = {
    eyeL: "M212 218 L170 250 L212 282",
    eyeR: "M300 218 L342 250 L300 282",
    smile: "M206 316 Q256 354 306 316",
  };
  const tail = "M174 402 H262 L134 466 Z";

  if (variant === "mono") {
    return `
  <defs>
    <mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <rect width="512" height="512" fill="#fff"/>
      <g fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">
        <path d="${face.eyeL}" stroke-width="32"/><path d="${face.eyeR}" stroke-width="32"/>
        <path d="${face.smile}" stroke-width="28"/>
      </g>
    </mask>
  </defs>
  <g fill="${fill}">
    <g mask="url(#${id}-cut)">
      <rect x="56" y="118" width="400" height="300" rx="112"/>
      <path d="${tail}" stroke="${fill}" stroke-width="22" stroke-linejoin="round"/>
    </g>
    <path d="M256 124 V84" stroke="${fill}" stroke-width="16" stroke-linecap="round" fill="none"/>
    <circle cx="256" cy="60" r="26"/>
  </g>`;
  }

  return `
  <defs>
    <linearGradient id="${id}-bubble" gradientUnits="userSpaceOnUse" x1="96" y1="118" x2="420" y2="470">
      <stop offset="0" stop-color="#8E75FF"/><stop offset="1" stop-color="#5233E6"/>
    </linearGradient>
    <radialGradient id="${id}-spark" cx="0.38" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#FFD978"/><stop offset="1" stop-color="${hex("spark")}"/>
    </radialGradient>
  </defs>
  <path d="M256 124 V84" stroke="#7A5CFF" stroke-width="${small ? 22 : 16}" stroke-linecap="round" fill="none"/>
  <circle cx="256" cy="60" r="${small ? 29 : 26}" fill="url(#${id}-spark)"/>
  ${small ? "" : `<circle cx="247" cy="51" r="7" fill="#fff" fill-opacity=".55"/>`}
  <rect x="56" y="118" width="400" height="300" rx="112" fill="url(#${id}-bubble)"/>
  <path d="${tail}" fill="url(#${id}-bubble)" stroke="url(#${id}-bubble)" stroke-width="22" stroke-linejoin="round"/>
  ${small ? "" : `<path d="M112 196 Q146 150 232 146" stroke="#fff" stroke-opacity=".2" stroke-width="14" stroke-linecap="round" fill="none"/>`}
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${face.eyeL}" stroke="#fff" stroke-width="${eye}"/>
    <path d="${face.eyeR}" stroke="#fff" stroke-width="${eye}"/>
    <path d="${face.smile}" stroke="${hex("mint")}" stroke-width="${mouth}"/>
  </g>`;
}

// ---------------------------------------------------------------- logotipo (palavra)
// "dev" + "lingo" em Nunito Black, com o pingo do "i" trocado pela faísca.
function wordmark(font, size, { devColor, lingoColor, dotColor = hex("spark") }) {
  const o = { kerning: true, letterSpacing: -0.012 };
  const dev = font.getPath("dev", 0, 0, size, o);
  const advDev = font.getAdvanceWidth("dev", size, o);
  const lingo = font.getPath("lıngo", advDev, 0, size, o);

  // O pingo original do "i" dá a posição e o tamanho da faísca.
  const iBox = font.getPath("i", 0, 0, size).getBoundingBox();
  const advL = font.getAdvanceWidth("l", size, o);
  const r = ((iBox.x2 - iBox.x1) / 2) * 1.1;
  const cx = advDev + advL + (iBox.x1 + iBox.x2) / 2;
  const cy = iBox.y1 + r;

  const boxes = [dev.getBoundingBox(), lingo.getBoundingBox(), { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r }];
  const box = {
    x1: Math.min(...boxes.map((b) => b.x1)),
    y1: Math.min(...boxes.map((b) => b.y1)),
    x2: Math.max(...boxes.map((b) => b.x2)),
    y2: Math.max(...boxes.map((b) => b.y2)),
  };
  const xHeight = -font.getPath("x", 0, 0, size).getBoundingBox().y1;

  // Markup com a linha de base em y = 0 (o chamador posiciona com transform).
  const svg = `<g>
    <path d="${dev.toPathData(2)}" fill="${devColor}"/>
    <path d="${lingo.toPathData(2)}" fill="${lingoColor}"/>
    <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${dotColor}"/>
  </g>`;
  return { svg, box, width: box.x2 - box.x1, height: box.y2 - box.y1, xHeight };
}

const THEMES = {
  light: { dev: hex("violet"), lingo: hex("ink"), tagline: hex("mist"), bg: "#FFFFFF" },
  dark: { dev: hex("violetLight"), lingo: "#FFFFFF", tagline: "#B9B3DD", bg: hex("midnight") },
};

const doc = (w, h, inner, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="${round(w)}" height="${round(h)}"${extra}>${inner}\n</svg>\n`;
const round = (n) => Math.round(n * 100) / 100;

// Coloca o símbolo (área desenhada) com o canto superior esquerdo em (x, y) e altura h.
function placeMark(markSvg, x, y, h) {
  const s = h / MARK.h;
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(s * 1000) / 1000}) translate(${-MARK.x} ${-MARK.y})">${markSvg}</g>`;
}

// Logotipo horizontal: símbolo + palavra, com a palavra centralizada no balão.
function logoHorizontal(font, theme, { id = "lh", title = "Devlingo" } = {}) {
  const t = THEMES[theme];
  const markH = 240;
  const wmSize = 150;
  const wm = wordmark(font, wmSize, { devColor: t.dev, lingoColor: t.lingo });
  const s = markH / MARK.h;
  const gap = markH * 0.2;
  const markW = MARK.w * s;
  const bubbleCenterY = (118 + 150 - MARK.y) * s; // centro do balão em relação ao topo do símbolo
  const baseline = bubbleCenterY + wm.xHeight / 2;
  const wmX = markW + gap - wm.box.x1;
  const width = markW + gap + wm.width;
  const inner = `
  <title>${title}</title>
  ${placeMark(mark({ id }), 0, 0, markH)}
  <g transform="translate(${round(wmX)} ${round(baseline)})">${wm.svg}</g>`;
  return { svg: doc(width, markH, inner), width, height: markH };
}

// Logotipo empilhado: símbolo em cima, palavra embaixo, centralizados.
function logoStacked(font, theme, { id = "ls", title = "Devlingo" } = {}) {
  const t = THEMES[theme];
  const markH = 300;
  const wmSize = 180;
  const wm = wordmark(font, wmSize, { devColor: t.dev, lingoColor: t.lingo });
  const s = markH / MARK.h;
  const markW = MARK.w * s;
  const width = Math.max(markW, wm.width);
  const gap = 36;
  const baseline = markH + gap - wm.box.y1;
  const inner = `
  <title>${title}</title>
  ${placeMark(mark({ id }), (width - markW) / 2, 0, markH)}
  <g transform="translate(${round((width - wm.width) / 2 - wm.box.x1)} ${round(baseline)})">${wm.svg}</g>`;
  return { svg: doc(width, markH + gap + wm.height, inner), width, height: markH + gap + wm.height };
}

// ---------------------------------------------------------------- ícones (viewBox 64x64)
const ICONS = {
  flame: (id) => `
  <defs><linearGradient id="${id}" x1="0.5" y1="0" x2="0.5" y2="1"><stop offset="0" stop-color="${hex("spark")}"/><stop offset="1" stop-color="${hex("flame")}"/></linearGradient></defs>
  <path d="M32 3 C36 14 50 22 50 40 C50 52 42 61 32 61 C22 61 14 52 14 40 C14 31 19 26 23 20 C24 26 27 29 30 30 C28 20 28 10 32 3 Z" fill="url(#${id})"/>
  <path d="M32 59 C25 59 21 54 21 48 C21 42 26 39 29 33 C32 38 43 41 43 49 C43 55 38 59 32 59 Z" fill="#FFE08A"/>`,
  target: (id) => `
  <circle cx="32" cy="32" r="25" fill="none" stroke="${hex("violet")}" stroke-width="6"/>
  <circle cx="32" cy="32" r="14" fill="none" stroke="${hex("mint")}" stroke-width="6"/>
  <circle cx="32" cy="32" r="5" fill="${hex("spark")}"/>`,
  bolt: () => `<path d="M37 4 L14 35 H29 L26 60 L50 27 H35 Z" fill="${hex("spark")}" stroke="${hex("spark")}" stroke-width="3" stroke-linejoin="round"/>`,
  medal: (id) => `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD978"/><stop offset="1" stop-color="${hex("spark")}"/></linearGradient></defs>
  <path d="M20 4 H30 L36 22 H26 Z" fill="${hex("violet")}"/><path d="M44 4 H34 L28 22 H38 Z" fill="${hex("violetLight")}"/>
  <circle cx="32" cy="40" r="19" fill="url(#${id})"/>
  <path d="M32 29 L35.2 36 L42.8 36.8 L37.1 41.9 L38.8 49.4 L32 45.5 L25.2 49.4 L26.9 41.9 L21.2 36.8 L28.8 36 Z" fill="#fff" fill-opacity=".92" stroke="#fff" stroke-opacity=".92" stroke-width="2" stroke-linejoin="round"/>`,
  star: (id) => `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD978"/><stop offset="1" stop-color="${hex("spark")}"/></linearGradient></defs>
  <path d="M32 6 L39.4 23.2 L58 24.8 L43.9 37 L48.2 55 L32 45.4 L15.8 55 L20.1 37 L6 24.8 L24.6 23.2 Z" fill="url(#${id})" stroke="url(#${id})" stroke-width="5" stroke-linejoin="round"/>`,
};
const iconSvg = (name) => doc(64, 64, `<title>${name}</title>${ICONS[name](`ic-${name}`)}`);

module.exports = { COLORS, hex, contrast, rgb, fonts, fontFile, textPath, MARK, mark, wordmark, THEMES, doc, round, placeMark, logoHorizontal, logoStacked, ICONS, iconSvg };
