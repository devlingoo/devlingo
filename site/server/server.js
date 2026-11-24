// Ponto de entrada do site na Discloud. Este arquivo só roda DENTRO do pacote que `npm run package:discloud` monta
// (lá, `policy.mjs`, `serve.mjs` e a pasta `www/` ficam ao lado dele); na pasta do projeto ele não funciona.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { buildIndex, createHandler } from "./serve.mjs";
import { SECURITY_HEADERS, CACHE_RULES } from "./policy.mjs";

// A Discloud exige a porta 8080 e o endereço 0.0.0.0 (HOST e PORT existem só para os testes).
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";

const index = buildIndex(fileURLToPath(new URL("./www/", import.meta.url)));
if (!index.has("/") || !index.has("/404.html")) {
  throw new Error("A pasta www/ não tem index.html e 404.html: o pacote está incompleto.");
}

const server = createServer(createHandler({ index, headers: SECURITY_HEADERS, cacheRules: CACHE_RULES }));
// Limites contra conexões que ficam penduradas (o proxy da hospedagem fica na frente, mas não custa).
server.headersTimeout = 10_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 65_000;

server.listen(PORT, HOST, () => console.log(`[site] no ar em ${HOST}:${PORT} (${index.size} endereços, Node ${process.version})`));

// Encerra com calma (reinício ou deploy na Discloud).
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
