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

## Cursos e certificados

- Os cursos ficam em `src/data/courses.json` (regras no README). Assunto novo com desafios **precisa** entrar em algum curso, senão ninguém ganharia certificado dele; `npm test` confere.
- O progresso do curso vem de perguntas **diferentes** acertadas (tabela `seen`), não de contagem de acertos: acertar a mesma pergunta cinco vezes vale uma. Por isso, **não apague nem renomeie o `id` de um desafio** já publicado: quem acertou perde o progresso. Pode corrigir o texto à vontade.
- Certificado já emitido nunca é apagado nem refeito (`UNIQUE (user_id, course_id, level)`); se um curso ganhar módulos depois, quem já tem o certificado do nível continua com ele.
- O PNG é desenhado em `src/utils/certificate.js` com o texto convertido em curvas (`opentype.js` + `@resvg/resvg-js`), então não depende de fonte instalada na máquina. Mexeu no layout? Gere um exemplo e **olhe a imagem** com nomes curtos, longos e com acento antes de abrir o PR: o `npm test` só garante que o PNG sai, não que está bonito.
- Quando dá para evitar, o nome da pessoa entra no certificado **só como curva**, nunca como texto do SVG. Texto que entra como texto (como o `<title>`) passa por `xml()`.

## Banco de dados

O progresso fica em SQLite (`src/utils/db.js`). Para mudar as tabelas, **acrescente** uma migração nova ao fim da lista `MIGRATIONS`; nunca edite as anteriores, porque bancos que já existem já passaram por elas.

## Conquistas e telas

- Conquista nova: acrescente na lista de `src/utils/achievements.js` (a `key` nunca muda, porque é o que fica gravado no banco). Se a regra precisa de uma estatística nova, ela entra em `recordAnswer` (`src/utils/db.js`) junto com uma migração.
- As telas (o que cada comando mostra) ficam em `src/utils/views.js`; os comandos e os botões de atalho usam as mesmas funções. Comando novo entra na ajuda sozinho: defina `category` (`estudar`, `voce` ou `ajuda`) e, se quiser, `order`.
- Em mensagens com menção ao bot, deixe a menção **fora** de crases (`commandRef` em `ui.js` já faz isso): dentro de código o Discord mostra o número, não o nome.
- **Texto de pessoas nunca entra cru numa mensagem** (apelido, nome de usuário, o que elas digitaram): passe por `safeText` (`src/utils/text.js`). O `escapeMarkdown` do discord.js não cobre link mascarado (`[texto](url)`), autolink nem menção, e um apelido assim apareceria clicável no ranking.
- Botões que mexem em dados: se a gravação falhar, solte a trava de clique duplo (veja `buttons/challenge.js`), senão a pessoa não consegue tentar de novo.

## Marca

- A identidade visual (logotipo, cores, fontes, ícones, avatar, banner) está em `brand/`; o resumo e o guia visual estão em `brand/README.md` e `brand/guide.html`.
- Os arquivos de `brand/` são **gerados**: não edite à mão. Mude em `brand/tools` e rode `npm run build` (e `npm run guide`) lá dentro.
- As cores das mensagens do bot (`colors` em `src/config.js`) precisam bater com `brand/tokens/colors.json`; o `npm test` confere.
- Para atualizar o avatar e o banner do bot no Discord: `brand/tools/apply-discord.js` (mostra o que muda antes de alterar).

## Segredos

Se um token do bot vazar (commit, print, conversa), redefina-o em Developer Portal → Bot → Reset Token e atualize o `.env` e o secret `DISCORD_TOKEN` do repositório.
