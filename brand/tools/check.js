"use strict";
// Folha de conferência (só para olhar): favicons e versões de uma cor, em fundo claro e escuro.
// Uso: node check.js <pasta-de-saída>
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const BRAND = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(BRAND, rel), "utf8");
const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });

function sheet(bg) {
  let x = 20;
  let items = "";
  const put = (file, size, vb) => {
    items += `<g transform="translate(${x} 20) scale(${size / vb})">${inner(read(file))}</g>`;
    x += size + 24;
  };
  [16, 24, 32, 48].forEach((s) => put("logo/favicon.svg", s, 472));
  [64, 110].forEach((s) => put("logo/mark-mono-white.svg", s, 512));
  [64, 110].forEach((s) => put("logo/mark-mono-ink.svg", s, 512));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 150" width="${x}" height="150"><rect width="${x}" height="150" fill="${bg}"/>${items}</svg>`;
}
for (const [name, bg] of [["claro", "#FFFFFF"], ["escuro", "#17123A"], ["violeta", "#6C4DFF"]]) {
  const svg = sheet(bg);
  const w = Number(/width="(\d+)"/.exec(svg)[1]);
  fs.writeFileSync(path.join(out, `check-${name}.png`), new Resvg(svg, { fitTo: { mode: "width", value: w * 2 } }).render().asPng());
}
console.log("ok");
