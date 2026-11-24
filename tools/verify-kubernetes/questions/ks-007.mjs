// readinessProbe que falha sempre (e, de contraste, livenessProbe que falha sempre e uma readinessProbe que passa).
import { IMAGES, restartsOf } from "../lib.mjs";

const deploy = (name, probes) => `
apiVersion: apps/v1
kind: Deployment
metadata: { name: ${name} }
spec:
  replicas: 1
  selector: { matchLabels: { app: ${name} } }
  template:
    metadata: { labels: { app: ${name} } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sleep", "3600"]
${probes}`;

const exec = (code) => `["sh", "-c", "exit ${code}"]`;

export default {
  id: "ks-007",
  title: "readinessProbe falhando tira o pod do Service, sem reiniciar",
  timeoutMs: 300_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`${deploy("pronto-falha", `          readinessProbe: { exec: { command: ${exec(1)} }, periodSeconds: 2 }`)}
---${deploy("pronto-ok", `          readinessProbe: { exec: { command: ${exec(0)} }, periodSeconds: 2 }`)}
---${deploy("viva-falha", `          livenessProbe: { exec: { command: ${exec(1)} }, initialDelaySeconds: 2, periodSeconds: 2, failureThreshold: 2 }`)}
---
apiVersion: v1
kind: Service
metadata: { name: pronto-falha }
spec: { selector: { app: pronto-falha }, ports: [{ port: 80 }] }
---
apiVersion: v1
kind: Service
metadata: { name: pronto-ok }
spec: { selector: { app: pronto-ok }, ports: [{ port: 80 }] }
`);
    const podOf = async (app) => (await lab.list("pods", `app=${app}`)).find((pod) => !pod.metadata.deletionTimestamp);
    const first = await lab.waitFor("o pod pronto-falha existir", () => podOf("pronto-falha"));
    await lab.waitFor("o pod pronto-ok ficar pronto", async () => (await podOf("pronto-ok"))?.status?.containerStatuses?.[0]?.ready === true);
    // a livenessProbe mata o contêiner: espera o primeiro reinício, o que também dá tempo de sobra à readinessProbe falhar
    await lab.waitFor("a livenessProbe reiniciar o contêiner", async () => restartsOf(await podOf("viva-falha")) >= 1, { timeout: 150_000, every: 2_000 });

    const failing = await podOf("pronto-falha");
    const status = failing.status.containerStatuses[0];
    const failingDeployment = await lab.get("deployment", "pronto-falha");
    const observed = {
      phase: failing.status.phase,
      ready: status.ready,
      readyColumn: `${failing.status.containerStatuses.filter((c) => c.ready).length}/${failing.status.containerStatuses.length}`,
      restarts: restartsOf(failing),
      uidSame: failing.metadata.uid === first.metadata.uid,
      deploymentReady: failingDeployment.status.readyReplicas ?? 0,
      endpointsFailing: await lab.readyEndpoints("pronto-falha"),
      endpointsControl: await lab.readyEndpoints("pronto-ok"),
      livenessRestarts: restartsOf(await podOf("viva-falha")),
    };
    lab.fact(`readinessProbe falhando: pod ${observed.phase}, READY ${observed.readyColumn}, ${observed.restarts} reinícios, mesmo UID = ${observed.uidSame}, endereços prontos no Service = ${observed.endpointsFailing}`);
    lab.fact(`controle (readinessProbe que passa): ${observed.endpointsControl} endereço pronto; livenessProbe falhando: ${observed.livenessRestarts} reinício(s)`);
    return observed;
  },

  options: [
    { has: "fora do Service", holds: (o) => o.phase === "Running" && !o.ready && o.restarts === 0 && o.endpointsFailing === 0 && o.endpointsControl === 1 },
    { has: "Reinicia o contêiner sem parar", holds: (o) => o.restarts > 0 },
    { has: "Apaga o pod", holds: (o) => !o.uidSame },
    { has: "Muda o pod para Failed", holds: (o) => o.phase === "Failed" },
  ],
};
