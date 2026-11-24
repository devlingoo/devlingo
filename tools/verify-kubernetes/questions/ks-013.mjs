// PodDisruptionBudget x kubectl drain x kubectl delete pod. Roda sozinho: cordona e esvazia nós de trabalho.
import { IMAGES } from "../lib.mjs";

const touched = new Set();

export default {
  id: "ks-013",
  title: "PDB barra o drain, mas não o kubectl delete pod",
  exclusive: true,
  timeoutMs: 480_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: app }
spec:
  replicas: 2
  selector: { matchLabels: { app: app } }
  template:
    metadata: { labels: { app: app } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sleep", "3600"]
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: app }
spec:
  minAvailable: 2
  selector: { matchLabels: { app: app } }
`);
    await lab.waitDeploymentReady("app", 2);
    await lab.waitFor("o PDB calcular que não pode perder nenhum pod", async () => {
      const pdb = await lab.get("poddisruptionbudget", "app");
      return pdb?.status?.currentHealthy === 2 && pdb.status.disruptionsAllowed === 0 ? pdb : null;
    });
    const live = async () => (await lab.list("pods", "app=app")).filter((pod) => !pod.metadata.deletionTimestamp);
    const victim = (await live())[0];
    const node = victim.spec.nodeName;
    touched.add(node);

    // 1) drain com o PDB: não consegue expulsar
    const drain = await lab.k(["drain", node, "--ignore-daemonsets", "--delete-emptydir-data", "--timeout=30s"], { timeout: 150_000 });
    const drainText = `${drain.stdout}${drain.stderr}`;
    const during = await live();
    const victimStillThere = during.some((pod) => pod.metadata.uid === victim.metadata.uid);
    const refusal = drainText.split("\n").find((line) => /disruption budget/i.test(line)) ?? "";

    // 2) kubectl delete pod direto: o PDB não impede
    await lab.ok(["uncordon", node]);
    const deleted = await lab.k(["delete", "pod", victim.metadata.name, "-n", lab.ns, "--wait=true"]);
    await lab.waitDeploymentReady("app", 2);

    // 3) controle: sem o PDB, o mesmo drain termina
    await lab.ok(["delete", "poddisruptionbudget", "app", "-n", lab.ns]);
    const target = (await live())[0].spec.nodeName;
    touched.add(target);
    const drainFree = await lab.k(["drain", target, "--ignore-daemonsets", "--delete-emptydir-data", "--timeout=120s"], { timeout: 240_000 });
    await lab.waitDeploymentReady("app", 2);

    const observed = {
      drainCode: drain.code,
      refusal: refusal.trim(),
      podsDuringDrain: during.length,
      victimStillThere,
      deleteCode: deleted.code,
      drainWithoutPdbCode: drainFree.code,
    };
    lab.fact(`drain do nó ${node} com PDB minAvailable 2: código ${observed.drainCode}; mensagem: "${observed.refusal.slice(0, 170)}"`);
    lab.fact(`durante o drain havia ${observed.podsDuringDrain} pods do Deployment (nenhum extra) e o pod original continuava lá = ${victimStillThere}`);
    lab.fact(`kubectl delete pod direto, com o mesmo PDB: código ${observed.deleteCode}; sem o PDB, o drain do nó ${target} terminou com código ${observed.drainWithoutPdbCode}`);
    return observed;
  },

  async cleanup(lab) {
    for (const node of touched) await lab.k(["uncordon", node]);
  },

  options: [
    { has: "termina normalmente", holds: (o) => o.drainCode === 0 },
    { has: "direto passa", holds: (o) => o.drainCode !== 0 && /disruption budget/i.test(o.refusal) && o.victimStillThere && o.deleteCode === 0 && o.drainWithoutPdbCode === 0 },
    { has: "ambos barrados", holds: (o) => o.deleteCode !== 0 },
    { has: "3º pod", holds: (o) => o.podsDuringDrain > 2 },
  ],
};
