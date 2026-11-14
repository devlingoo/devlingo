# Site do Devlingo

Página de apresentação do bot: demo interativo com perguntas reais, assuntos, cursos, certificado de exemplo e o que é o hábito. É um site **100% estático**: não tem servidor, banco de dados nem rota que aceite entrada de ninguém. O que vai ao ar é só HTML, CSS, um pouco de JavaScript e fontes, tudo do próprio domínio.

## Stack

- **[Astro](https://astro.build) 7** com **TypeScript estrito** (`astro check` roda em todo build). Sem framework de interface: todo o JavaScript da página (demo e tema) tem ~4 KB.
- **CSS moderno**, escrito à mão sobre os tokens do guia de marca (`brand/`): `@layer`, `light-dark()` para os temas, aninhamento e `clamp()`.
- **Fontes próprias**: Nunito e JetBrains Mono (licença OFL), servidas do próprio site. Nenhuma chamada ao Google Fonts, o que também evita vazar o IP de quem visita.
- **Dados do próprio bot**: os números, os assuntos, os cursos e as perguntas do demo são lidos de `src/data/*.json` na hora do build. Se o bot ganha um assunto, o site muda sozinho; não há nada escrito à mão.

## Como rodar

Precisa de Node.js 22.23.4 ou mais novo (o `engine-strict` do `.npmrc` recusa um mais velho).

```bash
cd site
npm ci               # instala as versões exatas do package-lock.json
npm run dev          # servidor local (http://localhost:4321)
npm run build        # confere os tipos e gera dist/
npm run verify       # build + auditoria de segurança + auto-teste do auditor + teste de navegador
```

| Script | O que faz |
| --- | --- |
| `sync` | Copia da marca o ícone e a imagem de compartilhamento, copia as fontes, gera `public/_headers`, `vercel.json` e `security.txt`. O `dev` e o `build` já rodam. |
| `check` | Conferência de tipos (TypeScript estrito). |
| `build` | `sync`, `check` e a geração do site em `dist/`. |
| `audit:dist` | Auditoria de segurança do que o build gerou (veja abaixo). |
| `audit:selftest` | Injeta 20 problemas de propósito numa cópia do `dist/` e confere que a auditoria reprova cada um. |
| `e2e` | Teste de navegador (Chrome ou Edge de verdade): o site funciona sem violar a própria política, e a política bloqueia ataques simulados. |
| `certificado` | Regenera `src/assets/exemplo-certificado.png` com o renderizador do bot. Só quando o visual do certificado mudar. |

## Como o site se protege

Como não existe servidor, o que sobra para proteger é o que o navegador de quem visita executa, e a cadeia de suprimentos do que foi usado para gerar o site.

**1. Política de segurança de conteúdo (CSP) fixa e estrita** (`security/policy.mjs`, a única fonte da verdade):

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types 'none';
upgrade-insecure-requests
```

O site não tem **nenhum** script ou estilo inline (por isso não precisa de `'unsafe-inline'`, de hashes nem de nonces): a política é fixa e nada injetado por um ataque consegue rodar. Ele também não fala com ninguém além do próprio domínio (`connect-src 'none'`), e o código não usa `innerHTML` nem `eval`, então o **Trusted Types** pode ficar ligado. Qualquer tentativa de injeção é barrada por duas camadas independentes: o Trusted Types e, sozinho, o `script-src`.

**2. Cabeçalhos HTTP**: HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (junto com `frame-ancestors 'none'`, impede embutir o site em outro), `Referrer-Policy: no-referrer`, `Permissions-Policy` desligando câmera, microfone, localização e outros, `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy: same-origin`. Arquivos com hash no nome têm cache de um ano (`immutable`); as páginas sempre revalidam.

**3. Auditoria do resultado** (`scripts/audit-dist.mjs`, ~4000 verificações): recusa script ou estilo inline, atributos de evento (`onclick`...), `iframe`, `form`, `object`, `base`, URLs `javascript:`, recursos de outro domínio, links para domínios que não estão na lista permitida (só `github.com` e `discord.com`), `target="_blank"` sem `rel="noopener noreferrer"`, `eval`, `new Function`, `document.write`, `innerHTML`, chamadas de rede, `@import` externo, sourcemaps e arquivos de configuração no pacote, e confere que a CSP da página, o `_headers` e o `vercel.json` são exatamente os da política. O auto-teste (`audit:selftest`) garante que o auditor não está quebrado.

**4. Cadeia de suprimentos**: versões exatas e `package-lock.json` (`npm ci`); `ignore-scripts=true` no `.npmrc` (nenhum pacote roda código na instalação); `npm audit` no CI; Dependabot semanal com 7 dias de espera para versões recém-publicadas; actions do CI fixadas por SHA, com `permissions: contents: read` e `persist-credentials: false`.

**O que isto não cobre** (e o que fazer):

- **A conta do hospedeiro e o domínio.** Quem controla a conta onde o site fica, ou o DNS do domínio, controla o site. Use autenticação em dois fatores (de preferência com chave de segurança) no GitHub, no hospedeiro e no registrador do domínio.
- **O bot**, que é outro assunto: o token do Discord nunca vai para o repositório, e a varredura de segredos do GitHub deve ficar ligada (veja `SECURITY.md`).
- **Uma falha nova no navegador ou no Astro.** O Dependabot e o `npm audit` avisam, mas alguém precisa atualizar.

## Publicar

O site precisa de um hospedeiro que aplique cabeçalhos HTTP. A pasta `site/` é a raiz do projeto (comando de build `npm run build`, saída `dist`). Variáveis de ambiente (todas opcionais):

| Variável | Para quê |
| --- | --- |
| `SITE_URL` | Endereço público (`https://...`). Habilita `canonical`, `og:url` e a imagem de compartilhamento. |
| `PUBLIC_INVITE_URL` | Link de convite do bot. Sem ele, o botão principal vira "Ver o código no GitHub" e a página avisa que o convite ainda não está aberto. Só é aceito o formato oficial `https://discord.com/oauth2/authorize?client_id=...`. |

Para montar o convite: no [Developer Portal](https://discord.com/developers/applications), OAuth2, URL Generator, escopo `bot`, e as permissões do README (Ver canais, Enviar mensagens, Ler o histórico e Adicionar reações). Isso dá `https://discord.com/oauth2/authorize?client_id=SEU_ID&scope=bot&permissions=68672`.

| Hospedeiro | Cabeçalhos |
| --- | --- |
| **Vercel** | Lê o `vercel.json` desta pasta. Defina "Root Directory" como `site`. |
| **Cloudflare Pages** | Lê o `public/_headers` (que vai para `dist/_headers`). |
| **Netlify** | Lê o `public/_headers`. |
| **GitHub Pages** | **Não aceita cabeçalhos personalizados.** Só valem as `<meta>` da página (a CSP funciona, mas `frame-ancestors`, HSTS próprio e os cabeçalhos `Cross-Origin-*` ficam de fora, e o site poderia ser embutido em outro). Dá para usar, com essa perda. |

`public/_headers` e `vercel.json` são **gerados** de `security/policy.mjs` (`npm run sync`) e ficam no git de propósito, porque o hospedeiro lê esses arquivos. Para mudar a política, edite só `security/policy.mjs`, rode `npm run sync` e faça o commit dos dois arquivos; o CI reprova se ficarem diferentes.

## Estrutura

```
site/
  security/policy.mjs       a política (CSP e cabeçalhos): única fonte da verdade
  scripts/                  sync, auditoria do dist/, auto-teste do auditor, teste de navegador, gerador do certificado
  public/                   robots.txt, theme-init.js e o _headers gerado
  src/
    assets/                 certificado de exemplo (gerado pelo renderizador do bot)
    components/             Header, Hero (com o demo) e as seções
    layouts/Base.astro      <head>: CSP em primeiro, metadados e a fonte
    lib/                    leitura dos dados do bot, SVGs da marca e configuração
    pages/                  index e 404
    scripts/                demo.ts e theme.ts (TypeScript, sem innerHTML)
    styles/global.css       CSS (e o das fontes, gerado)
```
