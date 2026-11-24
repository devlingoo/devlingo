# Teste de compatibilidade com a Discloud

Dois mini-apps **descartáveis** para descobrir, antes de hospedar o Devlingo de verdade, o que a documentação da Discloud não responde. Nenhum deles usa token e nenhum imprime segredo. Não fazem parte do bot nem do site.

Depois do teste, **apague os dois apps** no painel (eles ocupam RAM do plano). Esta pasta pode ficar no repositório para repetir o teste quando a Discloud mudar algo (por exemplo, a versão do Node).

## O que cada um responde

| App | Pergunta |
| --- | --- |
| `bot/` | O Node é 22.13 ou mais novo (o bot exige, por causa do `node:sqlite`)? O SQLite grava e aceita o modo WAL? **Os arquivos criados em execução sobrevivem a reinício e a commit?** O pacote nativo do `resvg` (certificados) instala e renderiza? Quanta memória o contêiner tem? A variável do painel chega? O fuso `America/Sao_Paulo` funciona? Dá para falar com o Discord? |
| `site/` | Um site com servidor próprio sobe na porta 8080? **Quais cabeçalhos de segurança chegam ao navegador depois do proxy da Discloud** (CSP, HSTS...)? |

## Como fazer (uns 10 minutos)

Compacte **o conteúdo** da pasta (selecione os arquivos de dentro, não a pasta) em um `.zip`: o `discloud.config` precisa ficar na raiz do zip. Não inclua `node_modules`, `data` nem `package-lock.json`.

### 1) Bot (`bot/`)

1. Envie o zip como aplicativo novo (painel, CLI ou extensão do VS Code, como você já faz) e abra os **Logs**. O relatório aparece logo no começo; cada linha é `OK`, `FALHA` ou `info`.
2. **Variável de ambiente:** no painel, cadastre `CHECK_VAR` com o valor `abc123` e faça rebuild. Na linha `Variável CHECK_VAR` deve aparecer `chegou, 6 caractere(s)`.
3. **Persistência:** reinicie o app. A linha `data/boots.txt` deve mostrar a inicialização nº 2 e o banco, 2 linhas. Depois envie o mesmo zip de novo (commit) e confira se o contador continua subindo (nº 3). Se voltar para 1, **o disco não persiste** e o banco do bot se perderia a cada atualização.
4. **Se o Node vier abaixo de 22.13:** troque `VERSION=latest` por `VERSION=current` no `discloud.config`, envie de novo e repita.

### 2) Site (`site/`, só nos planos Platinum ou superiores)

1. Crie um subdomínio (pelo painel ou pelo comando `.sd`) e troque `TROQUE-PELO-SEU-SUBDOMINIO` no `discloud.config` pelo nome dele (sem `.discloud.app`).
2. Envie o zip e, depois que subir, rode no terminal (troque `SEU-ID`):

```bash
curl -sI https://SEU-ID.discloud.app/
curl -s  https://SEU-ID.discloud.app/__headers
```

O app define sete cabeçalhos (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy` e `X-Devlingo-Teste`). Veja **quais aparecem** na resposta do `curl`: os que sumirem foram removidos ou trocados pelo proxy.

> **Todo app Node na Discloud precisa de um `package.json`**, inclusive o `TYPE=site` (sem ele o build falha com "Não detectamos package.json"). Os dois mini-apps já trazem o deles.

## Resultado da primeira execução (24/11/2026, plano Diamond)

Rodado de verdade na conta, não só lido na documentação:

| Pergunta | Resposta |
| --- | --- |
| Versão do Node com `VERSION=latest` | **v26.13.1** (Linux x64, glibc 2.41). A página de versões da documentação, que só lista até o Node 20, está desatualizada |
| `node:sqlite` e modo WAL | funcionam |
| `resvg` nativo | instala sozinho e renderiza |
| Arquivos criados em execução (`data/`) | **sobrevivem a reinício, rebuild e commit** (o contador foi de 1 a 4; o zip não tinha `data/`) |
| Variável cadastrada no painel | chega em `process.env`, mas **só depois de um rebuild** |
| `package-lock.json` no zip | **é respeitado** (o `resvg` preso em 2.6.0 no lock foi instalado, embora o `package.json` aceitasse a 2.6.2) |
| Script `postinstall` com `.npmrc` `ignore-scripts=true` | não rodou |
| Cabeçalhos do site | **os 7 que o app define chegam intactos**; a Discloud acrescenta `X-Powered-By` e `X-Xss-Protection` e passa tudo por um Cloudflare |
| `http://` do site | **não é redirecionado** para `https://`: o servidor do site precisa fazer isso olhando o cabeçalho `x-forwarded-proto` |
| Endereço do site | `https://<id>.discloud.dev` ou `.app`: a Discloud escolhe e não dá para prever (neste teste o `devlingo-teste` ficou `.dev` e depois o `devlingo` ficou `.app`) |

## O que me mandar

- O texto dos logs do `bot/` (as linhas `[OK]`, `[FALHA]` e `[info]`) e o resultado dos passos 3 e 4.
- A saída dos dois `curl` do `site/`.
- O nome do seu plano (Gold, Platinum, Diamond...).

Com isso dá para escrever a configuração de hospedagem sabendo o que funciona, em vez de adivinhar.
