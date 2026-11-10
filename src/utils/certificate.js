// Imagem do certificado (PNG, 1600 x 1131, proporção A4 deitada), no estilo da marca.
// O texto vira curva com a fonte Nunito (src/assets/fonts), então não depende de fonte instalada.
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");
const { Resvg } = require("@resvg/resvg-js");
const config = require("../config");

const W = 1600;
const H = 1131;
const BRAND_DIR = path.join(__dirname, "..", "..", "brand");

// Paleta da marca (brand/tokens/colors.json; o teste da marca confere que continuam iguais).
const C = {
  violet: "#6C4DFF", violetDeep: "#4A2FD6", violetTint: "#EEEAFF", ink: "#1B1740", mist: "#6B6890",
  cloud: "#F7F5FF", mint: "#2BD9A8", spark: "#FFB224", flame: "#FF7A2F",
};
// Cor de cada nível no selo; o texto sobre ela é tinta ou branco, o que tiver mais contraste.
const LEVEL_COLOR = { beginner: C.mint, intermediate: C.spark, advanced: C.flame, expert: C.violet };

// ---------- fontes (lidas uma vez) ----------

let fonts = null;
function loadFonts() {
  if (fonts) return fonts;
  const load = (file) => {
    const buf = fs.readFileSync(path.join(__dirname, "..", "assets", "fonts", file));
    return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };
  fonts = { black: load("Nunito-Black.woff"), bold: load("Nunito-Bold.woff") };
  return fonts;
}

// Tira do texto o que a fonte não sabe desenhar (emoji, alfabetos que ela não tem), para não sair
// um quadradinho no certificado.
function drawable(font, text) {
  return [...String(text ?? "")].filter((ch) => ch === " " || font.charToGlyphIndex(ch) > 0).join("").replace(/\s+/g, " ").trim();
}

// Para texto que entra como texto (não como curva) no SVG, como o <title>: `&` e `<` quebrariam o XML.
const xml = (value) => String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Texto -> { d, width } com a linha de base em y = 0.
function shape(font, text, size, letterSpacing = 0) {
  const opts = { kerning: true, letterSpacing };
  return { d: font.getPath(text, 0, 0, size, opts).toPathData(2), width: font.getAdvanceWidth(text, size, opts) };
}

// Maior tamanho (até `max`, e nunca abaixo de `min`) em que o texto cabe em `maxWidth`. Se nem no
// tamanho mínimo couber, corta o fim com reticências em vez de estourar a margem do certificado.
function fit(font, text, { max, min, maxWidth, letterSpacing = 0 }) {
  let size = max;
  let s = shape(font, text, size, letterSpacing);
  while (s.width > maxWidth && size > min) {
    size -= 2;
    s = shape(font, text, size, letterSpacing);
  }
  if (s.width > maxWidth) {
    const dots = font.charToGlyphIndex("…") > 0 ? "…" : "...";
    let cut = text;
    while (cut.length > 1 && s.width > maxWidth) {
      cut = cut.slice(0, -1).trimEnd();
      s = shape(font, `${cut}${dots}`, size, letterSpacing);
    }
  }
  return { ...s, size };
}

const centered = (s, y, fill, extra = "") =>
  `<path transform="translate(${((W - s.width) / 2).toFixed(1)} ${y})" d="${s.d}" fill="${fill}"${extra}/>`;

// ---------- peças da marca (lidas dos arquivos de brand/, com alternativa se faltarem) ----------

function inlineSvg(relPath) {
  try {
    const svg = fs.readFileSync(path.join(BRAND_DIR, relPath), "utf8");
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!box) return null;
    return { inner: svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, ""), w: Number(box[1]), h: Number(box[2]) };
  } catch {
    return null;
  }
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const readable = (bg) => (contrast("#FFFFFF", bg) >= contrast(C.ink, bg) ? "#FFFFFF" : C.ink);

// ---------- o certificado ----------

