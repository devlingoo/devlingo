import { defineConfig } from "astro/config";

// Site 100% estático: não existe servidor, banco de dados nem rota que aceite entrada. O que vai ao ar é só HTML, CSS, JS
// e fontes, tudo do próprio domínio (veja security/policy.mjs para o que isso permite na política de segurança).
// SITE_URL (opcional) é o endereço público, usado nas tags de compartilhamento; sem ele, a página só não declara o endereço.
export default defineConfig({
  output: "static",
  site: process.env.SITE_URL || undefined,
  trailingSlash: "never",
  compressHTML: true,
  devToolbar: { enabled: false },
  prefetch: false,
  build: {
    // Nada inline: a política de CSP não libera script nem estilo inline.
    inlineStylesheets: "never",
  },
  vite: {
    build: {
      assetsInlineLimit: 0, // nenhum arquivo vira data: URI (a CSP também não libera)
      sourcemap: false,
    },
  },
});
