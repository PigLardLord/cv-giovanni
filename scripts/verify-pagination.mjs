/**
 * Verifica diretta della paginazione: per ogni profilo di stress, una pagina
 * fresca, una sola iniezione, un PDF.
 *
 * L'harness precedente riusava un target CDP fra i profili e questo esponeva
 * una race sul primo render: qui ogni profilo parte da un target nuovo e
 * l'iniezione avviene solo dopo che la pagina si e' misurata da sola una volta.
 *
 * Uso: node scripts/verify-pagination.mjs [profilo.json ...]
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

// Il layout si sceglie come in render-cv.mjs: senza LAYOUT si verifica quello
// di default, con LAYOUT=classic si verifica anche il tema a due colonne.
const LAYOUT = process.env.LAYOUT || '';
const BASE = 'http://127.0.0.1:8899/index.html' + (LAYOUT ? `?layout=${LAYOUT}` : '');
const OUT = LAYOUT ? `/tmp/cv-verify-${LAYOUT}` : '/tmp/cv-verify';
mkdirSync(OUT, { recursive: true });

const PROFILES = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync('profiles/stress').filter((f) => f.endsWith('.json'));

const rows = [];

for (const file of PROFILES) {
  const name = file.replace(/\.json$/, '');
  const port = 9400 + rows.length;
  const brave = spawn('/snap/bin/brave', [
    '--headless', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${port}`, 'about:blank'
  ], { stdio: 'ignore' });

  let ws;
  try {
    let wsUrl = null;
    for (let i = 0; i < 80 && !wsUrl; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        wsUrl = (await r.json()).webSocketDebuggerUrl;
      } catch { await sleep(250); }
    }

    ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    await new Promise((r) => ws.once('open', r));
    let id = 0;
    const pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (m, p) => send(m, p, sessionId);

    await call('Page.enable');
    await call('Runtime.enable');
    // Senza questo Chromium riusa il bundle in cache e si finisce a debuggare
    // codice vecchio credendolo nuovo.
    await call('Network.enable').catch(() => {});
    await call('Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {});
    await call('Page.navigate', { url: BASE });
    await sleep(3500);

    // Attende che il primo render abbia davvero prodotto contenuto, invece di
    // fidarsi di un'attesa a tempo.
    const settled = await call('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        let tries = 0;
        const tick = () => {
          const jobs = document.querySelectorAll('.job-entry').length;
          if (jobs > 0) return resolve(jobs);
          if (++tries > 50) return resolve(0);
          setTimeout(tick, 100);
        };
        tick();
      })`, awaitPromise: true, returnByValue: true
    });

    const injected = await call('Runtime.evaluate', {
      expression: `(async () => {
        const data = await (await fetch('profiles/stress/${file}')).json();
        window.cvApp.updateData(data);
        window.paginate();
        return {
          jobs: document.querySelectorAll('.job-entry').length,
          bullets: document.querySelectorAll('.job-highlights li').length,
          footers: document.querySelectorAll('.page-footer').length,
          footerText: (document.querySelector('.page-footer')||{}).textContent||'',
          markers: document.querySelectorAll('.job-continuation').length,
          marker: (document.querySelector('.continuation-label')||{}).textContent||'',
          trace: window.__trace || []
        };
      })()`, awaitPromise: true, returnByValue: true
    });
    await sleep(800);
    if (process.env.TRACE) {
      console.log(`  ${name} trace:`,
        JSON.stringify(injected.result.value.trace));
    }

    const { data } = await call('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true
    });
    const buf = Buffer.from(data, 'base64');
    writeFileSync(`${OUT}/${name}.pdf`, buf);
    const realPages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    const d = injected.result.value;
    rows.push({
      profilo: name,
      base: settled.result.value,
      job: d.jobs,
      bullet: d.bullets,
      pagine: realPages,
      footer: d.footers,
      dice: d.footerText.trim().slice(-7),
      marker: d.markers,
      ok: realPages === d.footers && d.jobs > 0 ? 'SI' : 'NO <<<'
    });
    if (d.marker) console.log(`  ${name} marker: "${d.marker.slice(0, 70)}"`);
  } finally {
    if (ws) ws.close();
    brave.kill();
    await sleep(400);
  }
}

console.table(rows);
console.log(`PDF in ${OUT}/`);
