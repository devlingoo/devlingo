// Regenera src/assets/exemplo-certificado.png com o MESMO renderizador que o bot usa (src/utils/certificate.js).
// Precisa das dependências da raiz do repositório (rode `npm install` lá antes). O PNG fica versionado no git, então o build
// do site não depende disso; rode este script só quando o visual do certificado mudar.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..", "..");
const require = createRequire(path.join(REPO, "package.json"));
const { certificateSvg } = require("./src/utils/certificate.js");
const { Resvg } = require("@resvg/resvg-js");

// Pessoa e código de EXEMPLO (o código é o que o README usa como exemplo): nada aqui é um certificado de verdade.
const svg = certificateSvg({
  name: "Ana Beatriz Almeida",
  courseName: "TypeScript na prática",
  levelId: "advanced",
  levelLabel: "Avançado",
  modules: ["TypeScript"],
  issuedAt: new Date("2026-11-12T12:00:00Z"),
  code: "DVL-7K3M-9QXA",
});
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1100 } }).render().asPng();
const out = path.join(import.meta.dirname, "..", "src", "assets", "exemplo-certificado.png");
writeFileSync(out, png);
console.log(`certificado de exemplo gerado: ${(png.length / 1024).toFixed(0)} KB`);
