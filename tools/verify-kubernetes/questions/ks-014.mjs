// StatefulSet com volumeClaimTemplates: apagar o pod, apagar o StatefulSet e recriá-lo.
import { IMAGES, isReady } from "../lib.mjs";

const statefulSet = `
apiVersion: v1
kind: Service
metadata: { name: db }
spec: { clusterIP: None, selector: { app: db }, ports: [{ port: 80 }] }
---
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db }
spec:
  serviceName: db
  replicas: 2
  selector: { matchLabels: { app: db } }
  template:
    metadata: { labels: { app: db } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sleep", "3600"]
          volumeMounts: [{ name: data, mountPath: /data }]
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources: { requests: { storage: 16Mi } }
`;

export default {
  id: "ks-014",
  title: "Apagar o StatefulSet não apaga os PVCs",
  timeoutMs: 420_000,

  async run(lab) {
    await lab.namespace();
    const ready = (count) => async () => {
      const set = await lab.get("statefulset", "db");
      return set?.status?.readyReplicas === count ? set : null;
    };
    await lab.apply(statefulSet);
    await lab.waitFor("os 2 pods do StatefulSet ficarem prontos", ready(2), { timeout: 240_000, every: 2_000 });
    const names = (await lab.list("pods", "app=db")).map((pod) => pod.metadata.name).sort();
    const firstUid = (await lab.get("pod", "db-0")).metadata.uid;
    await lab.ok(["exec", "-n", lab.ns, "db-0", "--", "sh", "-c", "echo ola > /data/marker"]);

    // apagar o pod: volta com o mesmo nome e o mesmo volume
    await lab.ok(["delete", "pod", "db-0", "-n", lab.ns, "--wait=true"]);
    const back = await lab.waitFor("db-0 voltar", async () => {
      const pod = await lab.get("pod", "db-0");
      return isReady(pod) ? pod : null;
    }, { timeout: 120_000 });
    const markerAfterPodDelete = (await lab.exec("db-0", ["cat", "/data/marker"])).stdout.trim();

    // apagar o StatefulSet
    const deleted = await lab.k(["delete", "statefulset", "db", "-n", lab.ns, "--wait=true"], { timeout: 180_000 });
    await lab.waitFor("os pods do StatefulSet sumirem", async () => (await lab.list("pods", "app=db")).length === 0, { timeout: 90_000 });
    const claims = await lab.list("persistentvolumeclaims");

    // recriar o StatefulSet: db-0 volta a montar o mesmo volume, com o dado
    await lab.apply(statefulSet);
    await lab.waitFor("os pods voltarem depois de recriar o StatefulSet", ready(2), { timeout: 240_000, every: 2_000 });
    const markerAfterRecreate = (await lab.exec("db-0", ["cat", "/data/marker"])).stdout.trim();

    const observed = {
      podNames: names,
      podSameName: back.metadata.name === "db-0",
      podNewUid: back.metadata.uid !== firstUid,
      markerAfterPodDelete,
      deleteCode: deleted.code,
      claims: claims.map((pvc) => ({ name: pvc.metadata.name, phase: pvc.status.phase, terminating: Boolean(pvc.metadata.deletionTimestamp) })),
      markerAfterRecreate,
    };
    lab.fact(`pods do StatefulSet: ${names.join(", ")}; apaguei db-0 e voltou com o mesmo nome (novo UID = ${observed.podNewUid}) e o dado continuou lá: "${markerAfterPodDelete}"`);
    lab.fact(`kubectl delete statefulset db (código ${observed.deleteCode}): PVCs que sobraram = ${observed.claims.map((c) => `${c.name} ${c.phase}${c.terminating ? " Terminating" : ""}`).join(", ") || "nenhum"}`);
    lab.fact(`depois de recriar o StatefulSet, db-0 leu do volume: "${markerAfterRecreate}"`);
    return observed;
  },

  options: [
    { has: "apagados junto", holds: (o) => o.claims.length === 0 },
    { has: "Terminating", holds: (o) => o.claims.some((c) => c.terminating) },
    { has: "recusa apagar", holds: (o) => o.deleteCode !== 0 },
    { has: "Continuam lá", holds: (o) => o.deleteCode === 0 && o.claims.length === 2 && o.claims.every((c) => c.phase === "Bound" && !c.terminating) && o.markerAfterRecreate === "ola" },
  ],
};
