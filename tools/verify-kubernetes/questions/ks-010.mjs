// RBAC: um Role vale só no namespace dele e só para os verbos listados.
import { IMAGES } from "../lib.mjs";

export default {
  id: "ks-010",
  title: "Role é por namespace",
  timeoutMs: 180_000,

  async run(lab) {
    const dev = await lab.namespace(`${lab.id}-dev`);
    const prod = await lab.namespace(`${lab.id}-prod`);
    const pod = (ns) => `
apiVersion: v1
kind: Pod
metadata: { name: alvo, namespace: ${ns} }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]`;
    await lab.apply(`
apiVersion: v1
kind: ServiceAccount
metadata: { name: ci, namespace: ${dev} }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata: { name: leitor, namespace: ${dev} }
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: ci-le-pods, namespace: ${dev} }
subjects:
  - { kind: ServiceAccount, name: ci, namespace: ${dev} }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: Role, name: leitor }
---${pod(dev)}
---${pod(prod)}
`, null);

    // pedidos de verdade, feitos "como" a ServiceAccount (impersonação: passa pela mesma autorização de qualquer cliente)
    const as = `--as=system:serviceaccount:${dev}:ci`;
    const call = async (args) => {
      const r = await lab.k([...args, as]);
      return { ok: r.code === 0, text: `${r.stderr}${r.stdout}`.trim().split("\n")[0] };
    };
    const listDev = await call(["get", "pods", "-n", dev]);
    const listProd = await call(["get", "pods", "-n", prod]);
    const listAll = await call(["get", "pods", "-A"]);
    const deleteDev = await call(["delete", "pod", "alvo", "-n", dev]);
    const stillThere = (await lab.get("pod", "alvo", dev)) !== null;

    const observed = {
      listDev: listDev.ok && /alvo/.test((await lab.k(["get", "pods", "-n", dev, as])).stdout),
      listProd: listProd.ok,
      listAll: listAll.ok,
      deleteDev: deleteDev.ok,
      stillThere,
    };
    lab.fact(`como a ServiceAccount ci: listar pods no dev = ${observed.listDev ? "permitido" : "negado"}; no prod = ${observed.listProd ? "permitido" : `negado ("${listProd.text.slice(0, 110)}")`}`);
    lab.fact(`listar em todos os namespaces (-A) = ${observed.listAll ? "permitido" : "negado"}; apagar o pod do dev = ${observed.deleteDev ? "permitido" : "negado"} (o pod continuou lá: ${stillThere})`);
    return observed;
  },

  options: [
    { has: "só no dev", holds: (o) => o.listDev && !o.listProd && !o.listAll && !o.deleteDev && o.stillThere },
    { has: "todos os namespaces", holds: (o) => o.listAll || o.listProd },
    { has: "Listar e apagar", holds: (o) => o.deleteDev },
    { has: "não aceita Role", holds: (o) => !o.listDev },
  ],
};
