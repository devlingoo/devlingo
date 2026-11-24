const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const challenges = require("../src/utils/challenges");

// Os desafios de Kubernetes foram conferidos num cluster de verdade (tools/verify-kubernetes, no GitHub Actions).
// Estes testes NÃO precisam de cluster: garantem que o texto dos desafios e as verificações não se separem sem ninguém notar.
const catalogUrl = pathToFileURL(path.join(__dirname, "..", "tools", "verify-kubernetes", "catalog.mjs")).href;
const kubernetes = challenges.list.filter((c) => c.topic.id === "kubernetes");

test("kubernetes: 16 desafios (ks-001 a ks-016), 4 em cada nível, com a resposta em posições equilibradas", () => {
  assert.equal(kubernetes.length, 16);
  assert.deepEqual(kubernetes.map((c) => c.id), Array.from({ length: 16 }, (_, i) => `ks-${String(i + 1).padStart(3, "0")}`));
  for (const level of challenges.DIFFICULTIES) {
    assert.equal(kubernetes.filter((c) => c.difficulty === level.id).length, 4, `nível ${level.id}`);
  }
  const positions = [0, 1, 2, 3].map((p) => kubernetes.filter((c) => c.answer === p).length);
  assert.deepEqual(positions, [4, 4, 4, 4], "a resposta certa tem de ficar 4 vezes em cada posição");
});

test("kubernetes: a opção certa nunca é a maior (não dá para acertar só pelo tamanho)", () => {
  for (const c of kubernetes) {
    const longest = Math.max(...c.options.map((o) => o.length));
    assert.ok(c.options[c.answer].length < longest, `${c.id}: a opção certa é a mais longa`);
  }
});

test("kubernetes: cada desafio tem a sua verificação, com as mesmas opções (o texto bate)", async () => {
  const { loadChallenges, loadQuestions, wiring } = await import(catalogUrl);
  const questions = await loadQuestions();
  const fromFile = new Map(loadChallenges().map((c) => [c.id, c]));
  assert.equal(questions.length, kubernetes.length, "uma verificação por desafio");
  for (const question of questions) {
    assert.deepEqual(wiring(question, fromFile.get(question.id)), [], `${question.id}`);
  }
});

test("kubernetes: o executor aceita só a resposta que a verificação confirma", async () => {
  const { verdict } = await import(catalogUrl);
  assert.equal(verdict([false, true, false, false], 1), true);
  assert.equal(verdict([false, true, false, false], 2), false, "resposta errada");
  assert.equal(verdict([true, true, false, false], 1), false, "duas opções verdadeiras: o desafio é ambíguo");
  assert.equal(verdict([false, false, false, false], 1), false, "nenhuma verdadeira: a resposta não foi confirmada");
});

test("kubernetes: o curso e a área existem e o assunto está no curso", () => {
  const courses = require("../src/utils/courses");
  const areas = require("../src/utils/areas");
  const course = courses.list.find((c) => c.id === "kubernetes");
  assert.ok(course, "falta o curso kubernetes");
  assert.deepEqual(course.modules, ["kubernetes"]);
  assert.ok(areas.list.some((a) => a.id === "devops" && a.topics.includes("kubernetes")), "kubernetes tem de estar na área devops");
});
