// RollingUpdate com maxSurge: 1 e maxUnavailable: 0 (4 réplicas), medido durante uma atualização de verdade.
// De contraste, a estratégia Recreate, que é o que a opção "caem todos e depois sobem todos" descreve.
import { IMAGES, sleep } from "../lib.mjs";

const deploy = (name, replicas, strategy, version) => `
apiVersion: apps/v1
kind: Deployment
metadata: { name: ${name} }
spec:
  replicas: ${replicas}
  selector: { matchLabels: { app: ${name} } }
  strategy:
${strategy}
  template:
    metadata: { labels: { app: ${name} } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          env: [{ name: VERSAO, value: "${version}" }]
          command: ["sh", "-c", "sleep 8; touch /tmp/pronto; sleep 3600"]
          readinessProbe: { exec: { command: ["test", "-f", "/tmp/pronto"] }, periodSeconds: 1 }`;

const rolling = `    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }`;
const recreate = "    type: Recreate";

// Atualiza o template e mede, a cada ~0,3 s, o total de pods e quantos estão disponíveis, até terminar.
async function measure(lab, name, replicas, strategy) {
  await lab.apply(deploy(name, replicas, strategy, "1"));
  await lab.waitDeploymentReady(name, replicas);
  const generation = (await lab.get("deployment", name)).metadata.generation;
  await lab.apply(deploy(name, replicas, strategy, "2"));
  const target = generation + 1;

  let maxPods = 0;
  let minAvailable = replicas;
  let samples = 0;
  const end = Date.now() + 180_000;
  for (;;) {
    const deployment = await lab.get("deployment", name);
    const pods = (await lab.list("pods", `app=${name}`)).filter((pod) => !pod.metadata.deletionTimestamp);
    maxPods = Math.max(maxPods, pods.length, deployment.status.replicas ?? 0);
    minAvailable = Math.min(minAvailable, deployment.status.availableReplicas ?? 0);
    samples++;
    const done = deployment.status.observedGeneration >= target && deployment.status.updatedReplicas === replicas && deployment.status.replicas === replicas && deployment.status.availableReplicas === replicas;
    if (done) break;
    if (Date.now() > end) throw new Error(`a atualização de ${name} não terminou em 180 s`);
    await sleep(300);
  }
  return { maxPods, minAvailable, samples };
}

export default {
  id: "ks-011",
  title: "RollingUpdate com maxSurge 1 e maxUnavailable 0",
  timeoutMs: 420_000,

  async run(lab) {
    await lab.namespace();
    const rollingResult = await measure(lab, "web", 4, rolling);
    const recreateResult = await measure(lab, "recria", 4, recreate);
    lab.fact(`RollingUpdate (4 réplicas, maxSurge 1, maxUnavailable 0), ${rollingResult.samples} medições durante a atualização: no máximo ${rollingResult.maxPods} pods ao mesmo tempo e no mínimo ${rollingResult.minAvailable} disponíveis`);
    lab.fact(`contraste, strategy Recreate: no máximo ${recreateResult.maxPods} pods e no mínimo ${recreateResult.minAvailable} disponíveis`);
    return { rolling: rollingResult, recreate: recreateResult };
  },

  options: [
    { has: "caem juntos", holds: (o) => o.rolling.minAvailable === 0 },
    { has: "8 pods ao mesmo tempo", holds: (o) => o.rolling.maxPods >= 8 },
    { has: "só 3 pods prontos", holds: (o) => o.rolling.minAvailable <= 3 },
    { has: "menos de 4 pods prontos nem mais de 5", holds: (o) => o.rolling.minAvailable === 4 && o.rolling.maxPods === 5 && o.recreate.minAvailable === 0 },
  ],
};
