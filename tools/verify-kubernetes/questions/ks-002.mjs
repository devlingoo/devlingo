// Apagar um pod que pertence a um Deployment de 3 réplicas.
import { IMAGES, isReady } from "../lib.mjs";

export default {
  id: "ks-002",
  title: "Apagar um pod de um Deployment",
  timeoutMs: 240_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 3
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sleep", "3600"]
`);
    await lab.waitDeploymentReady("web", 3);
    const before = (await lab.list("pods", "app=web")).map((pod) => pod.metadata.name).sort();
    const victim = before[0];
    const deleted = await lab.k(["delete", "pod", victim, "-n", lab.ns, "--wait=true"]);

    const after = await lab.waitFor("3 pods prontos de novo", async () => {
      const pods = (await lab.list("pods", "app=web")).filter(isReady);
      return pods.length === 3 ? pods : null;
    });
    const names = after.map((pod) => pod.metadata.name).sort();
    const deployment = await lab.get("deployment", "web");

    const observed = {
      deleteCode: deleted.code,
      deleteOut: deleted.stdout.trim(),
      victimBack: names.includes(victim),
      readyAfter: names.length,
      newPods: names.filter((name) => !before.includes(name)).length,
      specReplicas: deployment.spec.replicas,
      deploymentExists: Boolean(deployment),
    };
    lab.fact(`apaguei ${victim} (kubectl saiu com código ${observed.deleteCode}); sem nenhum outro comando, voltaram ${observed.readyAfter} pods prontos, ${observed.newPods} deles com nome novo; spec.replicas continua ${observed.specReplicas}`);
    return observed;
  },

  options: [
    { has: "ReplicaSet cria um pod novo", holds: (o) => o.deleteCode === 0 && o.readyAfter === 3 && o.newPods === 1 && !o.victimBack },
    { has: "passa a ter 2 réplicas", holds: (o) => o.readyAfter === 2 },
    { has: "kubectl recusa", holds: (o) => o.deleteCode !== 0 },
    { has: "inteiro é apagado", holds: (o) => !o.deploymentExists },
  ],
};
