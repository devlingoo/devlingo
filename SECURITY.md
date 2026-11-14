# Política de segurança

## Como avisar de uma vulnerabilidade

**Não abra uma issue pública** para um problema de segurança: ela fica visível para todo mundo antes de existir correção.

Use o relato privado do GitHub: na aba **Security** do repositório, clique em **Report a vulnerability**, ou abra direto
<https://github.com/devlingoo/devlingo/security/advisories/new>. Só quem mantém o projeto vê o relato.

Ajuda bastante incluir: o que acontece, como reproduzir (passo a passo) e qual o impacto. Respondo assim que possível,
e o crédito pela descoberta é de quem a encontrou, se a pessoa quiser.

## O que está no escopo

- **O bot** (`src/`): por exemplo, injeção por apelido ou texto, vazamento do token, comandos que deixam alguém usar o bot de forma que não deveria, certificados falsificáveis.
- **O site** (`site/`): por exemplo, qualquer forma de executar script na página, embutir o site em outro (clickjacking), ou fazer o site contatar um domínio de terceiros.
- **A cadeia de suprimentos**: dependências, workflows do GitHub Actions e scripts de build.

Fora do escopo: ataques que exigem acesso ao computador ou à conta de quem usa o bot, e falhas do próprio Discord (avise o Discord).

## Versões atendidas

Só a branch `main`. O projeto não publica versões numeradas.

## Se você descobrir que o token do bot vazou

1. No [Discord Developer Portal](https://discord.com/developers/applications), aba **Bot**, clique em **Reset Token** (o token antigo para de funcionar na hora).
2. Atualize o `.env` onde o bot roda.
3. Avise pelo relato privado acima, para a causa ser corrigida.

O `.env` nunca deve ir para o repositório (já está no `.gitignore`).
