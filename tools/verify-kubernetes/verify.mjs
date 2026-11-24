// Executa as verificações de Kubernetes contra o cluster que o kubectl estiver apontando (o kind do GitHub Actions).
// Para cada desafio: roda o cenário de verdade, junta o que foi observado e confere, opção por opção, se SÓ a opção
// marcada como correta em challenges.json é verdadeira. Sai com código 1 se qualquer coisa não bater.
//
//   ONLY=ks-001,ks-005   roda só esses desafios (útil para repetir um que falhou)
//   REPORT_DIR=report    onde gravar report.json e resumo.md
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadChallenges, loadQuestions, verdict, wiring } from "./catalog.mjs";
import { Lab, run, sleep } from "./lib.mjs";

const reportDir = process.env.REPORT_DIR ?? "report";
const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = 7;

const challenges = new Map(loadChallenges().map((c) => [c.id, c]));
const all = await loadQuestions();

// 1) a ligação entre as verificações e os desafios tem de estar íntegra
const problems = [];
for (const question of all) problems.push(...wiring(question, challenges.get(question.id)));
for (const id of challenges.keys()) if (!all.some((q) => q.id === id)) problems.push(`${id}: o desafio não tem verificação`);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const questions = only.length > 0 ? all.filter((q) => only.includes(q.id)) : all;
if (questions.length === 0) {
  console.error(`Nenhum desafio casa com ONLY=${only.join(",")}`);
  process.exit(1);
}

// 2) o que o cluster é
const kubectl = (args) => run("kubectl", args);
const version = JSON.parse((await kubectl(["version", "-o", "json"])).stdout);
const readNodes = async () =>
  JSON.parse((await kubectl(["get", "nodes", "-o", "json"])).stdout).items.map((node) => ({
    name: node.metadata.name,
    ready: node.status.conditions.find((c) => c.type === "Ready")?.status === "True",
    kubelet: node.status.nodeInfo.kubeletVersion,
    runtime: node.status.nodeInfo.containerRuntimeVersion,
    os: node.status.nodeInfo.osImage,
    kernel: node.status.nodeInfo.kernelVersion,
    controlPlane: "node-role.kubernetes.io/control-plane" in (node.metadata.labels ?? {}),
  }));

// Os nós de trabalho entram no cluster alguns segundos depois do plano de controle: espera até 4 minutos.
let nodes = await readNodes();
for (let waited = 0; nodes.filter((n) => !n.controlPlane && n.ready).length < 2 && waited < 240; waited += 5) {
  await sleep(5_000);
  nodes = await readNodes();
}
const cluster = { server: version.serverVersion?.gitVersion, client: version.clientVersion?.gitVersion, nodes };
console.log(`Cluster: servidor ${cluster.server}, kubectl ${cluster.client}, ${nodes.length} nós`);
for (const node of nodes) console.log(`  ${node.name}: ${node.ready ? "pronto" : "NÃO PRONTO"} (${node.kubelet}, ${node.runtime}, ${node.os}, kernel ${node.kernel})`);
if (nodes.filter((n) => !n.controlPlane && n.ready).length < 2) {
  console.error("O verificador precisa de pelo menos 2 nós de trabalho prontos.");
  process.exit(1);
}

