// SVGs da marca (brand/ na raiz do repositório), embutidos no HTML na hora do build. São arquivos do próprio repositório.
import { readFileSync } from "node:fs";
import path from "node:path";

const BRAND_DIR = path.resolve(process.cwd(), "..", "brand");

// Lê um SVG da marca e prefixa os ids internos, para duas cópias na mesma página não se atrapalharem
// (um gradiente definido num SVG escondido não renderiza no outro).
export function inlineSvg(file: string, prefix: string, attrs = ""): string {
  let svg = readFileSync(path.join(BRAND_DIR, file), "utf-8").trim();
  svg = svg
    .replace(/id="([^"]+)"/g, (_m, id: string) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}-${id})`)
    .replace(/href="#([^"]+)"/g, (_m, id: string) => `href="#${prefix}-${id}"`)
    .replace(/<title>[^<]*<\/title>/, "")
    .replace(/ width="[\d.]+" height="[\d.]+"/, "");
  return svg.replace("<svg ", `<svg ${attrs} `);
}
