# Verificador dos desafios de Kubernetes

Os 16 desafios do assunto **Kubernetes** (`ks-001` a `ks-016`, em `src/data/challenges.json`) não foram escritos de memória: cada resposta foi **observada num cluster de verdade**. Esta pasta é o que faz isso, e **só roda no GitHub Actions**, num cluster [kind](https://kind.sigs.k8s.io/) criado e destruído dentro da própria execução. Nada daqui foi feito para rodar no computador de ninguém (não precisa de Docker, kubectl nem cluster local).

## Como funciona

1. O workflow [`kubernetes.yml`](../../.github/workflows/kubernetes.yml) instala o kind (versão fixa, binário conferido por SHA-256), cria um cluster com 1 plano de controle e 2 nós de trabalho a partir de uma imagem de nó **fixada por hash**, e roda `verify.mjs`. Ele repete tudo em duas versões do Kubernetes: a mais antiga e a mais nova com suporte.
2. Cada desafio tem um arquivo em `questions/` com:
   - `run(lab)`: o **cenário**. Cria os recursos num namespace próprio, espera o cluster reagir e devolve o que foi **observado** (números, fases, mensagens), mais frases curtas (`lab.fact`) para o relatório;
   - `options[i].holds(observado)`: para cada uma das 4 opções, a afirmação dela como uma checagem sobre o que foi observado. `has` é um trecho do texto da opção, para a verificação não se descolar do desafio.
3. O executor confere, para cada desafio, que **só a opção marcada como correta em `challenges.json` é verdadeira**. Se duas forem verdadeiras (desafio ambíguo) ou nenhuma (resposta não confirmada), reprova.
4. Para provar que o próprio verificador não aceita resposta errada, ele troca a resposta de cada desafio por cada uma das erradas e confere que todas são reprovadas.
5. O relatório (`report/report.json` e `resumo.md`) vira o resumo da execução e um artefato guardado por 30 dias.

Os cenários com **controle** (o mesmo teste sem a coisa sob teste) estão nos próprios arquivos: por exemplo, o pod com `restartPolicy: Never` ao lado do padrão, o contêiner com memória folgada ao lado do que estoura o limite, o `drain` sem o PDB, o `Recreate` ao lado do `RollingUpdate`.

Os cenários que mexem no **nó** (`ks-012`, taints; `ks-013`, drain) marcam `exclusive` e rodam sozinhos, depois dos outros, e desfazem o que fizeram.

## Segurança

- O workflow só lê o repositório (`contents: read`), não usa nenhum segredo, não usa `pull_request_target` e as actions estão fixadas pelo SHA do commit.
- Nada aqui interpreta texto de issue, PR ou branch: os únicos valores variáveis (a imagem do nó e os ids a rodar) vêm da matriz do workflow ou de um `workflow_dispatch` e entram por variável de ambiente.
- As imagens dos pods vêm do `registry.k8s.io` (do próprio projeto Kubernetes), sem depender do Docker Hub.

## Repetir só um desafio

Em *Actions → Kubernetes → Run workflow*, preencha **only** com os ids (ex.: `ks-001,ks-005`). Só funciona depois que o workflow existe na branch principal.

## Acrescentar ou mudar um desafio

1. Escreva o desafio em `challenges.json` (mesmas regras de sempre: 4 opções de até 77 caracteres, a certa nunca a maior, posições equilibradas).
2. Crie ou ajuste `questions/ks-NNN.mjs`. O `npm test` (que **não** precisa de cluster) confere que cada desafio tem verificação, que o texto das opções ainda contém o trecho `has` e que as posições estão equilibradas.
3. Empurre a branch: o workflow roda o cluster e diz, opção por opção, o que foi observado.

Mudou o texto de uma opção sem rodar o cluster de novo? O `npm test` pega quando o trecho `has` some, mas **só o cluster confirma que a frase ainda é verdadeira**.
