// SIGTERM e o PID 1: quanto demora para um pod que não trata o sinal sumir (com o período de graça padrão).
import { IMAGES, sleep } from "../lib.mjs";

const pod = (name, command) => `
apiVersion: v1
kind: Pod
metadata: { name: ${name} }
spec:
  containers:
    - name: app
      image: ${IMAGES.busybox}
      command: ${command}`;

export default {
  id: "ks-015",
  title: "PID 1 sem tratar SIGTERM: o pod leva o período de graça inteiro",
  timeoutMs: 240_000,

  async run(lab) {
    await lab.namespace();
    await lab.apply(`${pod("ignora", '["sleep", "3600"]')}
---${pod("trata", `["sh", "-c", "trap 'exit 0' TERM; sleep 3600 & wait"]`)}
`);
    await lab.waitPodReady("ignora");
    await lab.waitPodReady("trata");
    await sleep(3_000); // dá tempo de o trap do segundo pod estar instalado
    const grace = (await lab.get("pod", "ignora")).spec.terminationGracePeriodSeconds;

    // apaga os dois ao mesmo tempo e mede quanto cada um leva para sumir de verdade
    const [slow, fast] = await Promise.all([
      lab.k(["delete", "pod", "ignora", "-n", lab.ns, "--wait=true"], { timeout: 150_000 }),
      lab.k(["delete", "pod", "trata", "-n", lab.ns, "--wait=true"], { timeout: 150_000 }),
    ]);
    const observed = {
      grace,
      ignoraSeconds: slow.ms / 1000,
      ignoraCode: slow.code,
      trataSeconds: fast.ms / 1000,
      trataCode: fast.code,
    };
    lab.fact(`período de graça padrão do pod: ${grace} s; "sleep 3600" como PID 1 levou ${observed.ignoraSeconds.toFixed(1)} s para sumir (kubectl código ${slow.code})`);
    lab.fact(`controle com trap 'exit 0' TERM: ${observed.trataSeconds.toFixed(1)} s (kubectl código ${fast.code})`);
    return observed;
  },

  options: [
    { has: "Cerca de 30 s", holds: (o) => o.ignoraCode === 0 && o.grace === 30 && o.ignoraSeconds >= 25 && o.ignoraSeconds <= 45 && o.trataSeconds < 10 },
    { has: "Menos de 1 s", holds: (o) => o.ignoraSeconds < 1 },
    { has: "Terminating para sempre", holds: (o) => o.ignoraCode !== 0 },
    { has: "Cerca de 5 s", holds: (o) => Math.abs(o.ignoraSeconds - 5) <= 3 || o.grace === 5 },
  ],
};
