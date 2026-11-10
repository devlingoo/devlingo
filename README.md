<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo/logo-horizontal-on-dark.svg">
    <img src="brand/logo/logo-horizontal.svg" alt="Devlingo" width="420">
  </picture>
</p>

<p align="center"><strong>Aprenda programação jogando.</strong></p>

# Devlingo Bot

Bot de Discord estilo Duolingo para aprender programação, feito em JavaScript com discord.js (v14.19.3 ou mais novo).

- **Components V2:** todas as mensagens usam Container, Text Display, Section, Separator e botões, sem embeds.
- **Sem slash commands e sem intents privilegiadas:** o bot responde quando é marcado num servidor ou quando recebe uma DM. Isso evita a revisão de acesso do Discord ao crescer.
- **Handlers:** comandos, eventos e botões ficam em pastas e são carregados automaticamente.

## Como usar

No servidor, marque o bot no começo da mensagem. Na DM, escreva direto.

| Servidor | DM | O que faz |
| --- | --- | --- |
| `@Devlingo configurar` | `configurar` | escolhe suas áreas (Frontend, Backend...) e seu nível; dá para mudar quando quiser |
| `@Devlingo aprender` | `aprender` | trilha de estudo: escolhe o assunto exato e só pergunta sobre ele |
| `@Devlingo desafio` | `desafio` | desafio aleatório do seu nível e das suas áreas (ou `desafio python`, `javascript`, `sql`, `git`) |
| `@Devlingo perfil` | `perfil` | nível, XP, sequência, meta do dia, estatísticas e trilha |
| `@Devlingo ranking` | `ranking` | top 10 do servidor (na DM, ranking global) e a sua posição |
| `@Devlingo conquistas` | `conquistas` | suas medalhas: as que você já ganhou e as que faltam |
| `@Devlingo ajuda` | `ajuda` | lista de comandos, agrupada por tipo |

As telas têm botões de atalho (📚 Estudar, 👤 Perfil, 🏆 Ranking, 🏅 Conquistas, ⚙️ Configurar) para andar entre elas sem digitar.

O XP e a sequência são globais por pessoa; o ranking do servidor conta só o XP ganho naquele servidor. Cada desafio expira em 5 minutos e só quem pediu pode responder.

**Limite diário:** cada pessoa ganha no máximo 200 XP por dia. Depois disso ainda dá para treinar e ler as explicações, mas o XP só volta no dia seguinte (o `perfil` mostra o XP de hoje). O "dia" muda à meia-noite de `America/Sao_Paulo`, não do servidor onde o bot roda.

### Estímulos de hábito

O bot recompensa quem volta todo dia, sem punir quem falha:

- 🎯 **Meta do dia:** 5 respostas por dia (certas ou erradas) cumprem a meta e rendem **+15 XP**, uma vez por dia. A barra aparece em toda resposta e no `perfil`.
- 🔥 **Sequência e marcos:** a sequência cresce na primeira resposta de cada dia. Os marcos de 3, 7, 14, 30, 60 e 100 dias dão XP de bônus (+10, +30, +60, +150, +300 e +500). O `perfil` mostra o próximo marco e avisa, sem pressão, quando a sequência está em risco hoje.
- ⚡ **Combo:** acertos seguidos mostram um combo; a cada 5, **+5 XP**. Errar zera (o bot avisa, sem drama).
- 🆙 **Níveis e títulos:** cada 100 XP é um nível. Títulos: 🌱 Semente, 🌿 Broto, 🌳 Árvore, ⚡ Faísca, 🔥 Chama e 👑 Lenda. Subir de nível é comemorado na própria resposta (a mensagem fica dourada).
- 🏅 **Conquistas:** 13 medalhas (primeiro passo, 10/50/100 acertos, sequências, combos, meta, nível Especialista...). O comando `conquistas` mostra as ganhas e as que faltam.
- 📍 **Ranking com a sua posição**, mesmo fora do top 10.

