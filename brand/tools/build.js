"use strict";
// Gera todos os arquivos da identidade visual em brand/ (SVG, PNG e tokens).
// Uso: cd brand/tools && npm install && npm run build
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");
const L = require("./lib");

const BRAND = path.join(__dirname, "..");
const write = (rel, data) => {
  const file = path.join(BRAND, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const png = (svg, rel, width) => write(rel, new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng());

const black = L.fonts.black();
const extra = L.fonts.extra();
const bold = L.fonts.bold();
const mono = L.fonts.mono();

// ------------------------------------------------------------------ símbolo e logotipos
const markDoc = (opts, title) => L.doc(512, 512, `<title>${title}</title>${L.mark(opts)}`);
write("logo/mark.svg", markDoc({ id: "mk" }, "Devlingo"));
write("logo/mark-mono-white.svg", markDoc({ id: "mw", variant: "mono", fill: "#FFFFFF" }, "Devlingo (branco)"));
write("logo/mark-mono-ink.svg", markDoc({ id: "mi", variant: "mono", fill: L.hex("ink") }, "Devlingo (tinta)"));

// Favicon: versão pequena (traços grossos), em quadrado.
write("logo/favicon.svg", L.doc(472, 472, `<title>Devlingo</title><g transform="translate(-20 -22)">${L.mark({ id: "fv", small: true })}</g>`));

// Palavra sozinha.
function wordmarkDoc(theme) {
  const t = L.THEMES[theme];
  const wm = L.wordmark(black, 200, { devColor: t.dev, lingoColor: t.lingo });
  return L.doc(wm.width, wm.height, `<title>Devlingo</title><g transform="translate(${-wm.box.x1} ${-wm.box.y1})">${wm.svg}</g>`);
}
write("logo/wordmark.svg", wordmarkDoc("light"));
write("logo/wordmark-on-dark.svg", wordmarkDoc("dark"));

const hLight = L.logoHorizontal(black, "light", { id: "hl" });
const hDark = L.logoHorizontal(black, "dark", { id: "hd" });
const sLight = L.logoStacked(black, "light", { id: "sl" });
const sDark = L.logoStacked(black, "dark", { id: "sd" });
write("logo/logo-horizontal.svg", hLight.svg);
write("logo/logo-horizontal-on-dark.svg", hDark.svg);
write("logo/logo-stacked.svg", sLight.svg);
write("logo/logo-stacked-on-dark.svg", sDark.svg);

png(L.doc(512, 512, L.mark({ id: "p1" })), "png/mark-512.png", 512);
png(hLight.svg, "png/logo-horizontal-1200.png", 1200);
png(hDark.svg, "png/logo-horizontal-on-dark-1200.png", 1200);
png(sLight.svg, "png/logo-stacked-800.png", 800);
png(sDark.svg, "png/logo-stacked-on-dark-800.png", 800);

// Favicons e ícones de app.
const faviconSvg = fs.readFileSync(path.join(BRAND, "logo/favicon.svg"), "utf8");
png(faviconSvg, "png/favicon-32.png", 32);
png(faviconSvg, "png/favicon-192.png", 192);

// ------------------------------------------------------------------ ícones
for (const name of Object.keys(L.ICONS)) write(`icons/${name}.svg`, L.iconSvg(name));

// ------------------------------------------------------------------ avatar (Discord recorta em círculo)
function avatarSvg() {
  const S = 1024;
  const markH = 700;
  const markW = L.MARK.w * (markH / L.MARK.h);
  return L.doc(
    S,
    S,
    `<title>Avatar do Devlingo</title>
  <defs>
    <linearGradient id="av-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E2090"/><stop offset="1" stop-color="${L.hex("midnight")}"/></linearGradient>
    <radialGradient id="av-glow" cx="0.5" cy="0.56" r="0.5"><stop offset="0" stop-color="${L.hex("violet")}" stop-opacity=".5"/><stop offset="1" stop-color="${L.hex("violet")}" stop-opacity="0"/></radialGradient>
    <radialGradient id="av-mint" cx="0.9" cy="0.95" r="0.5"><stop offset="0" stop-color="${L.hex("mint")}" stop-opacity=".16"/><stop offset="1" stop-color="${L.hex("mint")}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#av-bg)"/>
  <rect width="${S}" height="${S}" fill="url(#av-glow)"/>
  <rect width="${S}" height="${S}" fill="url(#av-mint)"/>
  ${L.placeMark(L.mark({ id: "av" }), (S - markW) / 2, (S - markH) / 2, markH)}`
  );
}
const avatar = avatarSvg();
write("discord/avatar.svg", avatar);
png(avatar, "discord/avatar-1024.png", 1024);
png(avatar, "discord/avatar-512.png", 512);
png(avatar, "png/apple-touch-icon-180.png", 180);

// ------------------------------------------------------------------ banner e imagem social
let uid = 0;
function pill(x, y, icon, label, { size = 28, tilt = 0 } = {}) {
  const t = L.textPath(extra, label, 0, 0, size);
  const iconSize = 46;
  const padL = 18;
  const gap = 14;
  const padR = 30;
  const h = 74;
  const w = padL + iconSize + gap + t.width + padR;
  const id = `pl${uid++}`;
  const svg = `<g transform="translate(${x} ${y}) rotate(${tilt})">
    <rect width="${L.round(w)}" height="${h}" rx="${h / 2}" fill="#fff" fill-opacity=".08" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
    <g transform="translate(${padL} ${(h - iconSize) / 2}) scale(${iconSize / 64})">${L.ICONS[icon](id)}</g>
    <path transform="translate(${padL + iconSize + gap} ${h / 2 + size * 0.35})" d="${t.d}" fill="#fff"/>
  </g>`;
  return { svg, w, h };
}

const TAGLINE = "aprenda programação jogando";
function background(w, h, id) {
  return `<defs>
    <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L.hex("midnight")}"/><stop offset="1" stop-color="#34219A"/></linearGradient>
    <radialGradient id="${id}-g1" cx="0.85" cy="0.1" r="0.6"><stop offset="0" stop-color="${L.hex("violet")}" stop-opacity=".55"/><stop offset="1" stop-color="${L.hex("violet")}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-g2" cx="0.05" cy="1" r="0.5"><stop offset="0" stop-color="${L.hex("mint")}" stop-opacity=".16"/><stop offset="1" stop-color="${L.hex("mint")}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id}-bg)"/><rect width="${w}" height="${h}" fill="url(#${id}-g1)"/><rect width="${w}" height="${h}" fill="url(#${id}-g2)"/>`;
}

// Símbolo grande e apagado ao fundo, como marca d'água.
function watermark(x, y, h, rot, opacity) {
  const s = h / 512;
  return `<g opacity="${opacity}" transform="translate(${x} ${y}) rotate(${rot}) scale(${L.round(s * 1000) / 1000}) translate(-256 -256)">${L.mark({ id: "wm" + uid++, variant: "mono", fill: "#FFFFFF" })}</g>`;
}

function banner() {
  const W = 1360;
  const H = 480;
  const logo = L.logoHorizontal(black, "dark", { id: "bn" });
  const lh = 170;
  const ls = lh / logo.height;
  const lw = logo.width * ls;
  const tag = L.textPath(bold, TAGLINE, 0, 0, 40);
  const blockH = lh + 44 + 30;
  const top = (H - blockH) / 2;

  const pills = [
    pill(840, 52, "flame", "7 dias seguidos", { tilt: -2 }),
    pill(900, 142, "target", "Meta do dia cumprida", { tilt: 1.5 }),
    pill(850, 232, "bolt", "Combo ×5", { tilt: -1.5 }),
    pill(930, 322, "medal", "Nova conquista", { tilt: 2 }),
  ];
  return L.doc(
    W,
    H,
    `<title>Devlingo: ${TAGLINE}</title>
  ${background(W, H, "bn")}
  ${watermark(1190, 330, 620, 12, 0.045)}
  <g transform="translate(90 ${L.round(top)}) scale(${L.round(ls * 1000) / 1000})">${logo.svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")}</g>
  <path transform="translate(94 ${L.round(top + lh + 44 + 28)})" d="${tag.d}" fill="#CFC9F5"/>
  ${pills.map((p) => p.svg).join("\n  ")}`
  );
}

function social() {
  const W = 1200;
  const H = 630;
  const logo = L.logoHorizontal(black, "dark", { id: "og" });
  const lh = 210;
  const ls = lh / logo.height;
  const tag = L.textPath(bold, TAGLINE, 0, 0, 48);
  const items = [
    ["flame", "Sequência diária"],
    ["target", "Metas e combos"],
    ["medal", "Conquistas"],
  ];
  let x = 80;
  const row = items.map(([icon, label]) => {
    const p = pill(x, 440, icon, label, { size: 26 });
    x += p.w + 18;
    return p;
  });
  return L.doc(
    W,
    H,
    `<title>Devlingo: ${TAGLINE}</title>
  ${background(W, H, "og")}
  ${watermark(1010, 200, 760, 12, 0.07)}
  <g transform="translate(80 100) scale(${L.round(ls * 1000) / 1000})">${logo.svg.replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")}</g>
  <path transform="translate(84 ${100 + lh + 74})" d="${tag.d}" fill="#CFC9F5"/>
  ${row.map((p) => p.svg).join("\n  ")}`
  );
}
const bannerSvg = banner();
const socialSvg = social();
write("discord/banner.svg", bannerSvg);
png(bannerSvg, "discord/banner-1360x480.png", 1360);
write("social/og-image.svg", socialSvg);
png(socialSvg, "social/og-image-1200x630.png", 1200);

// ------------------------------------------------------------------ tokens para o futuro site
const PAIRS = [
  ["#FFFFFF", "violet", "Texto branco sobre botão violeta"],
  ["#FFFFFF", "violetDeep", "Texto branco sobre violeta profundo"],
  ["ink", "cloud", "Texto principal sobre fundo claro"],
  ["mist", "cloud", "Texto secundário sobre fundo claro"],
  ["violet", "cloud", "Link violeta sobre fundo claro"],
  ["#FFFFFF", "midnight", "Texto branco sobre fundo escuro"],
  ["violetLight", "midnight", "Violeta claro sobre fundo escuro"],
  ["mint", "midnight", "Menta sobre fundo escuro"],
  ["spark", "midnight", "Faísca sobre fundo escuro"],
  ["ink", "mint", "Texto tinta sobre menta"],
  ["ink", "spark", "Texto tinta sobre faísca"],
  ["ink", "coral", "Texto tinta sobre coral"],
  ["#FFFFFF", "coral", "Texto branco sobre coral (NÃO use)"],
  ["#FFFFFF", "mint", "Texto branco sobre menta (NÃO use)"],
];
const colorOf = (k) => (k.startsWith("#") ? k : L.hex(k));
const contrastRows = PAIRS.map(([fg, bg, label]) => {
  const ratio = Math.round(L.contrast(colorOf(fg), colorOf(bg)) * 100) / 100;
  return { fg: colorOf(fg), bg: colorOf(bg), label, ratio, aa: ratio >= 4.5, aaLarge: ratio >= 3 };
});

const colors = {};
for (const [key, c] of Object.entries(L.COLORS)) {
  colors[key] = { hex: c.hex, rgb: L.rgb(c.hex), discordInt: parseInt(c.hex.slice(1), 16), name: c.name, role: c.role };
}
write(
  "tokens/colors.json",
  JSON.stringify(
    {
      $description: "Cores do Devlingo. Gerado por brand/tools/build.js; não edite à mão.",
      colors,
      gradients: { brand: ["#8E75FF", "#5233E6"], spark: ["#FFD978", L.hex("spark")], flame: [L.hex("spark"), L.hex("flame")] },
      contrast: contrastRows,
    },
    null,
    2
  ) + "\n"
);

const cssVars = Object.entries(L.COLORS).map(([k, c]) => `  --dl-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${c.hex};`).join("\n");
write(
  "tokens/tokens.css",
  `/* Tokens do Devlingo. Gerado por brand/tools/build.js; não edite à mão.
   Use os tokens semânticos (--dl-bg, --dl-text, --dl-primary...) nas telas: eles trocam sozinhos
   entre claro e escuro. As cores "cruas" (--dl-violet etc.) são a paleta da marca. */

:root {
  /* Paleta */
${cssVars}

  /* Degradês */
  --dl-gradient-brand: linear-gradient(135deg, #8e75ff, #5233e6);
  --dl-gradient-spark: linear-gradient(135deg, #ffd978, ${L.hex("spark")});
  --dl-gradient-flame: linear-gradient(180deg, ${L.hex("spark")}, ${L.hex("flame")});

  /* Semânticos (tema claro) */
  --dl-bg: var(--dl-cloud);
  --dl-surface: #ffffff;
  --dl-surface-soft: var(--dl-violet-tint);
  --dl-border: #e1dcf7;
  --dl-text: var(--dl-ink);
  --dl-text-muted: var(--dl-mist);
  --dl-primary: var(--dl-violet);
  --dl-primary-hover: var(--dl-violet-deep);
  --dl-on-primary: #ffffff;
  --dl-link: var(--dl-violet);
  --dl-success: var(--dl-mint);
  --dl-on-success: var(--dl-ink);
  --dl-warning: var(--dl-spark);
  --dl-on-warning: var(--dl-ink);
  --dl-danger: var(--dl-coral);
  --dl-on-danger: var(--dl-ink);

  /* Tipografia */
  --dl-font-sans: "Nunito", ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", sans-serif;
  --dl-font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;

  /* Forma e espaço */
  --dl-radius-sm: 10px;
  --dl-radius-md: 16px;
  --dl-radius-lg: 24px;
  --dl-radius-pill: 999px;
  --dl-space: 8px; /* múltiplos de 8 */
  --dl-shadow: 0 10px 30px rgba(74, 47, 214, 0.18);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --dl-bg: var(--dl-midnight);
    --dl-surface: #211a55;
    --dl-surface-soft: #2b2270;
    --dl-border: #3a3085;
    --dl-text: #f4f2ff;
    --dl-text-muted: #b9b3dd;
    --dl-link: var(--dl-violet-light);
    --dl-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  }
}

:root[data-theme="dark"] {
  --dl-bg: var(--dl-midnight);
  --dl-surface: #211a55;
  --dl-surface-soft: #2b2270;
  --dl-border: #3a3085;
  --dl-text: #f4f2ff;
  --dl-text-muted: #b9b3dd;
  --dl-link: var(--dl-violet-light);
  --dl-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}
`
);

console.log("Identidade visual gerada em brand/");
console.table(contrastRows.map((r) => ({ par: r.label, razão: r.ratio, AA: r.aa ? "sim" : "não" })));
