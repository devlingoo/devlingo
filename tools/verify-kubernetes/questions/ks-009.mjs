// DNS entre namespaces: de um pod do "dev" chamando o Service "api" do "prod".
import { IMAGES } from "../lib.mjs";

export default {
  id: "ks-009",
  title: "Chamar um Service de outro namespace",
  timeoutMs: 240_000,

  async run(lab) {
    const dev = await lab.namespace(`${lab.id}-dev`);
    const prod = await lab.namespace(`${lab.id}-prod`);
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
kind: Service
metadata: { name: api }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: 8080 }]
`, prod);
    await lab.apply(`
apiVersion: v1
kind: Pod
metadata: { name: cliente }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]
`, dev);
    await lab.waitPodReady("cliente", dev);
    await lab.waitFor("o Service api do prod ter um endereço pronto", async () => (await lab.readyEndpoints("api", prod)) === 1);

    // o nome que cada opção do desafio usa, com o namespace de verdade no lugar de "prod"
    const forms = {
      curto: "api",
      comNamespace: `api.${prod}`,
      completo: `api.${prod}.svc.cluster.local`,
      invertido: `${prod}.api`,
      local: `api.${prod}.local`,
    };
    const worked = {};
    for (const [key, host] of Object.entries(forms)) {
      const result = await lab.exec("cliente", ["wget", "-q", "-O-", "-T", "5", `http://${host}/hostname`], dev);
      worked[key] = result.code === 0 && result.stdout.trim().length > 0;
      lab.fact(`de um pod do namespace "dev", http://${host.replace(prod, "prod")} ${worked[key] ? "respondeu" : `falhou (${result.stderr.trim().split("\n")[0] || `código ${result.code}`})`}`);
    }
    return { worked };
  },

  options: [
    { has: "http://api,", holds: (o) => o.worked.curto },
    { has: "http://prod.api", holds: (o) => o.worked.invertido },
    { has: "http://api.prod (", holds: (o) => o.worked.comNamespace && o.worked.completo && !o.worked.curto },
    { has: "api.prod.local", holds: (o) => o.worked.local },
  ],
};
