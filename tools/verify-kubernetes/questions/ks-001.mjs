// Contêiner que sai com erro, com a política de reinício padrão (Always).
import { IMAGES, restartsOf } from "../lib.mjs";

export default {
  id: "ks-001",
  title: "Contêiner que falha reinicia dentro do mesmo Pod",
  timeoutMs: 240_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`
apiVersion: v1
kind: Pod
metadata: { name: falha }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sh", "-c", "exit 1"]
---
apiVersion: v1
kind: Pod
metadata: { name: controle }
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sh", "-c", "exit 1"]
`);
    const first = await lab.waitFor("o pod falha existir", () => lab.get("pod", "falha"));
    const phases = new Set([first.status?.phase]);
    let waitingReason = null;
    const last = await lab.waitFor("2 reinícios do contêiner", async () => {
      const pod = await lab.get("pod", "falha");
      phases.add(pod.status?.phase);
      waitingReason = pod.status?.containerStatuses?.[0]?.state?.waiting?.reason ?? waitingReason;
      return restartsOf(pod) >= 2 ? pod : null;
    }, { timeout: 180_000, every: 2_000 });

    // controle: com restartPolicy Never o mesmo contêiner leva o Pod a Failed
    const never = await lab.waitFor("o pod controle terminar", async () => {
      const pod = await lab.get("pod", "controle");
      return ["Failed", "Succeeded"].includes(pod.status?.phase) ? pod : null;
    }, { timeout: 90_000 });

    const observed = {
      uidSame: last.metadata.uid === first.metadata.uid,
      nameSame: last.metadata.name === first.metadata.name,
      restarts: restartsOf(last),
      phases: [...phases],
      waitingReason,
      exitCode: last.status.containerStatuses[0].lastState?.terminated?.exitCode ?? null,
      neverPhase: never.status.phase,
      neverRestarts: restartsOf(never),
    };
    lab.fact(`pod "falha" (política padrão): mesmo nome e mesmo UID depois de ${observed.restarts} reinícios, fases vistas: ${observed.phases.join("/")}, estado de espera: ${waitingReason}, código de saída anterior: ${observed.exitCode}`);
    lab.fact(`controle com restartPolicy Never: fase ${observed.neverPhase}, ${observed.neverRestarts} reinícios`);
    return observed;
  },

  options: [
    { has: "Apaga o Pod e cria outro", holds: (o) => !o.uidSame || !o.nameSame },
    { has: "Marca o Pod como Failed", holds: (o) => o.phases.includes("Failed") },
    { has: "Reinicia o contêiner no mesmo Pod", holds: (o) => o.uidSame && o.nameSame && o.restarts >= 2 },
    { has: "Não reinicia nada", holds: (o) => o.restarts === 0 },
  ],
};
