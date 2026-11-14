// Prepara o que o site precisa antes do build. Roda sozinho em `npm run dev` e `npm run build`.
//  1. copia da pasta brand/ o ícone, o ícone de celular e a imagem de compartilhamento (não duplica no git);
//  2. copia as fontes (só o subconjunto latino, que cobre o português) para public/fonts, com o hash no nome do arquivo,
//     e gera o CSS delas (src/styles/fonts.generated.css) e a lista (src/generated/fonts.json);
//  3. gera public/_headers e vercel.json a partir de security/policy.mjs;
//  4. gera public/.well-known/security.txt, com validade calculada agora (o RFC 9116 exige Expires de no máximo 1 ano).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { headersFile, vercelConfig } from "../security/policy.mjs";

const SITE = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(SITE, "..");
const PUBLIC = path.join(SITE, "public");
const write = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

// ---------- 1) marca ----------
const brand = [
  ["logo/favicon.svg", "favicon.svg"],
  ["png/apple-touch-icon-180.png", "apple-touch-icon.png"],
  ["social/og-image-1200x630.png", "og-image.png"],
];
for (const [from, to] of brand) {
  const source = path.join(REPO, "brand", from);
  if (!existsSync(source)) throw new Error(`arquivo da marca não existe: brand/${from}`);
  mkdirSync(PUBLIC, { recursive: true });
  cpSync(source, path.join(PUBLIC, to));
}

// ---------- 2) fontes ----------
// A variável tem peso 200 a 1000 (Nunito) e 100 a 800 (JetBrains Mono): um arquivo só cobre todos os pesos usados.
const FONTS = [
  { key: "sans", family: "Nunito", pkg: "nunito", file: "nunito-latin-wght-normal", weight: "200 1000", fallback: { family: "Nunito Fallback", local: "Arial", adjust: "size-adjust: 97.8015%; ascent-override: 103.3726%; descent-override: 36.0935%; line-gap-override: 0%;" } },
  { key: "mono", family: "JetBrains Mono", pkg: "jetbrains-mono", file: "jetbrains-mono-latin-wght-normal", weight: "100 800", fallback: { family: "JetBrains Mono Fallback", local: "Courier New", adjust: "size-adjust: 99.9837%; ascent-override: 102.0166%; descent-override: 30.0049%;" } },
];
const manifest = {};
let css = "/* GERADO por scripts/sync.mjs. Não edite à mão. */\n";
for (const font of FONTS) {
  const pkgDir = path.join(SITE, "node_modules", "@fontsource-variable", font.pkg);
  const woff2 = path.join(pkgDir, "files", `${font.file}.woff2`);
  if (!existsSync(woff2)) throw new Error(`fonte não encontrada (rode npm ci): ${woff2}`);
  const bytes = readFileSync(woff2);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 10);
  const name = `${font.pkg}-${hash}.woff2`;
  mkdirSync(path.join(PUBLIC, "fonts"), { recursive: true });
  writeFileSync(path.join(PUBLIC, "fonts", name), bytes);
  cpSync(path.join(pkgDir, "LICENSE"), path.join(PUBLIC, "fonts", `LICENSE-${font.pkg}.txt`)); // OFL-1.1
  // o intervalo de caracteres vem do CSS oficial do pacote, para a fonte só baixar quando precisar
  const original = readFileSync(path.join(pkgDir, "wght.css"), "utf-8");
  const block = original.split(/\/\*\s*/).find((part) => part.startsWith(`${font.file} */`));
  const range = block?.match(/unicode-range:\s*([^;]+);/)?.[1];
  if (!range) throw new Error(`não achei o unicode-range de ${font.file}`);
  manifest[font.key] = `/fonts/${name}`;
  css += `
@font-face {
  font-family: "${font.family}";
  font-style: normal;
  font-display: swap;
  font-weight: ${font.weight};
  src: url("/fonts/${name}") format("woff2");
  unicode-range: ${range};
}
@font-face {
  font-family: "${font.fallback.family}";
  src: local("${font.fallback.local}");
  font-display: swap;
  ${font.fallback.adjust}
}
`;
}
write(path.join(SITE, "src", "styles", "fonts.generated.css"), css);
write(path.join(SITE, "src", "generated", "fonts.json"), JSON.stringify(manifest, null, 2) + "\n");

// ---------- 3) cabeçalhos ----------
write(path.join(PUBLIC, "_headers"), headersFile());
write(path.join(SITE, "vercel.json"), JSON.stringify(vercelConfig(), null, 2) + "\n");

// ---------- 4) security.txt ----------
const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
write(
  path.join(PUBLIC, ".well-known", "security.txt"),
  [
    "Contact: https://github.com/devlingoo/devlingo/security/advisories/new",
    `Expires: ${expires}`,
    "Preferred-Languages: pt-BR, en",
    "Policy: https://github.com/devlingoo/devlingo/blob/main/SECURITY.md",
    "",
  ].join("\n"),
);

console.log("sync ok: marca, fontes, cabeçalhos e security.txt");