Os bônus ficam **fora** do limite diário de XP: são raros e premiam constância, não volume (e o combo só dá bônus quando o XP da resposta entrou). Os valores estão em `src/config.js`; `DAILY_GOAL` no `.env` muda a meta ou a desliga (`0`). Quem já usava o bot começa as estatísticas e conquistas do zero, mas mantém XP e sequência.

### Configuração inicial (`configurar`)

Na **primeira vez** que alguém usa `aprender` ou `desafio`, o bot pede a configuração antes de qualquer pergunta (são dois passos, uns 10 segundos):

1. **Áreas**, uma ou mais: 🎨 Frontend, ⚙️ Backend, 🗄️ Banco de dados, 🛠️ Ferramentas e DevOps.
2. **Nível** (🟢 Iniciante, 🟡 Intermediário, 🟠 Avançado, 🔴 Especialista), o ponto de partida.

Depois disso, `aprender` já abre nos assuntos do seu nível e das suas áreas, e `desafio` sorteia só dali. Dá para mudar a qualquer momento com `configurar` (ou pelo botão **Alterar minha trilha**); XP e sequência não mudam. `perfil`, `ranking` e `ajuda` funcionam sem configurar.

A configuração fica salva por pessoa (vale em todos os servidores e na DM). Só aparecem áreas e níveis que já têm desafios cadastrados.

### Trilha de estudo (`aprender`)

1. O menu mostra os assuntos do seu nível, só das suas áreas. **Ver todas as áreas** mostra os de fora, sem mexer na sua configuração.
2. Escolha o **assunto exato** (por exemplo, "Funções em JavaScript" ou "Consultas SQL"): você só recebe perguntas dele.
3. Responda. Depois de cada resposta, **Próxima pergunta** sorteia outra do mesmo nível e assunto (sem repetir a que acabou de sair), **Trocar assunto** volta à lista de assuntos do nível e **Trocar nível** escolhe outro nível só para essa sessão.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 22.13 ou mais novo (o banco SQLite vem embutido no Node, sem instalar nada a mais).

