// Liga cada desafio de Kubernetes (src/data/challenges.json) à sua verificação (questions/ks-NNN.mjs).
// Não precisa de cluster: o teste do bot (test/kubernetes.test.js) usa este arquivo para garantir que o texto
// dos desafios e as verificações não se separem sem ninguém notar.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, "../..");
export const TOPIC = "kubernetes";

export function loadChallenges() {
  const all = JSON.parse(readFileSync(path.join(REPO, "src/data/challenges.json"), "utf8"));
  return all.filter((c) => c.topic.id === TOPIC);
}

export async function loadQuestions() {
  const dir = path.join(here, "questions");
  const files = readdirSync(dir).filter((file) => /^ks-\d{3}\.mjs$/.test(file)).sort();
  const questions = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    questions.push({ ...mod.default, file });
  }
  return questions;
}

// Problemas de ligação entre a verificação e o desafio (lista vazia = tudo certo).
export function wiring(question, challenge) {
  const problems = [];
  if (!challenge) return [`${question.id}: não existe desafio com esse id em challenges.json`];
  if (question.file !== `${question.id}.mjs`) problems.push(`${question.id}: o arquivo ${question.file} não tem o nome do id`);
  if (!Array.isArray(question.options) || question.options.length !== challenge.options.length) {
    return [...problems, `${question.id}: a verificação tem ${question.options?.length} opções e o desafio tem ${challenge.options.length}`];
  }
  question.options.forEach((option, index) => {
    if (typeof option.holds !== "function") problems.push(`${question.id}: a opção ${index} não tem holds()`);
    if (!option.has || !challenge.options[index].includes(option.has)) {
      problems.push(`${question.id}: a opção ${index} do desafio ("${challenge.options[index]}") não contém "${option.has}"`);
    }
  });
  if (typeof question.run !== "function") problems.push(`${question.id}: falta run()`);
  return problems;
}

// A resposta do desafio está certa se a verificação diz que SÓ a opção marcada como correta é verdadeira.
export function verdict(holds, answer) {
  const trueOnes = holds.map((value, index) => (value ? index : -1)).filter((index) => index >= 0);
  return trueOnes.length === 1 && trueOnes[0] === answer;
}
