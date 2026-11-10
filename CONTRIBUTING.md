# Contribuindo com o Devlingo

O README explica como o bot funciona, como rodar e como criar comandos, eventos, botões e desafios. Aqui fica só o combinado de trabalho.

## Preparar o ambiente

Precisa do Node.js 22.13 ou mais novo.

```bash
npm install
npm test        # não precisa de token nem de internet
```

Para rodar o bot de verdade, copie `.env.example` para `.env` e preencha o `DISCORD_TOKEN`. O `.env` e a pasta `data/` nunca vão para o GitHub.

## Fluxo

1. Crie uma branch a partir da `main`. Nomes: `feat/...` (funcionalidade), `fix/...` (correção), `content/...` (só desafios), `chore/...` (organização, CI, docs).
2. Faça commits pequenos, com uma frase no imperativo dizendo o que mudou (como no histórico: "Add learning path selection screens").
3. Rode `npm test` antes de abrir o PR. O CI roda o mesmo comando em Node 22 e 24.
4. Abra o PR para a `main`. Peça revisão da outra pessoa antes de juntar.

## Desafios novos

- Cadastre em `src/data/challenges.json` seguindo as regras do README e confira **cada resposta**. Se o desafio tem código em JavaScript ou Python, execute-o e compare com a alternativa marcada como certa.
- Para cada assunto e nível, tenha pelo menos 4 desafios, senão o "Próxima pergunta" repete.
- Assunto novo? Coloque o id dele em pelo menos uma área de `src/data/areas.json`.
- `npm test` valida o formato, os limites do Discord e se todo assunto pertence a alguma área.

## Banco de dados

O progresso fica em SQLite (`src/utils/db.js`). Para mudar as tabelas, **acrescente** uma migração nova ao fim da lista `MIGRATIONS`; nunca edite as anteriores, porque bancos que já existem já passaram por elas.

## Conquistas e telas

- Conquista nova: acrescente na lista de `src/utils/achievements.js` (a `key` nunca muda, porque é o que fica gravado no banco). Se a regra precisa de uma estatística nova, ela entra em `recordAnswer` (`src/utils/db.js`) junto com uma migração.
- As telas (o que cada comando mostra) ficam em `src/utils/views.js`; os comandos e os botões de atalho usam as mesmas funções. Comando novo entra na ajuda sozinho: defina `category` (`estudar`, `voce` ou `ajuda`) e, se quiser, `order`.
- Em mensagens com menção ao bot, deixe a menção **fora** de crases (`commandRef` em `ui.js` já faz isso): dentro de código o Discord mostra o número, não o nome.
- **Texto de pessoas nunca entra cru numa mensagem** (apelido, nome de usuário, o que elas digitaram): passe por `safeText` (`src/utils/text.js`). O `escapeMarkdown` do discord.js não cobre link mascarado (`[texto](url)`), autolink nem menção, e um apelido assim apareceria clicável no ranking.
- Botões que mexem em dados: se a gravação falhar, solte a trava de clique duplo (veja `buttons/challenge.js`), senão a pessoa não consegue tentar de novo.

## Segredos

Se um token do bot vazar (commit, print, conversa), redefina-o em Developer Portal → Bot → Reset Token e atualize o `.env` e o secret `DISCORD_TOKEN` do repositório.
