// kubectl apply duas vezes seguidas sem editar o arquivo (e, de contraste, create e apply depois de editar).
import { IMAGES } from "../lib.mjs";

const manifest = (replicas) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: ${replicas}
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      terminationGracePeriodSeconds: 1
      containers:
        - name: app
          image: ${IMAGES.busybox}
          command: ["sleep", "3600"]
`;

export default {
  id: "ks-003",
  title: "apply duas vezes: unchanged",
  timeoutMs: 120_000,

  async run(lab) {
    await lab.namespace();
    const send = (verb, yaml) => lab.k([verb, "-n", lab.ns, "-f", "-"], { input: yaml });
    const first = await send("apply", manifest(1));
    const second = await send("apply", manifest(1)); // o mesmo arquivo, sem editar
    const create = await send("create", manifest(1)); // contraste: create no que já existe
    const edited = await send("apply", manifest(2)); // contraste: apply depois de editar
    const deployments = await lab.list("deployments");

    const text = (r) => `${r.stdout}${r.stderr}`.trim();
    const observed = {
      first: text(first),
      second: text(second),
      secondCode: second.code,
      create: text(create),
      createCode: create.code,
      edited: text(edited),
      deployments: deployments.length,
    };
    lab.fact(`1º apply: "${observed.first}"; 2º apply, mesmo arquivo: "${observed.second}"`);
    lab.fact(`kubectl create no mesmo arquivo (código ${observed.createCode}): "${observed.create.slice(0, 160)}"`);
    lab.fact(`apply depois de mudar replicas: "${observed.edited}"; Deployments no namespace: ${observed.deployments}`);
    return observed;
  },

  options: [
    { has: "AlreadyExists", holds: (o) => /AlreadyExists|already exists/i.test(o.second) },
    { has: "created", holds: (o) => /\bcreated\b/.test(o.second) || o.deployments > 1 },
    { has: "configured", holds: (o) => /\bconfigured\b/.test(o.second) },
    { has: "unchanged", holds: (o) => o.secondCode === 0 && /\bunchanged\b/.test(o.second) },
  ],
};
