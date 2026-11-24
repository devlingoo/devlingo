// Passar do limits.memory (OOMKilled) x passar do limits.cpu (throttling), com controle de memória folgada.
import { IMAGES, restartsOf } from "../lib.mjs";

// segura ~100 MB numa variável do shell e dorme
const memoryHog = (name, limit) => `
apiVersion: v1
kind: Pod
metadata: { name: ${name} }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sh", "-c", "x=$(yes | head -c 100000000); echo guardei ${"$"}{#x} bytes; sleep 3600"]
      resources:
        requests: { memory: 16Mi }
        limits: { memory: ${limit} }`;

export default {
  id: "ks-008",
  title: "Estourar limits.memory mata o contêiner (OOMKilled)",
  timeoutMs: 360_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`${memoryHog("estoura", "32Mi")}
---${memoryHog("folgado", "400Mi")}
---
apiVersion: v1
kind: Pod
metadata: { name: cpu }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sh", "-c", "while :; do :; done"]
      resources:
        limits: { cpu: 100m, memory: 64Mi }
`);
    const started = await lab.waitFor("o pod estoura ser agendado", async () => {
      const pod = await lab.get("pod", "estoura");
      return pod?.spec?.nodeName ? pod : null;
    });
    const nodeBefore = started.spec.nodeName;
    const killed = await lab.waitFor("2 reinícios por OOMKilled", async () => {
      const pod = await lab.get("pod", "estoura");
      const status = pod.status?.containerStatuses?.[0];
      return status?.lastState?.terminated?.reason === "OOMKilled" && restartsOf(pod) >= 2 ? pod : null;
    }, { timeout: 200_000, every: 3_000 });
    const terminated = killed.status.containerStatuses[0].lastState.terminated;

    // controle: com memória folgada o mesmo programa vive
    await lab.waitPodReady("folgado");
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    const roomy = await lab.get("pod", "folgado");

    // CPU: passou do limite, é segurado (throttling), não é morto
    await lab.waitPodReady("cpu");
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    const cpu = await lab.get("pod", "cpu");
    const cpuStat = (await lab.exec("cpu", ["cat", "/sys/fs/cgroup/cpu.stat"])).stdout;
    const throttled = Number(/nr_throttled (\d+)/.exec(cpuStat)?.[1] ?? NaN);

    const observed = {
      reason: terminated.reason,
      exitCode: terminated.exitCode,
      restarts: restartsOf(killed),
      nodeSame: killed.spec.nodeName === nodeBefore,
      limitAfter: killed.spec.containers[0].resources.limits.memory,
      roomyRestarts: restartsOf(roomy),
      roomyRunning: roomy.status.phase === "Running" && roomy.status.containerStatuses[0].ready === true,
      cpuRestarts: restartsOf(cpu),
      cpuRunning: cpu.status.phase === "Running",
      cpuThrottled: throttled,
    };
    lab.fact(`limite de memória 32Mi: último estado "${observed.reason}", código ${observed.exitCode}, ${observed.restarts} reinícios, no mesmo nó = ${observed.nodeSame}, limite continua ${observed.limitAfter}`);
    lab.fact(`controle com limite de 400Mi: ${observed.roomyRunning ? "rodando" : "não rodando"}, ${observed.roomyRestarts} reinícios`);
    lab.fact(`limite de CPU 100m com laço infinito: ${observed.cpuRunning ? "Running" : "não Running"}, ${observed.cpuRestarts} reinícios, nr_throttled = ${Number.isNaN(throttled) ? "(cgroup sem cpu.stat)" : throttled}`);
    return observed;
  },

  options: [
    { has: "só desacelerado", holds: (o) => o.reason !== "OOMKilled" && o.restarts === 0 },
    { has: "movido para um nó", holds: (o) => !o.nodeSame },
    { has: "OOMKilled, código 137", holds: (o) => o.reason === "OOMKilled" && o.exitCode === 137 && o.restarts >= 2 && o.roomyRestarts === 0 },
    { has: "aumenta o limite", holds: (o) => o.limitAfter !== "32Mi" },
  ],
};