// 3) roda cada cenário
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: passou de ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runOne(question) {
  const challenge = challenges.get(question.id);
  const lab = new Lab(question.id);
  const started = Date.now();
  let observed = null;
  let error = null;
  console.log(`▶ ${question.id} ${question.title}`);
  try {
    observed = await withTimeout(question.run(lab), question.timeoutMs ?? 300_000, question.id);
  } catch (caught) {
    error = caught?.message ?? String(caught);
  } finally {
    try {
      await question.cleanup?.(lab);
    } catch (caught) {
      lab.fact(`aviso: a limpeza falhou (${caught.message})`);
    }
    await lab.cleanup();
  }

  let holds = null;
  if (observed && !error) {
    try {
      holds = question.options.map((option) => Boolean(option.holds(observed)));
    } catch (caught) {
      error = `holds() falhou: ${caught.message}`;
    }
  }
  const ok = !error && holds !== null && verdict(holds, challenge.answer);
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`${ok ? "✔" : "✖"} ${question.id} em ${seconds} s${error ? ` — ${error}` : ""}${!ok && holds ? ` — opções verdadeiras: ${JSON.stringify(holds)} (resposta do desafio: ${challenge.answer})` : ""}`);
  for (const fact of lab.facts) console.log(`    · ${fact}`);
  return { id: question.id, title: question.title, ok, error, seconds, answer: challenge.answer, options: challenge.options, holds, facts: lab.facts, observed };
}

async function pool(items, limit, worker) {
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

// Os que mexem no nó (taint, drain) rodam sozinhos, depois dos outros, para não atrapalhar ninguém.
const shared = questions.filter((q) => !q.exclusive);
const alone = questions.filter((q) => q.exclusive);
const results = [...(await pool(shared, CONCURRENCY, runOne))];
// Antes de mexer nos nós, espera os namespaces dos cenários anteriores terminarem de ser apagados (pods ainda
// sumindo atrapalhariam o drain). Se não houver nenhum, o kubectl responde logo e a resposta não importa.
if (alone.length > 0) await run("kubectl", ["wait", "--for=delete", "namespace", "-l", "devlingo-verify=true", "--timeout=180s"], { timeout: 200_000 });
for (const question of alone) results.push(await runOne(question));
results.sort((a, b) => a.id.localeCompare(b.id));

// 4) o verificador não pode aceitar resposta errada: troca a resposta de cada desafio por cada uma das erradas
let mutations = 0;
let rejected = 0;
for (const result of results) {
  if (!result.holds) continue;
  for (let wrong = 0; wrong < result.options.length; wrong++) {
    if (wrong === result.answer) continue;
    mutations++;
    if (!verdict(result.holds, wrong)) rejected++;
  }
}

// 5) relatório
mkdirSync(reportDir, { recursive: true });
const passed = results.filter((r) => r.ok).length;
writeFileSync(path.join(reportDir, "report.json"), JSON.stringify({ cluster, passed, total: results.length, mutations: { total: mutations, rejected }, results }, null, 2));

const mark = (value) => (value ? "✅" : "❌");
const lines = [
  `## Kubernetes ${cluster.server}: ${passed} de ${results.length} desafios conferidos`,
  "",
  `Cluster kind descartável com ${nodes.length} nós (\`kubectl\` ${cluster.client}). Resposta errada trocada no lugar da certa: **${rejected} de ${mutations}** reprovadas pelo verificador.`,
  "",
  "| Desafio | Resultado | Tempo | O que foi observado |",
  "| --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.id} | ${mark(r.ok)} ${r.error ? `erro: ${r.error.replace(/\|/g, "/").slice(0, 200)}` : ""} | ${r.seconds} s | ${r.facts.map((f) => f.replace(/\|/g, "/")).join("<br>")} |`),
  "",
];
for (const r of results) {
  lines.push(`<details><summary>${r.id} ${r.title}</summary>`, "");
  r.options.forEach((text, index) => {
    const truth = r.holds ? r.holds[index] : "?";
    lines.push(`- ${index === r.answer ? "**resposta do desafio**" : "errada"}: ${truth === true ? "observado como VERDADEIRO" : truth === false ? "observado como FALSO" : "não avaliado"} — ${text}`);
  });
  lines.push("", "</details>", "");
}
const summary = lines.join("\n");
writeFileSync(path.join(reportDir, "resumo.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

console.log(`\n${passed} de ${results.length} desafios conferidos; ${rejected} de ${mutations} respostas erradas reprovadas`);
process.exit(passed === results.length && rejected === mutations ? 0 : 1);
