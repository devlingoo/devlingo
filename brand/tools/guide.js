"use strict";
// Gera brand/guide.html: o guia visual da marca (fontes embutidas; as imagens são as de brand/).
// Uso: npm run guide   (rode depois de npm run build)
const fs = require("fs");
const path = require("path");
const L = require("./lib");

const BRAND = path.join(__dirname, "..");
const FONT = path.join(__dirname, "node_modules", "@fontsource");
const b64 = (pkg, file) => fs.readFileSync(path.join(FONT, pkg, "files", file)).toString("base64");
const face = (family, weight, pkg, file) =>
  `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64(pkg, file)}) format("woff2")}`;

const fontCss = [
  ...[400, 600, 700, 800, 900].map((w) => face("Nunito", w, "nunito", `nunito-latin-${w}-normal.woff2`)),
  face("JetBrains Mono", 500, "jetbrains-mono", "jetbrains-mono-latin-500-normal.woff2"),
].join("\n");

const tokensCss = fs.readFileSync(path.join(BRAND, "tokens", "tokens.css"), "utf8");
const colorsJson = JSON.parse(fs.readFileSync(path.join(BRAND, "tokens", "colors.json"), "utf8"));
const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

// Texto legível sobre uma cor de fundo (tinta ou branco, o que tiver mais contraste).
const readable = (bg) => (L.contrast("#FFFFFF", bg) >= L.contrast(L.hex("ink"), bg) ? "#FFFFFF" : L.hex("ink"));

// ---- diagrama do espaço de proteção (u = diâmetro da faísca)
function clearSpace() {
  const h = L.logoHorizontal(L.fonts.black(), "light", { id: "cs" });
  const markScale = 240 / L.MARK.h;
  const u = 52 * markScale; // diâmetro da faísca no logotipo horizontal
  const pad = 2 * u;
  const W = h.width + pad * 2;
  const H = h.height + pad * 2;
  return `<svg viewBox="0 0 ${L.round(W)} ${L.round(H)}" role="img" aria-label="Espaço de proteção: duas vezes o diâmetro da faísca em todos os lados" class="diagram">
    <rect x="1" y="1" width="${L.round(W - 2)}" height="${L.round(H - 2)}" fill="none" stroke="${L.hex("violet")}" stroke-width="2" stroke-dasharray="8 8" rx="12"/>
    <rect x="${L.round(pad)}" y="${L.round(pad)}" width="${L.round(h.width)}" height="${L.round(h.height)}" fill="#FFFFFF" stroke="${L.hex("violet")}" stroke-opacity=".5" stroke-width="1.5"/>
    <g transform="translate(${L.round(pad)} ${L.round(pad)})">${inner(h.svg)}</g>
    <g fill="${L.hex("spark")}"><circle cx="${L.round(pad / 2)}" cy="${L.round(H / 2)}" r="${L.round(u / 2)}"/><circle cx="${L.round(W - pad / 2)}" cy="${L.round(H / 2)}" r="${L.round(u / 2)}"/><circle cx="${L.round(W / 2)}" cy="${L.round(pad / 2)}" r="${L.round(u / 2)}"/><circle cx="${L.round(W / 2)}" cy="${L.round(H - pad / 2)}" r="${L.round(u / 2)}"/></g>
  </svg>`;
}

const swatch = ([key, c]) => {
  const fg = readable(c.hex);
  return `<div class="swatch" style="background:${c.hex};color:${fg}">
      <strong>${c.name}</strong>
      <span class="mono">${c.hex}</span>
      <span class="mono">RGB ${c.rgb.join(", ")}</span>
      <span class="role">${c.role}</span>
      <span class="mono small">--dl-${key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}</span>
    </div>`;
};

const contrastRows = colorsJson.contrast
  .map(
    (r) => `<tr><td><span class="chip" style="background:${r.bg};color:${r.fg}">Aa</span></td><td>${r.label}</td><td class="mono">${r.ratio}:1</td><td>${
      r.aa ? "<span class='ok'>AA ✓</span>" : r.aaLarge ? "<span class='warn'>só texto grande</span>" : "<span class='no'>não usar</span>"
    }</td></tr>`
  )
  .join("\n");

