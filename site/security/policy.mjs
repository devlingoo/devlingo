// Política de segurança do site: a ÚNICA fonte da verdade.
// Dela saem a meta tag de CSP (layout), o arquivo `public/_headers` (Cloudflare Pages e Netlify) e o `vercel.json`.
// `scripts/sync.mjs` gera os arquivos e `scripts/audit-dist.mjs` falha se algum deles divergir daqui.
//
// A política é FIXA (sem hashes, sem nonces) porque o site não tem nenhum script ou estilo inline:
// tudo vem de arquivos do próprio domínio. Qualquer coisa injetada por um ataque (XSS) é bloqueada.

// Diretivas de CSP. Valor [] = diretiva sem valor (por exemplo, upgrade-insecure-requests).
export const CSP = {
  "default-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'"],
  "img-src": ["'self'"],
  "font-src": ["'self'"],
  "connect-src": ["'none'"],
  "manifest-src": ["'self'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "object-src": ["'none'"],
  "frame-src": ["'none'"],
  "worker-src": ["'none'"],
  // Sem nenhum "sink" perigoso (innerHTML, eval, script.src = ...): o navegador recusa qualquer um que alguém tente usar.
  "require-trusted-types-for": ["'script'"],
  "trusted-types": ["'none'"],
  "upgrade-insecure-requests": [],
  // Só vale como cabeçalho HTTP (o navegador ignora em <meta>): ninguém consegue embutir o site em outro (clickjacking).
  "frame-ancestors": ["'none'"],
};

// O que NÃO pode ir em <meta http-equiv="Content-Security-Policy"> (o navegador ignora e avisa no console).
const HEADER_ONLY = new Set(["frame-ancestors"]);

const serialize = (entries) => entries.map(([name, values]) => [name, ...values].join(" ")).join("; ");

export const cspHeader = () => serialize(Object.entries(CSP));
export const cspMeta = () => serialize(Object.entries(CSP).filter(([name]) => !HEADER_ONLY.has(name)));

// Cabeçalhos de segurança de toda resposta.
export const SECURITY_HEADERS = [
  ["Content-Security-Policy", cspHeader()],
  // Dois anos de HTTPS obrigatório (sem "preload": isso é difícil de desfazer e só vale para um domínio próprio).
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  // Redundante com frame-ancestors, mas protege navegadores antigos.
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "no-referrer"],
  ["Permissions-Policy", "accelerometer=(), autoplay=(), bluetooth=(), browsing-topics=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), serial=(), usb=()"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
];

// Cache: arquivos com hash no nome duram um ano. As páginas ficam no padrão dos hospedeiros (sempre revalidam); declarar um
// Cache-Control também em "/*" faria os valores se somarem nas duas regras, o que contradiz.
export const CACHE_RULES = [
  { pattern: "/_astro/*", value: "public, max-age=31536000, immutable" },
  { pattern: "/fonts/*", value: "public, max-age=31536000, immutable" },
];

// ---------- formatos ----------

// `_headers` (Cloudflare Pages e Netlify).
export function headersFile() {
  const block = (pattern, pairs) => `${pattern}\n${pairs.map(([k, v]) => `  ${k}: ${v}`).join("\n")}\n`;
  return [
    "# GERADO por scripts/sync.mjs a partir de security/policy.mjs. Não edite à mão.",
    block("/*", SECURITY_HEADERS),
    ...CACHE_RULES.map((rule) => block(rule.pattern, [["Cache-Control", rule.value]])),
  ].join("\n");
}

// `vercel.json`.
export function vercelConfig() {
  const toList = (pairs) => pairs.map(([key, value]) => ({ key, value }));
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    cleanUrls: true,
    trailingSlash: false,
    headers: [
      { source: "/(.*)", headers: toList(SECURITY_HEADERS) },
      ...CACHE_RULES.map((rule) => ({ source: rule.pattern.replace("/*", "/(.*)"), headers: toList([["Cache-Control", rule.value]]) })),
    ],
  };
}

// Domínios para onde o site pode apontar links (a auditoria recusa qualquer outro).
export const ALLOWED_LINK_HOSTS = ["github.com", "discord.com"];