1. Crie o bot no [Discord Developer Portal](https://discord.com/developers/applications), aba **Bot**. Não precisa ligar nenhuma Privileged Gateway Intent.
2. Copie o token e convide o bot ao servidor (OAuth2 → URL Generator → escopo `bot`; permissões: View Channels, Send Messages, Read Message History, Add Reactions).
3. No projeto:

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
# edite o .env e coloque o DISCORD_TOKEN
npm start                # ou npm run dev para reiniciar ao salvar
```

**Nunca** suba o `.env` para o GitHub (já está no `.gitignore`).

Variáveis opcionais do `.env` (todas explicadas no `.env.example`):

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `ALLOWED_CHANNEL_ID` | vazio | nos servidores, o bot só responde nesse canal |
| `DAILY_XP_CAP` | `200` | máximo de XP por pessoa por dia (`0` = sem limite) |
| `DAILY_GOAL` | `5` | respostas por dia que cumprem a meta diária (`0` = sem meta) |
| `TIMEZONE` | `America/Sao_Paulo` | fuso que define "o dia" da sequência e do limite diário |
| `DB_PATH` | `data/devlingo.db` | onde fica o banco |

**Dados:** o progresso fica em SQLite (`data/devlingo.db`, ignorado pelo git; faça backup dessa pasta). Se existir um `data/data.json` da versão antiga, ele é importado sozinho na primeira inicialização e guardado como `data.json.migrated`.

**Testes:** `npm test` roda tudo sem token e sem internet.

Quer contribuir? Veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## Estrutura

```
src/
  devlingo.js           cria o cliente e carrega os handlers
  config.js             XP, limite diário, fuso, banco, tempos, cores
  commands/             um arquivo por comando
  events/               um arquivo por evento do Discord
  buttons/              um arquivo por tipo de botão ou menu (prefixo do customId)
  handlers/             carregam commands/, events/ e buttons/
  utils/                ui (Components V2), db (SQLite), challenges, areas, study, time, parse, logger
  data/challenges.json  os desafios
  data/areas.json       quais assuntos pertencem a cada área (Frontend, Backend...)
test/                   testes automáticos (npm test), sem precisar de token nem de internet
brand/                  identidade visual: logotipo, cores, fontes, ícones, avatar e banner (veja brand/guide.html)
data/                   banco SQLite em runtime (fora do git)
.github/                CI (testes em cada PR), template de PR e o workflow manual de teste do bot
```

### Criar um comando novo

Crie `src/commands/meucomando.js`. Ele aparece sozinho no `ajuda`:

```js
const { sendV2, notice } = require("../utils/ui");

module.exports = {
  name: "ola",
  aliases: ["oi"],
  description: "diz olá",
  usage: "ola",
  async execute({ message, args, client }) {
    return sendV2(message.channel, notice("Olá! 👋"));
  },
};
```

### Criar um evento ou botão novo

- Evento: arquivo em `src/events/` exportando `{ name, once?, execute(client, ...args) }`.
- Botão: arquivo em `src/buttons/` exportando `{ prefix, execute(interaction, parts, client) }`. O `customId` do botão deve começar com `prefixo:`.

## Adicionando desafios

Edite `src/data/challenges.json`. Cada desafio tem `id` (único), `language`, `difficulty` (`beginner`, `intermediate`, `advanced` ou `expert`), `topic` (`id`, `label` e `description`), `question`, `code` (opcional), `options` (2 a 4), `answer` (índice da opção certa, começando em 0) e `explanation`. O comando `aprender` só oferece níveis e assuntos que tenham desafios cadastrados. O bot valida os dados ao iniciar (e `npm test` também).

Regras que a validação cobra, porque vêm de limites do Discord:

- `id` com até 16 caracteres e `topic.id` com até 32 (só `a-z`, `0-9` e hífen): eles vão dentro do `customId` dos botões.
- Cada opção com no máximo 77 caracteres e sem repetir: o botão mostra `A) ` + a opção, e o Discord corta o rótulo em 80.
- O texto de `question` e `explanation` aceita Markdown (como `` `código` ``); as **opções não**, porque são rótulos de botão.
- Use o mesmo `label` e `description` para o mesmo `topic.id` em todos os níveis. Para o assunto aparecer em mais de um nível, basta cadastrar desafios dele em cada nível.
- Tente ter pelo menos 4 desafios por assunto e nível, para o "Próxima pergunta" não ficar repetitivo.

### Áreas (`src/data/areas.json`)

Cada área lista os `topics` (ids de assunto) que pertencem a ela. Um assunto pode estar em várias áreas: JavaScript está em Frontend e em Backend. **Todo assunto novo precisa entrar em pelo menos uma área**, senão ninguém o encontra depois da configuração (`npm test` confere). Uma área nova precisa de `id` (até 10 caracteres), `label`, `emoji`, `description` e `topics`, com no máximo 6 áreas no total.

## Próximos passos

- Mais desafios e mais assuntos (hoje são 116 desafios em 7 assuntos, com 4 em cada nível; `npm test` exige esse mínimo). Frontend ainda só tem JavaScript: faltam HTML/CSS e DOM. Backend ainda não tem HTTP/APIs, Banco de dados não tem modelagem, e DevOps só tem Git (faltam Linux e Docker).
- Avisar quando a pessoa vai bem num nível (por exemplo, 90% de acerto) e sugerir subir; hoje o nível só muda se ela mudar em `configurar`.
- Mais estímulos de hábito, ainda não feitos: "desafio do dia" igual para todo mundo, "congelar" a sequência por um dia, ligas semanais de ranking e lembretes por DM (esses só com **opt-in** da pessoa, nunca por padrão)
- Se o bot passar de ~2.500 servidores, o Discord exige sharding; o SQLite em arquivo único também deixa de servir (Postgres)
- Evitar repetir perguntas já acertadas recentemente na mesma trilha (hoje só a última é excluída)
