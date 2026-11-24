// Um pod num namespace que não é o atual: qual comando o mostra?
import { IMAGES } from "../lib.mjs";

export default {
  id: "ks-004",
  title: "Ver pods de outro namespace",
  timeoutMs: 120_000,

  async run(lab) {
    await lab.namespace(); // o namespace "dev" do desafio
    await lab.apply(`
apiVersion: v1
kind: Pod
metadata: { name: alvo-ks004 }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]
`);
    await lab.waitFor("o pod existir", () => lab.get("pod", "alvo-ks004"));

    const shows = (r) => r.code === 0 && r.stdout.includes("alvo-ks004");
    const plain = await lab.k(["get", "pods"]); // sem -n: namespace atual, o default
    const withN = await lab.k(["get", "pods", "-n", lab.ns]);
    const withAll = await lab.k(["get", "pods", "--all"]);
    const podNamed = await lab.k(["get", "pod", lab.ns]); // "kubectl get pod dev": procura um POD chamado dev
    const nsGet = await lab.k(["get", "namespace", lab.ns]);
    const dashA = await lab.k(["get", "pods", "-A"]);

    const observed = {
      plainShows: shows(plain),
      plainMessage: `${plain.stderr}${plain.stdout}`.trim().split("\n")[0],
      withN: shows(withN),
      withAll: shows(withAll),
      withAllCode: withAll.code,
      withAllError: withAll.stderr.trim().split("\n")[0],
      podNamed: shows(podNamed),
      podNamedError: podNamed.stderr.trim().split("\n")[0],
      nsGet: shows(nsGet),
      nsGetOut: nsGet.stdout.trim().split("\n").slice(0, 2).join(" / "),
      dashA: shows(dashA),
    };
    lab.fact(`kubectl get pods (sem -n): "${observed.plainMessage}"`);
    lab.fact(`get pods -n <ns>: mostra o pod = ${observed.withN}; get pods -A: ${observed.dashA}; get pods --all: código ${observed.withAllCode} ("${observed.withAllError}")`);
    lab.fact(`get pod <ns>: "${observed.podNamedError}"; get namespace <ns> mostra o pod = ${observed.nsGet} ("${observed.nsGetOut}")`);
    return observed;
  },

  options: [
    { has: "--all", holds: (o) => o.withAll },
    { has: "-n dev", holds: (o) => o.withN && !o.plainShows },
    { has: "get pod dev", holds: (o) => o.podNamed },
    { has: "get namespace dev", holds: (o) => o.nsGet },
  ],
};
