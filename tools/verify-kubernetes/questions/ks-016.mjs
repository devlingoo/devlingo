// Job que sempre falha, com backoffLimit 2: restartPolicy Never (um pod por tentativa) x OnFailure (reinícios no mesmo pod).
import { IMAGES, restartsOf } from "../lib.mjs";

const job = (name, restartPolicy) => `
apiVersion: batch/v1
kind: Job
metadata: { name: ${name} }
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: ${restartPolicy}
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sh", "-c", "exit 1"]`;

export default {
  id: "ks-016",
  title: "backoffLimit 2 com restartPolicy Never cria 3 pods",
  timeoutMs: 360_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`${job("nunca", "Never")}
---${job("onfailure", "OnFailure")}
`);
    const failedJob = (name) => async () => {
      const found = await lab.get("job", name);
      const condition = found?.status?.conditions?.find((c) => c.type === "Failed" && c.status === "True");
      return condition ? { reason: condition.reason, failed: found.status.failed ?? 0 } : null;
    };
    // Com OnFailure o Job apaga os pods quando desiste, então o pod é acompanhado enquanto o Job roda.
    const seen = { names: new Set(), maxRestarts: 0 };
    const { never, onFailure } = await lab.waitFor("os dois Jobs falharem de vez", async () => {
      for (const pod of await lab.list("pods", "job-name=onfailure")) {
        seen.names.add(pod.metadata.name);
        seen.maxRestarts = Math.max(seen.maxRestarts, restartsOf(pod));
      }
      const a = await failedJob("nunca")();
      const b = await failedJob("onfailure")();
      return a && b ? { never: a, onFailure: b } : null;
    }, { timeout: 240_000, every: 1_000 });
    const neverPods = await lab.list("pods", "job-name=nunca");

    const observed = {
      neverFailed: true,
      neverReason: never.reason,
      neverPods: neverPods.length,
      neverPhases: neverPods.map((p) => p.status.phase),
      onFailureReason: onFailure.reason,
      onFailurePodsSeen: seen.names.size,
      onFailureMaxRestarts: seen.maxRestarts,
    };
    lab.fact(`backoffLimit 2 + restartPolicy Never: o Job terminou Failed (${observed.neverReason}) depois de criar ${observed.neverPods} pods (fases: ${observed.neverPhases.join(", ")})`);
    lab.fact(`contraste, restartPolicy OnFailure: Failed (${observed.onFailureReason}); durante o Job apareceu ${observed.onFailurePodsSeen} pod(s) e o contêiner chegou a ${observed.onFailureMaxRestarts} reinício(s)`);
    return observed;
  },

  options: [
    { has: "1 pod:", holds: (o) => o.neverPods === 1 },
    { has: "2 pods:", holds: (o) => o.neverPods === 2 },
    { has: "3 pods:", holds: (o) => o.neverPods === 3 && o.neverReason === "BackoffLimitExceeded" },
    { has: "Quantos forem precisos", holds: (o) => !o.neverFailed },
  ],
};
