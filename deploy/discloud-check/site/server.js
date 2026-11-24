// Teste DESCARTÁVEL de site na Discloud. Serve uma página mínima com cabeçalhos de segurança que o PRÓPRIO app
// define, para você ver (com curl) quais deles chegam ao navegador depois do proxy da Discloud.
const http = require("http");

const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Devlingo-Teste": "cabecalho-proprio-chegou",
};

// Só estes cabeçalhos da requisição são mostrados em /__headers (nada de cookie, IP ou autorização).
const SHOW = ["host", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port", "forwarded", "via"];

const server = http.createServer((req, res) => {
  if (req.url === "/__headers") {
    const seen = Object.fromEntries(SHOW.filter((name) => req.headers[name]).map((name) => [name, req.headers[name]]));
    res.writeHead(200, { ...HEADERS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ node: process.version, visto_pelo_app: seen }, null, 2));
  }
  res.writeHead(200, { ...HEADERS, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end("<!doctype html><meta charset=utf-8><title>Teste</title><p>Teste de cabeçalhos do Devlingo.</p>");
});

// A Discloud exige a porta 8080 e o endereço 0.0.0.0.
server.listen(8080, "0.0.0.0", () => console.log(`[site-check] no ar em 0.0.0.0:8080 com Node ${process.version}`));
