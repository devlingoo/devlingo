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
    const never = await lab.waitFor("o Job nunca falhar de vez", failedJob("nunca"), { timeout: 240_000, every: 3_000 });
    const onFailure = await lab.waitFor("o Job onfailure falhar de vez", failedJob("onfailure"), { timeout: 240_000, every: 3_000 });
    const neverPods = await lab.list("pods", "job-name=nunca");
    const onFailurePods = await lab.list("pods", "job-name=onfailure");

    const observed = {
      neverFailed: true,
      neverReason: never.reason,
      neverPods: neverPods.length,
      neverPhases: neverPods.map((p) => p.status.phase),
      onFailureReason: onFailure.reason,
      onFailurePods: onFailurePods.length,
      onFailureRestarts: onFailurePods.map(restartsOf),
    };
    lab.fact(`backoffLimit 2 + restartPolicy Never: o Job terminou Failed (${observed.neverReason}) depois de criar ${observed.neverPods} pods (fases: ${observed.neverPhases.join(", ")})`);
    lab.fact(`contraste, restartPolicy OnFailure: Failed (${observed.onFailureReason}) com ${observed.onFailurePods} pod(s), reinícios do contêiner: ${observed.onFailureRestarts.join(", ")}`);
    return observed;
  },

  options: [
    { has: "1 pod:", holds: (o) => o.neverPods === 1 },
    { has: "2 pods:", holds: (o) => o.neverPods === 2 },
    { has: "3 pods:", holds: (o) => o.neverPods === 3 && o.neverReason === "BackoffLimitExceeded" },
    { has: "Quantos forem precisos", holds: (o) => !o.neverFailed },
  ],
};
