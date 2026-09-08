/**
 * Stress test della paginazione: rende ogni profilo di scripts/make-stress-profiles.py
 * e confronta cio' che il codice DICHIARA (page count del footer, marker
 * "continued") con cio' che il PDF fa DAVVERO.
 *
 * Uso: node scripts/stress-pagination.mjs
 * Richiede il server statico su 127.0.0.1:8899 nella root del progetto.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, readdirSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = 9335;
const BASE = 'http://127.0.0.1:8899/index.html';
const PROFILES = ["long.json"];

const brave = spawn('/snap/bin/brave', [
  '--headless', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, 'about:blank'
], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(250); }
  }
  throw new Error('CDP non raggiungibile');
}

const ws = new WebSocket(await endpoint(), { perMessageDeflate: false });
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

const rows = [];

for (const file of PROFILES) {
  const name = file.replace(/\.json$/, '');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, p) => send(m, p, sessionId);

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.navigate', { url: BASE });

  // Aspetta che initialize() E la prima paginazione siano concluse. Il poll
  // sul solo primo render non basta: la paginazione differita arriverebbe
  // dopo l'iniezione e ri-renderizzerebbe sopra il profilo appena messo.
  await sleep(3000);

  const trace = await call('Runtime.evaluate', {
    expression: `JSON.stringify({
      trace: window.__trace || [],
      savedProfile: localStorage.getItem('cv-selected-profile'),
      hasAdmin: !!window.cvAdminPanel
    })`, returnByValue: true
  });
  console.log(`  ${name} TRACE:`, trace.result.value);

  // L'app non legge ancora ?profile=, quindi il profilo si inietta a mano
  // ricaricando i dati e ri-renderizzando, poi si ripagina dalla misura.
  const before = await call('Runtime.evaluate', {
    expression: `(async () => {
      const snap = () => ({
        jobs: document.querySelectorAll('.job-entry').length,
        expHTML: (document.getElementById('experience')||{innerHTML:''}).innerHTML.length,
        expHidden: (document.querySelector('.experience-section')||{
          hasAttribute: () => null }).hasAttribute('hidden')
      });
      const initial = snap();
      let thrown = null;
      try {
        window.cvApp.rerender();
      } catch (error) { thrown = String(error && error.stack || error); }

      // Renderizza l'esperienza da sola, per vedere se e' il renderer a fallire
      let direct = null;
      try {
        const { ExperienceRenderer } = await import('./renderers/ExperienceRenderer.js');
        document.getElementById('experience').innerHTML = '';
        new ExperienceRenderer().render(document, window.cvApp.currentData);
        direct = document.querySelectorAll('.job-entry').length;
      } catch (error) { direct = 'THROW: ' + String(error && error.message || error); }

      return { initial, afterRerender: snap(), thrown, direct,
               jobsInData: (window.cvApp.currentData.relevant_experience||[]).length };
    })()`, awaitPromise: true, returnByValue: true
  });
  console.log(`  ${name} PRIMA:`, JSON.stringify(before.result.value));

  const injected = await call('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const res = await fetch('profiles/stress/${file}');
        const data = await res.json();
        const ok = window.cvApp.updateData(data);
        const afterUpdate = document.querySelectorAll('.job-entry').length;
        window.paginate();
        return { ok, afterUpdate,
                 afterPaginate: document.querySelectorAll('.job-entry').length };
      } catch (error) {
        return { error: String(error && error.message || error) };
      }
    })()`,
    awaitPromise: true, returnByValue: true
  });
  console.log(`  ${name}:`, JSON.stringify(injected.result.value));
  await sleep(1500);

  const declared = await call('Runtime.evaluate', {
    expression: `({
      jobs: document.querySelectorAll('.job-entry').length,
      bullets: document.querySelectorAll('.job-highlights li').length,
      footers: document.querySelectorAll('.page-footer').length,
      footerText: (document.querySelector('.page-footer')||{}).textContent || '',
      markers: document.querySelectorAll('.job-continuation').length,
      markerText: (document.querySelector('.continuation-label')||{}).textContent || ''
    })`, returnByValue: true
  });

  const { data } = await call('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true
  });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(`/tmp/stress-${name}.pdf`, buf);
  const realPages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

  const d = declared.result.value;
  rows.push({
    profilo: name,
    job: d.jobs,
    bullet: d.bullets,
    'pagine reali': realPages,
    'footer': d.footers,
    'dice': d.footerText.trim().slice(-8),
    'marker': d.markers,
    ok: realPages === d.footers ? 'SI' : 'NO  <<<'
  });

  await send('Target.closeTarget', { targetId });
}

console.table(rows);
ws.close();
brave.kill();
