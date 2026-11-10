# Identidade visual do Devlingo

> **Aprenda programação jogando.**

Abra o **[guia de marca](guide.html)** no navegador (dá para ver offline): logotipo, cores, tipografia, ícones, tom de voz e o que não fazer. Esta página é só o resumo e o mapa dos arquivos.

## Em 30 segundos

| | |
| --- | --- |
| **Ideia** | **Dev** + **Lingo** (língua): aprender programação como quem aprende um idioma, um pouco por dia. |
| **Símbolo** | Balão de fala (o "lingo") com rosto de colchetes `< >` (o "dev"), sorriso menta e uma antena com faísca âmbar (o bot e o hábito). |
| **Cor principal** | Violeta Devlingo `#6C4DFF`. Menta `#2BD9A8` = acerto, Faísca `#FFB224` = comemoração, Coral `#FF5C7A` = erro. |
| **Fontes** | [Nunito](https://fonts.google.com/specimen/Nunito) (títulos, texto e o logotipo) e [JetBrains Mono](https://www.jetbrains.com/lp/mono/) (código). Ambas gratuitas (SIL OFL). |
| **Tom** | Colega que incentiva: simpático, direto, sem pressão. Um emoji por ideia, sempre o mesmo para a mesma coisa. |

## Regras rápidas

- Espaço livre em volta do logotipo: **2× o diâmetro da faísca**. Tamanho mínimo: logotipo horizontal 120 px de largura; símbolo 24 px (menor que isso, use `logo/favicon.svg`).
- Fundo claro ou escuro: use a versão certa (`-on-dark` para fundo escuro). Fundo colorido (inclusive violeta): versão de uma cor (`mark-mono-white.svg`).
- Não estique, gire, recolora, ponha sombra, nem redesenhe a palavra com outra fonte.
- Texto branco **não** passa no contraste sobre menta e coral: nesses fundos, use Tinta `#1B1740`.

## Arquivos

| Pasta | O que tem |
| --- | --- |
| `logo/` | Símbolo (colorido e de uma cor), logotipo horizontal e empilhado (claro e `-on-dark`), só a palavra, favicon. Tudo em SVG. |
| `png/` | Os mesmos em PNG (logotipos, símbolo, favicons, ícone de celular). |
| `discord/` | `avatar-1024.png` e `banner-1360x480.png` do bot (e versões menores). |
| `social/` | `og-image-1200x630.png`: prévia de link e imagem social do repositório. |
| `icons/` | Chama (sequência), alvo (meta), raio (combo), medalha (conquistas), estrela (XP). |
| `tokens/` | `tokens.css` (variáveis CSS com tema claro e escuro) e `colors.json` (cores, valores para o Discord e contrastes). |
| `guide.html` | O guia de marca. |
| `tools/` | O gerador de tudo isso. |

### Usando no site

```html
<link rel="icon" href="/brand/logo/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/png/apple-touch-icon-180.png">
<meta property="og:image" content="https://SEU-DOMINIO/brand/social/og-image-1200x630.png">
<link rel="stylesheet" href="/brand/tokens/tokens.css">
```

Use as variáveis semânticas (`--dl-bg`, `--dl-text`, `--dl-primary`...): elas trocam sozinhas entre claro e escuro. Para trocar o tema à mão: `document.documentElement.dataset.theme = "dark"` (ou `"light"`).

## Gerando de novo

Os arquivos de `logo/`, `png/`, `discord/`, `social/`, `icons/`, `tokens/` e o `guide.html` são **gerados por código**. Para mudar algo na marca, altere em `tools/` e gere de novo, em vez de editar os arquivos à mão:

```bash
cd brand/tools
npm install          # só para a marca; não afeta as dependências do bot
npm run build        # logotipos, PNGs, ícones, avatar, banner, imagem social e tokens
npm run guide        # guia de marca (brand/guide.html)
npm run check        # folha de conferência: favicons e versões de uma cor (em brand/.check)
```

- `tools/lib.js`: cores, símbolo, logotipo e ícones (o texto vira curva, então os SVGs não dependem de fonte instalada).
- `tools/build.js`: monta cada arquivo. `tools/guide.js`: monta o guia.
- `npm test` (na raiz) confere que as cores do bot batem com os tokens e que os arquivos têm as dimensões certas.

## No Discord

O perfil do bot (avatar e banner) é aplicado por um script, que mostra o que vai mudar antes de alterar qualquer coisa:

```bash
cd brand/tools
node --env-file=../../.env apply-discord.js            # só mostra o que mudaria
node --env-file=../../.env apply-discord.js --yes      # aplica avatar e banner
node --env-file=../../.env apply-discord.js --restore  # volta ao que estava antes
```

Ele usa o `DISCORD_TOKEN` do `.env` (nunca é impresso) e guarda o avatar e o banner anteriores em `tools/.discord-backup/` (fora do git). O Discord limita a frequência de trocas de avatar, então evite rodar várias vezes seguidas. O **ícone do aplicativo** (Developer Portal > General Information) é separado do avatar do bot e hoje é trocado à mão: use `discord/avatar-1024.png`.

As cores das mensagens do bot ficam em `src/config.js` (`colors`) e seguem a paleta.

## Licenças

As fontes Nunito e JetBrains Mono são licenciadas sob a SIL Open Font License 1.1, que permite usá-las (inclusive convertidas em curvas, como no logotipo) em projetos comerciais. O símbolo, o logotipo e os ícones são do projeto Devlingo. **Ainda falta decidir** se eles seguem a mesma licença do código ou se a marca fica com os direitos reservados (é comum a marca ter regra própria, diferente da do código): isso é uma decisão dos donos do projeto.
