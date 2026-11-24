// Apoio do verificador de Kubernetes. Este código só roda no GitHub Actions, contra um cluster kind descartável
// (veja o README desta pasta): nada aqui foi feito para rodar no computador de ninguém.
import { spawn } from "node:child_process";

// Imagens do próprio projeto Kubernetes (registry.k8s.io): não têm o limite de pulls anônimos do Docker Hub.
export const IMAGES = {
  busybox: "registry.k8s.io/e2e-test-images/busybox:1.38.0-1",
  agnhost: "registry.k8s.io/e2e-test-images/agnhost:2.67.0",
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Roda um comando e devolve { code, stdout, stderr, ms }. Nunca lança: quem chama decide o que fazer com o código.
export function run(command, args, { input = "", env = {}, timeout = 180_000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({ code: -1, stdout, stderr: String(error), ms: 0 });
      return;
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdin.on("error", () => {}); // o processo pode fechar a entrada antes de ler tudo
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(error), ms: Date.now() - started });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - started });
    });
    child.stdin.end(input);
  });
}

export const isReady = (pod) =>
  Boolean(pod) &&
  pod.status?.phase === "Running" &&
  !pod.metadata?.deletionTimestamp &&
  (pod.status.containerStatuses ?? []).length > 0 &&
  pod.status.containerStatuses.every((c) => c.ready === true);

export const restartsOf = (pod) => pod?.status?.containerStatuses?.[0]?.restartCount ?? 0;

// Um "laboratório" por desafio: tem namespace próprio, junta o que foi observado e limpa tudo no fim.
export class Lab {
  constructor(id) {
    this.id = id;
    this.ns = id;
    this.namespaces = [];
    this.facts = [];
  }

  // Frase curta, em português, do que foi observado de verdade. Vai para o relatório.
  fact(text) {
    this.facts.push(text);
  }

  k(args, options) {
    return run("kubectl", args, options);
  }

  async ok(args, options) {
    const result = await this.k(args, options);
    if (result.code !== 0) {
      throw new Error(`kubectl ${args.join(" ")} falhou (${result.code}): ${(result.stderr || result.stdout).trim().slice(0, 600)}`);
    }
    return result;
  }

  async namespace(name = this.ns) {
    await this.ok(["create", "namespace", name]);
    await this.ok(["label", "namespace", name, "devlingo-verify=true"]);
    this.namespaces.push(name);
    return name;
  }

  // ns = null: o YAML já diz o namespace de cada objeto (o kubectl recusa um -n que discorde dele)
  apply(yaml, ns = this.ns) {
    return this.ok(ns ? ["apply", "-n", ns, "-f", "-"] : ["apply", "-f", "-"], { input: yaml });
  }

  // Um objeto (ou null se não existir).
  async get(kind, name, ns = this.ns) {
    const result = await this.k(["get", kind, name, "-n", ns, "-o", "json"]);
    return result.code === 0 ? JSON.parse(result.stdout) : null;
  }

  async list(kind, selector = "", ns = this.ns) {
    const args = ["get", kind, "-n", ns, "-o", "json"];
    if (selector) args.push("-l", selector);
    return JSON.parse((await this.ok(args)).stdout).items;
  }

  exec(pod, command, ns = this.ns) {
    return this.k(["exec", "-n", ns, pod, "--", ...command]);
  }

  // Repete fn até devolver algo "verdadeiro". Erros no meio do caminho só contam se o tempo acabar.
  async waitFor(what, fn, { timeout = 120_000, every = 1_000 } = {}) {
    const end = Date.now() + timeout;
    let lastError = null;
    for (;;) {
      try {
        const value = await fn();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      if (Date.now() > end) {
        throw new Error(`tempo esgotado esperando: ${what}${lastError ? ` (último erro: ${lastError.message})` : ""}`);
      }
      await sleep(every);
    }
  }

  async waitPodReady(name, ns = this.ns, timeout = 120_000) {
    return this.waitFor(`o pod ${ns}/${name} ficar pronto`, async () => {
      const pod = await this.get("pod", name, ns);
      return isReady(pod) ? pod : null;
    }, { timeout });
  }

  async waitDeploymentReady(name, replicas, ns = this.ns, timeout = 150_000) {
    return this.waitFor(`o deployment ${ns}/${name} ter ${replicas} pronto(s)`, async () => {
      const deployment = await this.get("deployment", name, ns);
      return deployment?.status?.readyReplicas === replicas && deployment.status.replicas === replicas ? deployment : null;
    }, { timeout });
  }

  // Quantos endereços PRONTOS o Service tem (lido dos EndpointSlices, que é o que o cluster usa de verdade).
  async readyEndpoints(service, ns = this.ns) {
    const slices = await this.list("endpointslices", `kubernetes.io/service-name=${service}`, ns);
    return slices.flatMap((slice) => slice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready === true).length;
  }

  // wait: espera os namespaces sumirem de vez (os cenários que mexem em nós precisam disso: um pod avulso ainda
  // terminando faz o próximo "kubectl drain" recusar o nó).
  async cleanup({ wait = false } = {}) {
    for (const ns of this.namespaces) await this.k(["delete", "namespace", ns, "--wait=false", "--ignore-not-found"]);
    if (wait) for (const ns of this.namespaces) await this.k(["wait", "--for=delete", `namespace/${ns}`, "--timeout=180s"], { timeout: 200_000 });
  }
}
