# Devlingo Bot

Bot de Discord estilo Duolingo para aprender programação, feito em JavaScript com discord.js (v14.19.3 ou mais novo).

- **Components V2:** todas as mensagens usam Container, Text Display, Section, Separator e botões, sem embeds.
- **Sem slash commands e sem intents privilegiadas:** o bot responde quando é marcado num servidor ou quando recebe uma DM. Isso evita a revisão de acesso do Discord ao crescer.
- **Handlers:** comandos, eventos e botões ficam em pastas e são carregados automaticamente.

## Como usar

No servidor, marque o bot no começo da mensagem. Na DM, escreva direto.

| Servidor | DM | O que faz |
| --- | --- | --- |
| `@Devlingo aprender` | `aprender` | escolhe nível de dificuldade e assunto para estudar |
| `@Devlingo desafio` | `desafio` | desafio aleatório (ou `desafio python`, `javascript`, `sql`, `git`) |
| `@Devlingo perfil` | `perfil` | XP, nível e sequência de dias |
| `@Devlingo ranking` | `ranking` | top 10 do servidor (na DM, ranking global) |
| `@Devlingo ajuda` | `ajuda` | lista de comandos |

O XP e a sequência são globais por pessoa; o ranking do servidor conta só o XP ganho naquele servidor. Cada desafio expira em 5 minutos e só quem pediu pode responder.

## Como rodar

Precisa do [Node.js](https://nodejs.org) 18.11 ou mais novo.

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

## Estrutura

```
src/
  index.js              cria o cliente e carrega os handlers
  config.js             XP, tempos, cores
  commands/             um arquivo por comando
  events/               um arquivo por evento do Discord
  buttons/              um arquivo por tipo de botão (prefixo do customId)
  handlers/             carregam commands/, events/ e buttons/
  utils/                ui (Components V2), db, challenges, parse, logger
  data/challenges.json  os desafios
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

Edite `src/data/challenges.json`. Cada desafio tem `id` (único), `language`, `difficulty` (`beginner`, `intermediate`, `advanced` ou `expert`), `topic` (`id`, `label` e `description`), `question`, `code` (opcional), `options` (2 a 4), `answer` (índice da opção certa, começando em 0) e `explanation`. O comando `aprender` só oferece níveis e assuntos que tenham desafios cadastrados. O bot valida os dados ao iniciar.

## Próximos passos

- Trocar o `data/data.json` por um banco de dados de verdade (SQLite ou Postgres) antes de crescer
- Desafios por nível e trilhas
- Limite de XP por dia
