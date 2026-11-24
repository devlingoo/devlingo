// Editar um ConfigMap: o que muda num pod que já está rodando (variável de ambiente x arquivo montado).
import { IMAGES, restartsOf } from "../lib.mjs";

const pod = (name) => `
apiVersion: v1
kind: Pod
metadata: { name: ${name} }
spec:
  terminationGracePeriodSeconds: 1
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ["sleep", "3600"]
      env:
        - name: COR
          valueFrom:
            configMapKeyRef: { name: cfg, key: COR }
      volumeMounts:
        - { name: cfg, mountPath: /etc/cfg }
  volumes:
    - name: cfg
      configMap: { name: cfg }`;

export default {
  id: "ks-006",
  title: "Editar o ConfigMap não muda a variável do pod em execução",
  timeoutMs: 420_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`
apiVersion: v1
kind: ConfigMap
metadata: { name: cfg }
data: { COR: azul }
---${pod("app")}
`);
    const before = await lab.waitPodReady("app");
    const envBefore = (await lab.exec("app", ["printenv", "COR"])).stdout.trim();

    const patch = await lab.k(["patch", "configmap", "cfg", "-n", lab.ns, "--type", "merge", "-p", '{"data":{"COR":"verde"}}']);
    const envRightAfter = (await lab.exec("app", ["printenv", "COR"])).stdout.trim();

    // o kubelet leva até uns 2 minutos para atualizar o arquivo montado; quando isso acontecer, a mudança já chegou ao nó
    const fileSeconds = await (async () => {
      const t0 = Date.now();
      await lab.waitFor("o arquivo montado mostrar o valor novo", async () => (await lab.exec("app", ["cat", "/etc/cfg/COR"])).stdout.trim() === "verde", { timeout: 300_000, every: 3_000 });
      return Math.round((Date.now() - t0) / 1000);
    })();
    const envAfterSync = (await lab.exec("app", ["printenv", "COR"])).stdout.trim();
    const after = await lab.get("pod", "app");

    // um pod NOVO enxerga o valor novo
    await lab.apply(pod("app-novo"));
    await lab.waitPodReady("app-novo");
    const envNewPod = (await lab.exec("app-novo", ["printenv", "COR"])).stdout.trim();

    const observed = {
      patchCode: patch.code,
      envBefore,
      envRightAfter,
      fileSeconds,
      envAfterSync,
      envNewPod,
      uidSame: after.metadata.uid === before.metadata.uid,
      restarts: restartsOf(after),
    };
    lab.fact(`variável COR: ${envBefore} antes; ${envRightAfter} logo depois do patch; ${envAfterSync} depois de ${fileSeconds} s, quando o ARQUIVO montado já mostrava "verde"`);
    lab.fact(`o mesmo pod: UID ${observed.uidSame ? "igual" : "diferente"}, ${observed.restarts} reinícios; um pod criado depois do patch lê COR=${envNewPod}`);
    return observed;
  },

  options: [
    { has: "muda na hora", holds: (o) => o.envRightAfter === "verde" || o.envAfterSync === "verde" },
    { has: "reinicia o pod sozinho", holds: (o) => !o.uidSame || o.restarts > 0 },
    { has: "recusa editar", holds: (o) => o.patchCode !== 0 },
    { has: "valor antigo até ser recriado", holds: (o) => o.patchCode === 0 && o.envAfterSync === "azul" && o.envNewPod === "verde" && o.uidSame && o.restarts === 0 },
  ],
};
