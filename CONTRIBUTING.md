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

## Uma instância por token

Se o bot rodar em dois lugares ao mesmo tempo com o mesmo token, cada mensagem é respondida duas vezes (e uma das instâncias pode estar com código antigo). Antes de rodar `npm start`, confira se o workflow "Testar bot no Discord" não está em execução (aba Actions) e se não há outro terminal com o bot aberto. O ideal é cada pessoa ter o **próprio bot de teste** (outro token no `.env`) e deixar o token do bot de verdade só onde ele roda de fato.

## Segredos

Se um token do bot vazar (commit, print, conversa), redefina-o em Developer Portal → Bot → Reset Token e atualize o `.env` e o secret `DISCORD_TOKEN` do repositório.
