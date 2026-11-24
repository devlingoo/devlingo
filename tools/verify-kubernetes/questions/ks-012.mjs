// Taints: qual efeito expulsa pods que já estão no nó. Roda sozinho: mexe nos taints de um nó de trabalho.
import { IMAGES, isReady, sleep } from "../lib.mjs";

const pod = (name, node, tolerations = "") => `
apiVersion: v1
kind: Pod
metadata: { name: ${name} }
spec:
  terminationGracePeriodSeconds: 1
  nodeSelector: { kubernetes.io/hostname: ${node} }
${tolerations}  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]`;

let worker = null;

export default {
  id: "ks-012",
  title: "Só o NoExecute expulsa pods que já rodam no nó",
  exclusive: true,
  timeoutMs: 360_000,

  async run(lab) {
    await lab.namespace();
    const nodes = await lab.ok(["get", "nodes", "-l", "!node-role.kubernetes.io/control-plane", "-o", "jsonpath={.items[*].metadata.name}"]);
    worker = nodes.stdout.trim().split(/\s+/)[0];
    const tolerates = "  tolerations: [{ key: ks, operator: Exists }]\n";
    await lab.apply(`${pod("sem-toleration-a", worker)}
---${pod("sem-toleration-b", worker)}
---${pod("tolerante", worker, tolerates)}
`);
    for (const name of ["sem-toleration-a", "sem-toleration-b", "tolerante"]) await lab.waitPodReady(name);
    const uids = {};
    for (const p of await lab.list("pods")) uids[p.metadata.name] = p.metadata.uid;

    const alive = async () => {
      const found = {};
      for (const p of await lab.list("pods")) found[p.metadata.name] = isReady(p) && p.metadata.uid === uids[p.metadata.name];
      return found;
    };
    const taint = (effect) => lab.ok(["taint", "nodes", worker, `ks=1:${effect}`, "--overwrite"]);

    await taint("PreferNoSchedule");
    await sleep(15_000);
    const afterPrefer = await alive();

    const noSchedule = await taint("NoSchedule");
    await sleep(15_000);
    const afterNoSchedule = await alive();
    // um pod novo (sem toleration) não entra no nó marcado
    await lab.apply(pod("novo", worker));
    const pending = await lab.waitFor("o pod novo ficar sem agendar", async () => {
      const events = await lab.ok(["get", "events", "-n", lab.ns, "--field-selector", "reason=FailedScheduling", "-o", "json"]);
      return JSON.parse(events.stdout).items.find((e) => /untolerated taint/.test(e.message ?? "")) ?? null;
    }, { timeout: 90_000, every: 3_000 });
    const novoPhase = (await lab.get("pod", "novo")).status.phase;

    await taint("NoExecute");
    await lab.waitFor("os pods sem toleration serem expulsos", async () => {
      const found = await alive();
      return !found["sem-toleration-a"] && !found["sem-toleration-b"];
    }, { timeout: 90_000, every: 2_000 });
    const afterNoExecute = await alive();
    const remaining = (await lab.list("pods")).filter((p) => !p.metadata.deletionTimestamp).map((p) => p.metadata.name).sort();

    const observed = {
      taintCode: noSchedule.code,
      afterPreferGone: !afterPrefer["sem-toleration-a"] || !afterPrefer["sem-toleration-b"],
      afterNoScheduleGone: !afterNoSchedule["sem-toleration-a"] || !afterNoSchedule["sem-toleration-b"],
      afterNoExecuteGone: !afterNoExecute["sem-toleration-a"] && !afterNoExecute["sem-toleration-b"],
      tolerantStays: afterNoExecute["tolerante"] === true,
      novoPhase,
      pendingMessage: pending.message,
      remaining,
    };
    lab.fact(`nó ${worker}, 2 pods sem toleration e 1 com toleration; depois de PreferNoSchedule: nenhum expulso = ${!observed.afterPreferGone}; depois de NoSchedule: nenhum expulso = ${!observed.afterNoScheduleGone}`);
    lab.fact(`pod novo sem toleration com o NoSchedule: fase ${novoPhase}, evento "${observed.pendingMessage.slice(0, 160)}"`);
    lab.fact(`depois de NoExecute: os pods sem toleration foram expulsos = ${observed.afterNoExecuteGone}; o tolerante continua = ${observed.tolerantStays}; sobraram: ${remaining.join(", ")}`);
    return observed;
  },

  async cleanup(lab) {
    if (worker) await lab.k(["taint", "nodes", worker, "ks-"]); // tira todos os taints com a chave ks
  },

  options: [
    { has: "NoSchedule", holds: (o) => o.afterNoScheduleGone },
    { has: "NoExecute", holds: (o) => o.afterNoExecuteGone && o.tolerantStays },
    { has: "PreferNoSchedule", holds: (o) => o.afterPreferGone },
    { has: "Nenhum", holds: (o) => !o.afterNoExecuteGone },
  ],
};