// { name, courseName, levelId, levelLabel, modules: ["Fundamentos de JavaScript", ...], issuedAt: Date, code }
function certificateSvg({ name, courseName, levelId, levelLabel, modules, issuedAt, code }) {
  const { black, bold } = loadFonts();
  const holder = drawable(black, name) || "Estudante";
  const course = drawable(black, courseName) || "Curso";

  // letterSpacing é em "em" (0.1 = 10% do tamanho da letra), não em pixels.
  const label = shape(bold, "CERTIFICADO DE CONCLUSÃO", 34, 0.16);
  const intro = shape(bold, "O Devlingo certifica que", 40);
  const who = fit(black, holder, { max: 132, min: 56, maxWidth: 1240 });
  const did = shape(bold, "concluiu com êxito o curso", 40);
  const title = fit(black, course, { max: 84, min: 40, maxWidth: 1300 });

  const pillText = `NÍVEL ${drawable(black, levelLabel).toUpperCase()}`;
  const pill = shape(black, pillText, 32, 0.08);
  const pillW = pill.width + 90;
  const pillColor = LEVEL_COLOR[levelId] ?? C.violet;

  // Módulos numa linha só, diminuindo a letra e, no limite, cortando com reticências.
  const joined = drawable(bold, modules.join("  ·  "));
  let mods = fit(bold, joined, { max: 30, min: 22, maxWidth: 1300 });
  if (mods.width > 1300) {
    let cut = joined;
    while (cut.length > 10 && shape(bold, `${cut}…`, mods.size).width > 1300) cut = cut.slice(0, -2).trimEnd();
    mods = { ...shape(bold, `${cut}…`, mods.size), size: mods.size };
  }

  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: config.timezone }).format(issuedAt);
  const issued = shape(bold, `Emitido em ${date}`, 30);
  const verifyA = shape(bold, "Para verificar, marque o Devlingo e escreva:", 26);
  const verifyB = shape(black, `verificar ${code}`, 34);
  const tagline = shape(bold, "aprenda programação jogando", 26);
  const codeTag = shape(black, code, 28, 0.06);

  const logo = inlineSvg("logo/logo-horizontal.svg");
  const medal = inlineSvg("icons/medal.svg");
  const logoH = 118;

  // Alturas (linhas de base) do bloco central, de cima para baixo.
  const yLabel = 300;
  const yIntro = 380;
  const yName = 525;
  const yDid = 628;
  const yTitle = yDid + 30 + title.size * 0.78;
  const yPill = yTitle + 46;
  const yMods = yPill + 64 + 56;
  const logoSvg = logo
    ? `<g transform="translate(96 78) scale(${(logoH / logo.h).toFixed(4)})">${logo.inner}</g>`
    : `<path transform="translate(96 170)" d="${shape(black, "devlingo", 96).d}" fill="${C.violet}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>${xml(`Certificado: ${course} (${levelLabel})`)}</title>
  <defs>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8E75FF"/><stop offset="1" stop-color="#4A2FD6"/></linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.violet}" stop-opacity="0"/><stop offset=".5" stop-color="${C.violet}"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></linearGradient>
    <radialGradient id="glow" cx=".85" cy=".1" r=".7"><stop offset="0" stop-color="${C.violet}" stop-opacity=".14"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.cloud}"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="34" fill="#FFFFFF" stroke="url(#frame)" stroke-width="8"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" rx="34" fill="url(#glow)"/>
  ${logoSvg}
  <path transform="translate(${(W - 96 - codeTag.width).toFixed(1)} 138)" d="${codeTag.d}" fill="${C.mist}"/>

  ${centered(label, yLabel, C.mist)}
  ${centered(intro, yIntro, C.ink)}
  ${centered(who, yName, C.violet)}
  <rect x="${(W - 900) / 2}" y="${yName + 30}" width="900" height="6" rx="3" fill="url(#rule)"/>
  ${centered(did, yDid, C.ink)}
  ${centered(title, yTitle.toFixed(1), C.ink)}

  <g transform="translate(${((W - pillW) / 2).toFixed(1)} ${yPill.toFixed(1)})">
    <rect width="${pillW.toFixed(1)}" height="64" rx="32" fill="${pillColor}"/>
    <path transform="translate(45 43)" d="${pill.d}" fill="${readable(pillColor)}"/>
  </g>
  ${centered(mods, yMods.toFixed(1), C.mist)}

  <path transform="translate(96 962)" d="${issued.d}" fill="${C.ink}"/>
  <path transform="translate(96 1008)" d="${verifyA.d}" fill="${C.mist}"/>
  <path transform="translate(96 1054)" d="${verifyB.d}" fill="${C.violet}"/>
  ${medal ? `<g transform="translate(${W - 96 - 150} 866) scale(${(150 / medal.w).toFixed(4)})">${medal.inner}</g>` : ""}
  <path transform="translate(${(W - 96 - tagline.width).toFixed(1)} 1054)" d="${tagline.d}" fill="${C.mist}"/>
</svg>
`;
}

// Devolve o PNG do certificado (Buffer).
function renderCertificate(data) {
  return new Resvg(certificateSvg(data), { fitTo: { mode: "width", value: W } }).render().asPng();
}

module.exports = { renderCertificate, certificateSvg, drawable, WIDTH: W, HEIGHT: H, loadFonts };
