// Service com ENDPOINTS vazio: selector que não bate x targetPort errado x Service correto.
import { IMAGES } from "../lib.mjs";

export default {
  id: "ks-005",
  title: "Service sem endpoints: selector errado",
  timeoutMs: 240_000,

  async run(lab) {
    await lab.namespace();
    const service = (name, selector, targetPort) => `
apiVersion: v1
kind: Service
metadata: { name: ${name} }
spec:
  selector: { app: ${selector} }
  ports: [{ port: 80, targetPort: ${targetPort} }]`;
    await lab.apply(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  replicas: 1
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.agnhost}
          args: ["netexec", "--http-port=8080"]
---
apiVersion: v1
kind: Pod
metadata: { name: cliente }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]
---${service("api-certo", "api", 8080)}
---${service("api-seletor-errado", "apii", 8080)}
---${service("api-porta-errada", "api", 9999)}
`);
    await lab.waitDeploymentReady("api", 1);
    await lab.waitPodReady("cliente");
    // espera os Services bons terem endereço; só então o "vazio" do Service de selector errado vale como observação
    await lab.waitFor("endpoints dos Services com selector certo", async () => (await lab.readyEndpoints("api-certo")) === 1 && (await lab.readyEndpoints("api-porta-errada")) === 1);

    const call = async (svc) => (await lab.exec("cliente", ["wget", "-q", "-O-", "-T", "4", `http://${svc}/hostname`])).code === 0;
    // o que o desafio mostra: a saída de "kubectl describe service" do Service sem endereços
    const describe = (await lab.k(["describe", "service", "api-seletor-errado", "-n", lab.ns])).stdout;
    const describeLines = describe.split("\n").filter((line) => /^(Selector|Endpoints):/.test(line)).map((line) => line.replace(/\s+/g, " ").trim());
    const slices = await lab.k(["get", "endpointslices", "-l", "kubernetes.io/service-name=api-seletor-errado", "-n", lab.ns]);
    const legacy = await lab.k(["get", "endpoints", "-n", lab.ns]);
    const certo = await lab.get("service", "api-certo");
    const observed = {
      certo: await lab.readyEndpoints("api-certo"),
      seletorErrado: await lab.readyEndpoints("api-seletor-errado"),
      portaErrada: await lab.readyEndpoints("api-porta-errada"),
      certoType: certo.spec.type,
      callCerto: await call("api-certo"),
      callPortaErrada: await call("api-porta-errada"),
      describeNone: describeLines.some((line) => /^Endpoints: <none>$/.test(line)),
      describeLines,
    };
    lab.fact(`endpoints prontos: Service certo ${observed.certo} (tipo ${observed.certoType}), selector errado ${observed.seletorErrado}, targetPort errado ${observed.portaErrada}`);
    lab.fact(`pedido do pod cliente: Service certo ${observed.callCerto ? "respondeu" : "falhou"}, targetPort errado ${observed.callPortaErrada ? "respondeu" : "falhou"}`);
    lab.fact(`kubectl describe service do Service de selector errado: ${observed.describeLines.join(" | ")}`);
    lab.fact(`kubectl get endpointslices desse Service: "${slices.stdout.trim().split("\n").slice(1).join(" / ").replace(/\s+/g, " ")}"; kubectl get endpoints no namespace: "${`${legacy.stdout}${legacy.stderr}`.trim().replace(/\s+/g, " ").slice(0, 200)}"`);
    return observed;
  },

  options: [
    { has: "targetPort", holds: (o) => o.portaErrada === 0 },
    { has: "selector do Service não bate", holds: (o) => o.seletorErrado === 0 && o.certo === 1 && o.portaErrada === 1 && o.describeNone },
    { has: "Ingress", holds: (o) => o.certo === 0 },
    { has: "ClusterIP", holds: (o) => o.certoType === "ClusterIP" && o.certo === 0 },
  ],
};