const states = [
  ["brand", "Padrão", "Menus, ajuda, perfil"],
  ["mint", "Acerto", "Resposta correta"],
  ["coral", "Erro", "Resposta incorreta"],
  ["spark", "Comemoração", "Nível, meta, marcos, conquistas"],
  ["mist", "Expirado", "Desafio que expirou"],
].map(([k, t, d]) => {
  const hexv = k === "brand" ? L.hex("violet") : L.hex(k);
  return `<div class="msg" style="--bar:${hexv}"><b>${t}</b><span>${d}</span></div>`;
});

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Devlingo: guia de marca</title>
<meta name="description" content="Identidade visual do Devlingo: logotipo, cores, tipografia, ícones e tom de voz.">
<link rel="icon" href="logo/favicon.svg" type="image/svg+xml">
<style>
${fontCss}
${tokensCss}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--dl-bg);color:var(--dl-text);font:400 17px/1.6 var(--dl-font-sans);-webkit-font-smoothing:antialiased}
img,svg{max-width:100%;height:auto}
.mono{font-family:var(--dl-font-mono);font-weight:500}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
.hero{background:linear-gradient(135deg,#17123a,#34219a);color:#fff;padding:56px 0 48px}
.hero .wrap{display:flex;flex-direction:column;gap:20px}
.hero img.logo{width:min(560px,100%)}
.hero p{margin:0;font-size:clamp(20px,3.4vw,30px);font-weight:700;color:#cfc9f5}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
nav.toc a{color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18)}
nav.toc a:hover,nav.toc a:focus-visible{background:rgba(255,255,255,.2)}
section{padding:56px 0 8px}
h2{font-weight:900;font-size:clamp(28px,4.5vw,40px);line-height:1.15;margin:0 0 8px;letter-spacing:-.01em}
h2 .n{color:var(--dl-primary);margin-right:10px}
h3{font-weight:800;font-size:20px;margin:28px 0 8px}
.lead{font-size:19px;color:var(--dl-text-muted);max-width:720px;margin:0 0 24px}
p{margin:0 0 12px}
code{font-family:var(--dl-font-mono);font-weight:500;font-size:.88em;background:var(--dl-surface-soft);padding:2px 7px;border-radius:8px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.grid.sm{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.theme{position:absolute;top:16px;right:16px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.12);color:#fff;font:800 14px var(--dl-font-sans);padding:8px 14px;border-radius:999px;cursor:pointer}
.theme:hover,.theme:focus-visible{background:rgba(255,255,255,.24)}
.hero{position:relative}
.card{background:var(--dl-surface);border:1px solid var(--dl-border);border-radius:var(--dl-radius-lg);padding:24px}
.tile{border-radius:var(--dl-radius-lg);display:grid;place-items:center;padding:32px;min-height:200px;border:1px solid var(--dl-border)}
.tile img{max-height:150px;width:auto}
.tile.light{background:#fff}.tile.dark{background:var(--dl-midnight)}.tile.violet{background:var(--dl-violet)}
.cap{font-size:14px;color:var(--dl-text-muted);margin-top:8px}
.anatomy{display:grid;gap:24px;grid-template-columns:minmax(0,320px) 1fr;align-items:center}
@media(max-width:720px){.anatomy{grid-template-columns:1fr}}
.anatomy ol{margin:0;padding-left:22px}.anatomy li{margin-bottom:10px}
.diagram{width:100%;max-width:640px;display:block;margin:8px 0}
.swatches{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))}
.swatch{border-radius:var(--dl-radius-md);padding:18px;display:flex;flex-direction:column;gap:2px;min-height:170px;border:1px solid rgba(0,0,0,.08)}
.swatch strong{font-weight:900;font-size:19px}.swatch .role{font-size:14px;margin-top:6px;line-height:1.35;flex:1}.swatch .small{font-size:12px;opacity:.85}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--dl-border);vertical-align:middle}
.chip{display:inline-grid;place-items:center;width:44px;height:32px;border-radius:8px;font-weight:900;border:1px solid rgba(0,0,0,.08)}
.ok{color:#0b7a5c;font-weight:800}.warn{color:#b26b00;font-weight:800}.no{color:#c0243f;font-weight:800}
.table-scroll{overflow-x:auto;border:1px solid var(--dl-border);border-radius:var(--dl-radius-md);background:var(--dl-surface)}
.spec{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.big{font-size:84px;line-height:1;margin:0 0 8px}
.w900{font-weight:900}.w800{font-weight:800}.w700{font-weight:700}.w400{font-weight:400}
.icons{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(110px,1fr))}
.icon{background:var(--dl-surface);border:1px solid var(--dl-border);border-radius:var(--dl-radius-md);padding:16px;text-align:center}
.icon img{width:56px;height:56px}.icon b{display:block;margin-top:6px;font-size:14px}.icon span{font-size:13px;color:var(--dl-text-muted)}
.voice{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.say{border-radius:var(--dl-radius-md);padding:18px;border:1px solid var(--dl-border);background:var(--dl-surface)}
.say.yes{border-left:6px solid var(--dl-mint)}.say.no{border-left:6px solid var(--dl-coral)}
.say small{display:block;font-weight:800;margin-bottom:6px;color:var(--dl-text-muted)}
.msg{display:flex;flex-direction:column;gap:2px;background:var(--dl-surface);border:1px solid var(--dl-border);border-left:6px solid var(--bar);border-radius:10px;padding:14px 16px}
.msg span{font-size:14px;color:var(--dl-text-muted)}
.shots{display:grid;gap:16px;grid-template-columns:minmax(0,220px) 1fr}
@media(max-width:720px){.shots{grid-template-columns:1fr}}
.shots img{border-radius:var(--dl-radius-md);border:1px solid var(--dl-border);display:block}
.avatar{border-radius:50%!important;width:200px}
.dont{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))}
.dont figure{margin:0;position:relative}
.dont .box{border-radius:var(--dl-radius-md);background:#fff;border:2px solid var(--dl-coral);height:150px;display:grid;place-items:center;overflow:hidden}
.dont .box.v{background:var(--dl-violet)}
.dont img{height:84px;width:auto}
.dont figcaption{font-size:14px;margin-top:6px}.dont figcaption b{color:var(--dl-coral)}
.files{font-size:15px}.files td:first-child{font-family:var(--dl-font-mono);font-weight:500;white-space:nowrap}
pre{background:#17123a;color:#e9e5ff;border-radius:var(--dl-radius-md);padding:16px;overflow:auto;font:500 14px/1.6 var(--dl-font-mono)}
footer{padding:48px 0 64px;color:var(--dl-text-muted);font-size:15px}
a{color:var(--dl-link)}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style>
</head>
<body>
<header class="hero">
  <button class="theme" type="button" id="theme" aria-label="Alternar entre tema claro e escuro">Tema claro/escuro</button>
  <div class="wrap">
    <img class="logo" src="logo/logo-horizontal-on-dark.svg" alt="Devlingo">
    <p>Aprenda programação jogando.</p>
    <nav class="toc" aria-label="Seções">
      <a href="#ideia">Ideia</a><a href="#logo">Logotipo</a><a href="#cores">Cores</a><a href="#tipografia">Tipografia</a>
      <a href="#icones">Ícones</a><a href="#voz">Tom de voz</a><a href="#discord">No Discord</a><a href="#regras">Regras</a><a href="#arquivos">Arquivos</a>
    </nav>
  </div>
</header>

<main class="wrap">
<section id="ideia">
  <h2><span class="n">01</span>A ideia</h2>
  <p class="lead">Devlingo é <strong>Dev</strong> + <strong>Lingo</strong> (língua). O bot ensina programação como quem aprende um idioma: um pouquinho por dia, com perguntas curtas, metas, conquistas e uma sequência para manter.</p>
  <div class="card anatomy">
    <img src="logo/mark.svg" alt="Símbolo do Devlingo: balão de fala com rosto de colchetes" width="320" height="320">
    <ol>
      <li><strong>O balão de fala</strong> é o "lingo": aprender conversando, em português.</li>
      <li><strong>Os colchetes <code>&lt; &gt;</code></strong> são os olhos e o "dev": código, mas com cara amigável.</li>
      <li><strong>O sorriso menta</strong> é o acolhimento (e a cor do acerto): aqui errar não é problema.</li>
      <li><strong>A antena com faísca</strong> é o bot, e o âmbar é a cor do hábito: sequência, XP e conquistas. O pingo do "i" no logotipo é a mesma faísca.</li>
    </ol>
  </div>
</section>

<section id="logo">
  <h2><span class="n">02</span>Logotipo</h2>
  <p class="lead">Três formas: horizontal (a padrão), empilhada e só o símbolo. Todas existem em versão para fundo claro e escuro, em SVG (sem perda de qualidade) e PNG.</p>
  <div class="grid two">
    <div><div class="tile light"><img src="logo/logo-horizontal.svg" alt="Logotipo horizontal"></div><p class="cap">Horizontal em fundo claro</p></div>
    <div><div class="tile dark"><img src="logo/logo-horizontal-on-dark.svg" alt="Logotipo horizontal em fundo escuro"></div><p class="cap">Horizontal em fundo escuro</p></div>
    <div><div class="tile light"><img src="logo/logo-stacked.svg" alt="Logotipo empilhado" style="max-height:190px"></div><p class="cap">Empilhado (cartazes, telas de abertura)</p></div>
    <div><div class="tile dark"><img src="logo/logo-stacked-on-dark.svg" alt="Logotipo empilhado em fundo escuro" style="max-height:190px"></div><p class="cap">Empilhado em fundo escuro</p></div>
  </div>
  <h3>Versões de uma cor</h3>
  <p>Para fundos coloridos, fotos, carimbos e impressão em uma cor. O rosto fica vazado, então a cor do fundo aparece por ele.</p>
  <div class="grid sm">
    <div><div class="tile violet"><img src="logo/mark-mono-white.svg" alt="Símbolo branco"></div><p class="cap">Branco, sobre violeta e fundos escuros</p></div>
    <div><div class="tile light"><img src="logo/mark-mono-ink.svg" alt="Símbolo em tinta"></div><p class="cap">Tinta, sobre fundos claros</p></div>
  </div>

  <h3>Espaço de proteção</h3>
  <p>Deixe livre, em todos os lados, <strong>duas vezes o diâmetro da faísca</strong> (as bolinhas âmbar do diagrama). Nada de texto, borda ou imagem dentro dessa área.</p>
  ${clearSpace()}

  <h3>Tamanho mínimo</h3>
  <div class="table-scroll"><table>
    <tr><th>Peça</th><th>Mínimo</th><th>Observação</th></tr>
    <tr><td>Logotipo horizontal</td><td class="mono">120 px de largura</td><td>Abaixo disso, use só o símbolo.</td></tr>
    <tr><td>Logotipo empilhado</td><td class="mono">80 px de largura</td><td></td></tr>
    <tr><td>Símbolo</td><td class="mono">24 px</td><td>Em tamanhos menores (abas do navegador), use <code>logo/favicon.svg</code>: traços mais grossos, sem brilho.</td></tr>
  </table></div>
</section>

<section id="cores">
  <h2><span class="n">03</span>Cores</h2>
  <p class="lead">Violeta é a identidade. Menta, âmbar e coral têm função: acerto, comemoração e erro. Use poucas cores por tela.</p>
  <div class="swatches">
    ${Object.entries(colorsJson.colors).map(swatch).join("\n    ")}
  </div>
  <h3>Contraste (WCAG)</h3>
  <p>Todas as combinações recomendadas passam no nível AA. Branco sobre menta e sobre coral <strong>não</strong> passam: nesses fundos, use texto na cor Tinta.</p>
  <div class="table-scroll"><table>
    <tr><th></th><th>Combinação</th><th>Razão</th><th>Resultado</th></tr>
    ${contrastRows}
  </table></div>
  <h3>Tokens para o site</h3>
  <p>Em <code>tokens/tokens.css</code> há variáveis prontas, com tema claro e escuro automáticos. Use os semânticos (<code>--dl-bg</code>, <code>--dl-text</code>, <code>--dl-primary</code>) nas telas e deixe a paleta crua para a marca.</p>
<pre>@import "brand/tokens/tokens.css";

.button {
  background: var(--dl-primary);
  color: var(--dl-on-primary);
  border-radius: var(--dl-radius-pill);
  font-family: var(--dl-font-sans);
  font-weight: 800;
}</pre>
</section>

<section id="tipografia">
  <h2><span class="n">04</span>Tipografia</h2>
  <p class="lead">Duas famílias, ambas gratuitas (licença OFL). <strong>Nunito</strong> é arredondada e amigável: é a letra do logotipo. <strong>JetBrains Mono</strong> é para código.</p>
  <div class="spec">
    <div class="card"><p class="big w900">Aa</p><strong>Nunito Black (900)</strong><p class="cap">Títulos grandes e o logotipo.</p><p class="w900" style="font-size:26px;margin:0">Dev + Lingo</p></div>
    <div class="card"><p class="big w800">Aa</p><strong>Nunito ExtraBold (800)</strong><p class="cap">Subtítulos, botões e rótulos.</p><p class="w800" style="font-size:26px;margin:0">Meta do dia cumprida!</p></div>
    <div class="card"><p class="big w700">Aa</p><strong>Nunito Bold (700)</strong><p class="cap">Destaques dentro do texto.</p><p class="w700" style="font-size:22px;margin:0">Responda hoje para manter a sequência.</p></div>
    <div class="card"><p class="big w400">Aa</p><strong>Nunito Regular (400)</strong><p class="cap">Texto corrido.</p><p style="margin:0">Um pouquinho por dia já conta. Escolha a área e o nível e bora praticar.</p></div>
    <div class="card"><p class="big mono">{ }</p><strong>JetBrains Mono (500)</strong><p class="cap">Código e comandos.</p><p class="mono" style="margin:0">console.log("oi");</p></div>
  </div>
  <p class="cap" style="margin-top:16px">Pilha de fontes (já em <code>tokens.css</code>): <code>"Nunito", ui-rounded, system-ui, sans-serif</code>. As fontes podem ser baixadas em fonts.google.com (Nunito e JetBrains Mono) ou pelo pacote <code>@fontsource</code>.</p>
</section>

<section id="icones">
  <h2><span class="n">05</span>Ícones</h2>
  <p class="lead">Cada mecânica do bot tem um ícone e um significado fixos. Use sempre o mesmo para a mesma coisa.</p>
  <div class="icons">
    <div class="icon"><img src="icons/flame.svg" alt=""><b>Chama</b><span>Sequência de dias</span></div>
    <div class="icon"><img src="icons/target.svg" alt=""><b>Alvo</b><span>Meta do dia</span></div>
    <div class="icon"><img src="icons/bolt.svg" alt=""><b>Raio</b><span>Combo de acertos</span></div>
    <div class="icon"><img src="icons/medal.svg" alt=""><b>Medalha</b><span>Conquistas</span></div>
    <div class="icon"><img src="icons/star.svg" alt=""><b>Estrela</b><span>XP</span></div>
  </div>
</section>

<section id="voz">
  <h2><span class="n">06</span>Tom de voz</h2>
  <p class="lead">O Devlingo é um colega que incentiva: simpático, direto e sem pressão. Frases curtas, uma emoção por mensagem, e erro tratado como parte de aprender.</p>
  <div class="voice">
    <div class="say yes"><small>Assim</small>✅ <strong>Acertou!</strong> +10 XP<br>🔥 Combo ×5! +5 XP</div>
    <div class="say no"><small>Assim não</small>Resposta correta confirmada. Pontuação atualizada.</div>
    <div class="say yes"><small>Assim</small>❌ <strong>Errou!</strong> A resposta certa era B.<br>💡 Dá para começar outro combo!</div>
    <div class="say no"><small>Assim não</small>Você errou de novo. Preste mais atenção!</div>
    <div class="say yes"><small>Assim</small>⏳ Responda hoje para manter sua sequência de 5 dias!</div>
    <div class="say no"><small>Assim não</small>⚠️ ATENÇÃO: você vai PERDER sua sequência!!!</div>
  </div>
  <h3>Regras</h3>
  <ul>
    <li><strong>Trate por "você"</strong> e use palavras neutras de gênero ("Semente", "Broto", "Lenda"), sem "bem-vindo(a)".</li>
    <li><strong>Um emoji por ideia</strong>, no começo da linha, e sempre o mesmo para a mesma coisa: 🔥 sequência · 🎯 meta · ⚡ combo · 🏅 conquista · 🆙 nível · 💡 explicação · 🧩 desafio.</li>
    <li><strong>Nunca culpe nem apresse.</strong> Avisos de sequência informam, não ameaçam.</li>
    <li><strong>Português do Brasil</strong>, sem gíria pesada. Termos de programação ficam como são (<em>commit</em>, <em>array</em>), em fonte de código quando forem trecho de código.</li>
  </ul>
</section>

<section id="discord">
  <h2><span class="n">07</span>No Discord</h2>
  <p class="lead">O avatar é recortado em círculo, então o símbolo fica no centro com folga. O banner tem a proporção do perfil de bots (680 × 240, aqui em dobro).</p>
  <div class="shots">
    <div><img class="avatar" src="discord/avatar-512.png" alt="Avatar do bot" width="200" height="200"><p class="cap">Avatar (1024 px, quadrado; o Discord recorta em círculo)</p></div>
    <div><img src="discord/banner-1360x480.png" alt="Banner do bot" width="1360" height="480"><p class="cap">Banner 1360 × 480</p></div>
  </div>
  <h3>Cor das mensagens do bot</h3>
  <p>A barra lateral de cada mensagem diz, de relance, o que aconteceu. As cores são as mesmas da paleta e ficam em <code>src/config.js</code>.</p>
  <div class="grid sm">${states.join("")}</div>
</section>

<section id="regras">
  <h2><span class="n">08</span>O que não fazer</h2>
  <div class="dont">
    <figure><div class="box"><img src="logo/logo-horizontal.svg" alt="" style="height:50px;transform:scaleX(1.5)"></div><figcaption><b>✕</b> Não distorça nem estique.</figcaption></figure>
    <figure><div class="box"><img src="logo/logo-horizontal.svg" alt="" style="filter:hue-rotate(140deg) saturate(1.4)"></div><figcaption><b>✕</b> Não troque as cores.</figcaption></figure>
    <figure><div class="box"><img src="logo/logo-horizontal.svg" alt="" style="transform:rotate(-14deg)"></div><figcaption><b>✕</b> Não gire.</figcaption></figure>
    <figure><div class="box"><img src="logo/logo-horizontal.svg" alt="" style="filter:drop-shadow(0 6px 0 #000)"></div><figcaption><b>✕</b> Sem sombra, contorno ou brilho extra.</figcaption></figure>
    <figure><div class="box v"><img src="logo/logo-horizontal.svg" alt=""></div><figcaption><b>✕</b> Não ponha a versão colorida sobre violeta: use a branca.</figcaption></figure>
    <figure><div class="box"><img src="logo/wordmark.svg" alt="" style="height:46px"></div><figcaption><b>✕</b> Não redesenhe a palavra com outra fonte.</figcaption></figure>
  </div>
</section>

<section id="arquivos">
  <h2><span class="n">09</span>Arquivos</h2>
  <div class="table-scroll"><table class="files">
    <tr><th>Arquivo</th><th>Para quê</th></tr>
    <tr><td>logo/mark.svg</td><td>Símbolo colorido. Também mono-white e mono-ink.</td></tr>
    <tr><td>logo/logo-horizontal*.svg</td><td>Logotipo padrão (claro e on-dark).</td></tr>
    <tr><td>logo/logo-stacked*.svg</td><td>Logotipo empilhado.</td></tr>
    <tr><td>logo/wordmark*.svg</td><td>Só a palavra "devlingo".</td></tr>
    <tr><td>logo/favicon.svg · png/favicon-*.png</td><td>Aba do navegador e ícones pequenos.</td></tr>
    <tr><td>png/apple-touch-icon-180.png</td><td>Ícone de tela inicial no celular.</td></tr>
    <tr><td>discord/avatar-1024.png</td><td>Avatar do bot (Developer Portal).</td></tr>
    <tr><td>discord/banner-1360x480.png</td><td>Banner do perfil do bot.</td></tr>
    <tr><td>social/og-image-1200x630.png</td><td>Prévia de link (Open Graph) e imagem social do repositório.</td></tr>
    <tr><td>icons/*.svg</td><td>Chama, alvo, raio, medalha e estrela.</td></tr>
    <tr><td>tokens/colors.json · tokens.css</td><td>Cores e variáveis para o site.</td></tr>
  </table></div>
  <p class="cap" style="margin-top:12px">Tudo isso é gerado por código em <code>brand/tools</code> (<code>npm install && npm run build</code>). Mudou algo na marca? Altere lá e gere de novo, em vez de editar os arquivos à mão.</p>
</section>
</main>
<script>
// Tema: segue o do sistema; o botão alterna e lembra a escolha (?theme=light|dark também vale).
(function () {
  var root = document.documentElement;
  var KEY = "dl-theme";
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var wanted = new URLSearchParams(location.search).get("theme") || read();
  if (wanted === "light" || wanted === "dark") root.setAttribute("data-theme", wanted);
  document.getElementById("theme").addEventListener("click", function () {
    var dark = root.getAttribute("data-theme")
      ? root.getAttribute("data-theme") === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = dark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    write(next);
  });
})();
</script>
<footer><div class="wrap">Devlingo · guia de marca · fontes Nunito e JetBrains Mono (SIL Open Font License)</div></footer>
</body>
</html>
`;

fs.writeFileSync(path.join(BRAND, "guide.html"), html);
console.log("brand/guide.html gerado (" + Math.round(html.length / 1024) + " KB)");
