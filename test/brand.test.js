const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const config = require("../src/config");

const BRAND = path.join(__dirname, "..", "brand");
const tokens = JSON.parse(fs.readFileSync(path.join(BRAND, "tokens", "colors.json"), "utf8"));

// Largura e altura de um PNG, lidas do cabeçalho.
function pngSize(rel) {
  const buf = fs.readFileSync(path.join(BRAND, rel));
  assert.equal(buf.toString("ascii", 1, 4), "PNG", `${rel} não é PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test("as cores das mensagens do bot são as da marca (brand/tokens/colors.json)", () => {
  const pairs = { brand: "violet", success: "mint", danger: "coral", muted: "mist", gold: "spark" };
  for (const [botColor, brandColor] of Object.entries(pairs)) {
    assert.equal(
      config.colors[botColor],
      tokens.colors[brandColor].discordInt,
      `config.colors.${botColor} deveria ser ${tokens.colors[brandColor].hex} (${brandColor})`
    );
  }
});

test("os arquivos da marca que o Discord e o site usam existem, com as dimensões certas", () => {
  assert.deepEqual(pngSize("discord/avatar-1024.png"), { w: 1024, h: 1024 });
  assert.deepEqual(pngSize("discord/avatar-512.png"), { w: 512, h: 512 });
  assert.deepEqual(pngSize("social/og-image-1200x630.png"), { w: 1200, h: 630 });
  assert.deepEqual(pngSize("png/favicon-32.png"), { w: 32, h: 32 });
  assert.deepEqual(pngSize("png/apple-touch-icon-180.png"), { w: 180, h: 180 });

  // O banner de bots do Discord é 680x240 (17:6); o nosso é o dobro disso.
  const banner = pngSize("discord/banner-1360x480.png");
  assert.equal(banner.w / banner.h, 680 / 240);
  assert.ok(banner.w >= 680 && banner.h >= 240);
});

test("todo SVG da marca é um SVG válido, com título e sem texto dependente de fonte instalada", () => {
  const dirs = ["logo", "icons", "discord", "social"];
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(BRAND, d)).filter((f) => f.endsWith(".svg")).map((f) => path.join(d, f)));
  assert.ok(files.length >= 15, `só ${files.length} SVGs`);
  for (const rel of files) {
    const svg = fs.readFileSync(path.join(BRAND, rel), "utf8");
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/, `${rel}: cabeçalho`);
    assert.match(svg, /<title>[^<]+<\/title>/, `${rel}: sem <title> (acessibilidade)`);
    assert.doesNotMatch(svg, /<text[\s>]/, `${rel}: usa <text>; o texto da marca vira curva para não depender de fonte`);
    assert.doesNotMatch(svg, /<script|onload=|href="http/i, `${rel}: conteúdo ativo ou link externo`);
  }
});

test("os tokens CSS e o JSON trazem as mesmas cores", () => {
  const css = fs.readFileSync(path.join(BRAND, "tokens", "tokens.css"), "utf8");
  for (const [key, color] of Object.entries(tokens.colors)) {
    const name = `--dl-${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;
    assert.ok(css.includes(`${name}: ${color.hex};`), `${name} deveria ser ${color.hex} em tokens.css`);
  }
});

test("os pares de cor recomendados passam no contraste AA e os proibidos estão marcados", () => {
  const forbidden = tokens.contrast.filter((c) => c.label.includes("NÃO use"));
  assert.ok(forbidden.length >= 2);
  assert.ok(forbidden.every((c) => !c.aa), "os pares proibidos deveriam reprovar no AA");
  for (const c of tokens.contrast.filter((c) => !c.label.includes("NÃO use"))) {
    assert.ok(c.aa, `${c.label} (${c.ratio}:1) deveria passar no AA`);
  }
});
