# PLAN — multi-layout CV 2026 + chiusura bug paginazione

Branch di lavoro: `cv-2026-update` (non committato). Tutti i percorsi sono relativi
alla radice del repo `/home/giovanni/mac-dati-personali/cv-giovanni`.

## Obiettivo e stato attuale

Obiettivo: **multi-layout**. Stessi dati (`profiles/*.json`), stesso DOM prodotto dai
renderer, l'utente sceglie l'aspetto. Oggi esiste un solo layout alternativo
(`layouts/classic/`), caricato da `core/LayoutLoader.js` in base a `?layout=<nome>`.
Vanno portati dentro questo meccanismo i tre prototipi del board
(`design/build-board.py` → `design/design-board.html`): **compact**, **editorial**,
**ledger**.

Stato del motore: `script.js` registra i renderer su `CVApplication`, chiama
`app.initialize(document).then(paginate)`; `paginate()` costruisce un `Paginator`,
misura, passa `pageCount` a `PrintFooterRenderer.setPageCount()` e `cuts` a
`ContinuationMarker.cuts`, poi `app.rerender()`, fino a 3 passate o finché il conteggio
si stabilizza. `npm test`: **294 test verdi su 18 suite** (verificato prima di scrivere
questo piano). Nessuna fase qui sotto può far scendere quel numero.

Difetto aperto: `core/PageGeometry.js` → `pageCountFor()` deriva le pagine
dall'**altezza totale** del flusso; i salti forzati da `break-inside: avoid`, `orphans`
e `widows` lasciano buchi che l'altezza non contiene. `node scripts/verify-pagination.mjs`
oggi dà `overflow` = 3 pagine PDF reali contro 2 footer (gli altri 4 profili: `SI`).

Ordine delle fasi: la Fase 0 viene per prima perché ogni layout successivo si giudica
con `verify-pagination.mjs`, cioè con quel motore di conteggio. Chiudere il bug dopo
significherebbe validare tre layout con un metro sbagliato.

---

## Fase 0 — Il conteggio pagine deriva dalle posizioni, non dall'altezza

### Cosa cambia, esattamente

**`core/PageGeometry.js`** — aggiunta *additiva* di una funzione; `pageCountFor()`,
`pageOf()` e `cutIndexFor()` restano con la firma di oggi (sono usate altrove e
coperte da 12 test esistenti in `tests/PageGeometry.test.js`).

Nuova funzione:

```js
/**
 * Quante pagine occupa un flusso, letto dalle posizioni misurate dei suoi blocchi.
 *
 * Le posizioni incorporano già i salti forzati da break-inside/orphans/widows,
 * che l'altezza totale non conta: da qui la pagina è quella dell'ULTIMO bordo
 * inferiore misurato, non ceil(altezza/267).
 *
 * @param {Array<{topMm: number, heightMm: number}>} blocks
 * @param {number} [pageHeightMm]
 * @returns {number} Conteggio pagine, mai sotto 1
 */
export function pageCountFromBlocks(blocks, pageHeightMm = PAGE_CONTENT_HEIGHT_MM) { … }
```

Semantica richiesta:

- ogni blocco contribuisce `pageOf(topMm + heightMm - TOLERANCE_MM, pageHeightMm)`
  (bordo inferiore, non superiore: un bullet da 2044 caratteri più alto di una pagina
  intera deve contare le pagine che *attraversa*);
- `TOLERANCE_MM = 0.5`, la stessa tolleranza già usata dentro `pageCountFor()`, così un
  blocco che finisce esattamente sul confine non apre una pagina vuota;
- risultato = `Math.max(1, max(pagine))`; array vuoto / non-array / valori non finiti →
  `1`, coerente con la difensività del resto del file;
- i blocchi con `topMm === 0 && heightMm === 0` (elemento `display:none` imposto da un
  layout) contribuiscono pagina 1 e quindi sono innocui — va scritto nel commento,
  perché è esattamente il caso "il layout nasconde in CSS ciò che non vuole".

**`core/Paginator.js`** — `measure()` smette di derivare il conteggio dall'altezza:

```js
measure() {
  const heightMm = this.measurer.documentHeightMm();       // resta, come diagnostica
  const blocks = this.measurer.measureBlocks(MEASURED_BLOCK_SELECTOR);
  const pageCount = blocks.length > 0
    ? pageCountFromBlocks(blocks, this.pageHeightMm)
    : pageCountFor(heightMm, this.pageHeightMm);           // fallback: DOM non misurabile
  return { pageCount, heightMm, cuts: this.measureCuts() };
}
```

`MEASURED_BLOCK_SELECTOR` è una costante esportata da `core/Paginator.js`, composta di
soli selettori-foglia già emessi dai renderer e già citati in `print.css` (righe 125-140,
blocco "Atomic"), così un layout può ristilarli ma non li fa sparire dal flusso:

```
.hero-section, .profile-summary, .skill-group, .job-header, .job-period,
.job-note, .job-summary, .job-highlights li, .job-continuation, .edu-entry,
.languages-list li, .certifications-list li, .interests-line
```

Vincoli da rispettare nell'implementazione:

- `PageMeasurer.measureBlocks(selector)` già restituisce `{element, topMm, heightMm}` e
  già gira dentro `withPrintLayout()`, che promuove i `link[media*=print]` a `media="all"`,
  clampa `body.style.width` a 168mm **e nasconde `.page-footers`** con
  `display:none !important`. Non toccare quel metodo: nasconde i footer proprio perché
  sono posizionati in assoluto a `--page-index × 267mm` e altrimenti confermerebbero da
  soli il conteggio precedente;
- `measure()` finirà per chiamare `withPrintLayout()` tre volte (una per il conteggio,
  due dentro `measureCuts()`). È accettabile e già il comportamento odierno (due volte).
  Se il costo diventa visibile, l'ottimizzazione è un solo `withPrintLayout()` che
  raccoglie tutti i selettori — ma **non** in questa fase: una cosa alla volta.
- `PAGE_CONTENT_HEIGHT_MM = 267` non si tocca; `print.css` deriva gli offset dei footer
  dalla stessa costante (`--page-content-height: 267mm`, riga 43). Restano allineati.

### Test da aggiungere

In **`tests/PageGeometry.test.js`**, un nuovo `describe('PageGeometry.pageCountFromBlocks')`
(nessun test esistente va modificato):

1. `nessun blocco → 1 pagina` — `pageCountFromBlocks([])` = 1, e idem per `null`/`undefined`.
2. `un flusso che sta in una pagina → 1` — blocchi con bottom max ~200mm.
3. `il bordo inferiore, non quello superiore, decide` — blocco `{topMm: 260, heightMm: 20}`
   (bottom 280) → 2.
4. `un blocco che finisce esattamente sul confine non apre una pagina` —
   `{topMm: 0, heightMm: PAGE_CONTENT_HEIGHT_MM}` → 1 (stessa tolleranza di `pageCountFor`).
5. **il test che è il bug** — `il vuoto lasciato da un salto forzato conta come pagina`:
   blocchi le cui altezze sommano a ~400mm ma il cui ultimo bottom sta a ~700mm
   (es. `[{0,150},{160,120},{534,160}]`): `pageCountFor(400)` dà 2,
   `pageCountFromBlocks(...)` deve dare **3**. Il commento del test cita
   `profiles/stress/overflow.json` e il bullet da 2044 caratteri.
6. `un blocco più alto di una pagina intera attraversa più pagine` —
   `{topMm: 250, heightMm: 300}` → 3.
7. `sopravvive ai buchi nelle misure` — un blocco con `topMm: NaN` viene ignorato, gli
   altri decidono (stesso patto di `cutIndexFor`, che ha già il suo test alla riga 77).
8. `un blocco nascosto dal layout non aggiunge pagine` — `{topMm: 0, heightMm: 0}` in
   coda a un flusso da una pagina → 1.

Nuovo file **`tests/Paginator.test.js`** (oggi non esiste): un measurer finto sullo stile
di `makeDocument()` in `tests/PageMeasurer.test.js` — un oggetto con `canMeasure()`,
`documentHeightMm()` e `measureBlocks(selector)` che risponde per selettore. Tre test:

- `measure() conta le pagine dalle posizioni, non dall'altezza`: `documentHeightMm()`
  restituisce 400 (=2 pagine per l'aritmetica vecchia) mentre i blocchi finiscono a 700
  → `pageCount` = 3;
- `senza blocchi misurabili ricade sull'altezza`: `measureBlocks` vuoto → `pageCountFor`;
- `measureCuts() resta chiavizzato per posizione dell'entry, non per elemento` — guardia
  di non-regressione sul commento di `measureCuts()` (righe 42-56 di `core/Paginator.js`).

### Criterio di "fatto", verificabile

```bash
npm test                       # atteso: >= 294 test verdi, 19 suite (nuova Paginator.test.js)
python3 -m http.server 8899 &  # il server che verify-pagination presuppone su 127.0.0.1:8899
node scripts/verify-pagination.mjs
```

La tabella stampata da `console.table(rows)` deve avere **`ok: SI` su tutte e 5 le righe**
(`long`, `overflow`, `renamed-company`, `short`, `tiny`); in particolare `overflow` passa da
`NO <<<` a `SI` con `pagine === footer === 3`. I 4 profili già verdi restano verdi: è la
condizione di non-regressione, non un dettaglio.

Controprova utile: `node scripts/render-cv.mjs /tmp/cv-fase0.pdf` sul profilo reale non deve
cambiare il numero di pagine rispetto a `cv-2026.pdf` (il CV reale non ha buchi patologici;
se cambia, il nuovo conteggio sta sovrastimando e va indagato prima di procedere).

### Rischi

- **Sovrastima da elementi fuori flusso.** Se un layout futuro posiziona in assoluto uno
  dei selettori misurati, il suo `topMm` mente. Mitigazione: `MEASURED_BLOCK_SELECTOR` è
  una lista chiusa, e la Fase 6 la ri-verifica per ogni layout.
- **Blocchi nascosti.** `display:none` → rect a zero; coperto dal test 8.
- **Oscillazione del ciclo `paginate()`.** Il conteggio più alto rende più footer, i footer
  sono `position:absolute` e non allungano il flusso misurato (sono nascosti durante la
  misura), quindi il punto fisso resta raggiungibile entro le 3 passate di `script.js`.
  Da confermare col trace: `TRACE=1 node scripts/verify-pagination.mjs`.

---

## Fase 1 — Token condivisi estratti dal board

### Cosa

Il board tiene scala tipografica, spaziature, colori e densità in un unico blocco `:root`
di `design/build-board.py` (costante `CSS`, righe 368-374) più le classi di densità
`body.d-tight` / `body.d-loose` e l'accento `body.mono-accent` (righe 498-502). Vanno
estratti **una sola volta** in un CSS di base comune, non triplicati nei tre layout.

File nuovi:

- `layouts/tokens/screen.css`
- `layouts/tokens/print.css`

Contenuto: le sole custom properties, verbatim dal board —
`--ink`, `--ink-2`, `--ink-3`, `--rule`, `--rule-soft`, `--accent`, `--paper`,
`--s1`…`--s7`, `--fs-body`, `--fs-small`, `--fs-micro`, `--lh` — più le tre classi token:

```css
body.d-tight  { --fs-body:9.1pt; --fs-small:8.1pt; --fs-micro:7.3pt; --lh:1.36;
                --s4:9px;  --s5:13px; --s6:19px; --s7:28px; }
body.d-loose  { --fs-body:10.2pt; --fs-small:9pt; --fs-micro:8pt; --lh:1.5;
                --s4:13px; --s5:19px; --s6:29px; --s7:40px; }
body.mono-accent { --accent:#15181d; }
```

Densità e accento sono **token, non feature**: nessun renderer li conosce, nessun layout
li ridefinisce, sono solo classi sul `<body>` che rimappano variabili già usate.

### Come vengono caricati, senza toccare LayoutLoader

`LayoutLoader.load(name)` carica esattamente `layouts/<name>/screen.css` (media vuoto) e
`layouts/<name>/print.css` (`media="print"`), e `requestedLayout()` accetta solo
`/^[a-z][a-z0-9-]*$/` — quindi `layouts/tokens/` non è raggiungibile come layout, ed è
bene così. I token entrano per `@import` come **prima riga** di ogni foglio di layout:

```css
@import url("../tokens/screen.css");   /* in layouts/<n>/screen.css */
@import url("../tokens/print.css");    /* in layouts/<n>/print.css  */
```

Perché questa strada e non un terzo `<link>`: `PageMeasurer.printStylesheets()` seleziona
`link[rel="stylesheet"]` con `media` contenente `print` e ne promuove il `media` a `all`.
Un foglio importato eredita il contesto di media del foglio che lo importa, quindi
l'`@import` dentro `layouts/<n>/print.css` viene promosso insieme al suo ospite e la
misura resta corretta. Un `<link>` aggiunto a mano fuori da quel meccanismo romperebbe il
contratto di misura.

Alternativa scartata (documentarla nel commento del file): estendere `LayoutLoader.load()`
perché aggiunga anche i due link dei token. È più esplicito ma rompe due test in
`tests/LayoutLoader.test.js` — `'adds a screen and a print stylesheet for the layout'`
(riga 48, si aspetta esattamente due link) e `'appends, leaving the base stylesheets in
place'` (riga 62, `toHaveLength(3)`). Se in futuro si sceglie questa via, quei due test
vanno aggiornati **nella stessa fase**, non dopo.

### File toccati

Solo aggiunte: `layouts/tokens/screen.css`, `layouts/tokens/print.css`.
Nessun file JS, nessun renderer, nessun test esistente.

### Test da aggiungere

Nuovo `tests/LayoutTokens.test.js`, con gli helper già disponibili in
`tests/helpers/cssRules.js` (`readProjectFile`, `ruleBody`, `declaration`, `lengthValue`),
esattamente come fa `tests/PrintLayout.test.js`:

- `il foglio dei token dichiara l'intera scala` — per ogni nome
  (`--fs-body`, `--fs-small`, `--fs-micro`, `--lh`, `--s1`…`--s7`, `--ink`, `--accent`, …)
  `declaration(css, ':root', nome)` non è `null`;
- `la densità compatta stringe e quella ariosa allarga` —
  `lengthValue(declaration(css, 'body.d-tight', '--fs-body')) < lengthValue(declaration(css, ':root', '--fs-body'))`
  e il simmetrico per `body.d-loose`;
- `l'accento monocromo azzera il colore d'accento ma non tocca l'inchiostro` —
  `body.mono-accent` dichiara `--accent` e **non** dichiara `--ink`;
- `nessun token contiene contenuto` — il foglio non contiene la stringa `content:` con
  testo (guardia contro l'hardcoding di copy in CSS).

### Criterio di "fatto"

```bash
npm test          # >= 294 + i nuovi, tutto verde
grep -c '^\s*--' layouts/tokens/screen.css   # > 0: i token esistono davvero
```

E, aperto `index.html?layout=classic`, l'aspetto **non cambia**: i token sono inerti finché
un layout non li usa (`classic` non li importa).

### Rischi

- `@import` è bloccante per il rendering e aggiunge un round-trip: irrilevante su file
  locale e in headless, ma da ricordare se il CV finisce su hosting remoto.
- Nomi di variabile in collisione con quelli di `style.css`
  (`--primary-color`, `--space-*`, `--text-*`): i token del board hanno prefissi diversi
  (`--ink`, `--s*`, `--fs-*`), nessuna sovrapposizione. Va tenuto così — non rinominare i
  token del board sui nomi di `style.css`.

---

## Fase 2 — Layout `compact` (variante A del board)

Due colonne asimmetriche (main `1fr` + aside `58mm`), skill come run inline raggruppate per
categoria, header con meta a destra.

### File nuovi

`layouts/compact/screen.css`, `layouts/compact/print.css` (entrambi aprono con l'`@import`
dei token). Caricati da `index.html?layout=compact` via `LayoutLoader.loadRequested()`,
che `script.js` chiama alla riga 63 **prima** del primo render.

### Elementi che i renderer già emettono (nessuna invenzione)

| Serve al layout | Classe/selettore reale | Prodotto da |
|---|---|---|
| identità | `.hero-section`, `.hero-content`, `.hero-text`, `.hero-sidebar` | `index.html` (statico) |
| nome/ruolo | `#name.hero-name`, `#title.hero-title`, `#subtitle.hero-subtitle` | `HeaderRenderer.render()` |
| meta a destra | `#contacts.contact-block` > `p.contact-line` con `.contact-location`, `a.contact-link` | `HeaderRenderer.renderContactBlock()` / `createContactRow()` |
| link social | `p.contact-line.social-links` > `a` + `span.inline-separator` | `SocialLinksRenderer.render()` |
| disponibilità | `#availability.hero-availability` | `HeaderRenderer.renderOptionalLine()` |
| profilo | `#profile.profile-summary` | `ProfileRenderer.render()` |
| riga skill per categoria | `.skill-group` > `.skill-category` + `.skill-separator` + `.skill-list` + `.skill-badges` > `.skill-badge` > (`.skill-name`, `.skill-level`) | `SkillsRenderer.createSkillGroup()` |
| lavoro | `.job-entry` > `.job-header` (`.job-title`, `.job-company`) + `.job-period` + `.job-note?` + `.job-summary?` + `ul.job-highlights > li` | `ExperienceRenderer.createJobEntry()` |
| formazione | `.edu-entry` > `.edu-degree`, `.edu-school`, `.edu-period`, `.edu-description?` | `EducationRenderer.createEducationEntry()` |
| certificazioni | `#certifications li` > `strong`/`a`, `.cert-description?` | `CertificationsRenderer.createCertificationItem()` |
| lingue | `#languages li` > `strong` | `LanguagesRenderer.createLanguageItem()` |
| interessi | `#interests .interests-line` | `InterestsRenderer.render()` |

**Nessun renderer va esteso per `compact`.** In particolare le "chip" della variante A non
sono un nuovo elemento: sono i `.skill-badge` che `SkillsRenderer.createSkillBadges()` già
emette, con `.skill-level` nascosto in CSS. È la stessa logica che `layouts/classic/print.css`
usa al contrario (riga 127: nasconde `.skill-separator`, righe 168-187: mostra i badge).

### Classi CSS da scrivere

- **Due colonne senza wrapper di markup.** `.main-content` diventa
  `display: grid; grid-template-columns: 1fr 58mm; column-gap: var(--s7)` e le sezioni si
  assegnano per classe (già presenti in `index.html`):
  `.profile-section, .skills-section, .experience-section { grid-column: 1 }` e
  `.education-section, .certifications-section, .languages-section, .interests-section { grid-column: 2 }`.
  Non si introduce nessun `.content-grid` / `.primary-column` / `.secondary-column`: il test
  `'carries no column wrappers at all'` (`tests/PrintLayout.test.js`, riga 31) legge
  `index.html` e deve continuare a passare.
- **Header con meta a destra.** `.hero-content { grid-template-columns: 1fr 60mm }` e
  `.hero-text { display: contents }` così `#contacts` e `.social-links` possono essere
  allineati a destra (`text-align: right`) nella seconda colonna della griglia, senza
  toccare il markup né l'ordine DOM su cui poggia il test
  `'orders the identity block name, title, subtitle, contact, availability'`.
- **Skill in run raggruppate.** `.skill-group { display: grid; grid-template-columns: 29mm 1fr }`,
  `.skill-category` come etichetta `--fs-micro` maiuscoletto, `.skill-list` come run;
  in `compact` si mostra `.skill-list` e si nasconde `.skill-badges` (vedi sotto).
- Tipografia e rythm: `--fs-body/--fs-small/--fs-micro/--s*` dai token, nessun valore in
  chiaro se esiste già il token.

### Cosa il layout nasconde (e cosa NON deve nascondere)

Nasconde: `.skill-badges` (la forma valutata; la run compatta la sostituisce),
`.hero-sidebar` in stampa se l'header a due colonne non lascia spazio al ritratto.
**Non** nasconde: `.skill-level`, `#interests`, `.edu-description`, `.cert-description`,
`.job-note`. Il campo `level` e la sezione `interests` sono già andati persi una volta
per via di un layout: qui restano nel DOM e restano leggibili in almeno una forma.

Nota emersa dall'ispezione, da chiudere in questa fase: **né `style.css` né `print.css`
nascondono `.skill-badges`** (`grep -n 'skill-badges' style.css print.css` → nessun
risultato), mentre `SkillsRenderer` le emette sempre. Vanno verificate a schermo prima di
scrivere il layout — se nel layout di default i badge sono visibili accanto alla run, è un
difetto preesistente da correggere in `style.css`/`print.css` con una riga
`.skill-badges { display: none }` e un test in `tests/PrintLayout.test.js`, non da
aggirare dentro `layouts/compact/`.

### Due colonne in stampa: decisione basata sulla misura, non sull'estetica

Chromium frammenta male i grid container su più pagine, e `print.css` ha tolto la griglia
per una ragione dichiarata (ordine di estrazione testo = ordine DOM, cfr. testata di
`tests/PrintLayout.test.js`). Regola operativa:

1. si scrive `layouts/compact/print.css` con le due colonne;
2. si lancia `LAYOUT=compact node scripts/verify-pagination.mjs`;
3. se anche un solo profilo di stress dà `NO`, la stampa di `compact` torna a **colonna
   unica** (le due colonne restano solo in `screen.css`) e lo si scrive nel commento del
   file. Nessuna eccezione "tanto sul profilo reale funziona": il profilo reale non è il
   criterio, i 5 profili di stress lo sono.

### Test da aggiungere

Nuovo `tests/layouts/CompactLayout.test.js` (o `tests/CompactLayout.test.js`, per non
cambiare `jest.config.js`), con `readProjectFile`/`ruleBody`/`declaration`:

- `assegna ogni sezione a una colonna` — `declaration(css, '.experience-section', 'grid-column')` = `1`, ecc.;
- `non introduce wrapper di colonna` — il CSS non nomina `.content-grid`/`.primary-column`/`.secondary-column`;
- `mostra la run compatta e nasconde i badge` — `.skill-badges` ha `display: none`, `.skill-list` no;
- **`non nasconde nessun dato`** — test parametrico sulla lista
  `['.skill-level', '#interests', '.interests-line', '.edu-description', '.cert-description', '.job-note', '.job-highlights']`:
  per ciascuno, nessuna regola del layout dichiara `display: none`. Questo test va
  duplicato identico nei layout delle Fasi 3 e 4: è la guardia contro la regressione che
  fece sparire `level` e `interests`.

### Criterio di "fatto"

```bash
npm test
LAYOUT=compact node scripts/verify-pagination.mjs   # 5 righe, tutte ok: SI
LAYOUT=compact node scripts/render-cv.mjs /tmp/cv-compact.pdf
```

più ispezione visiva del PDF contro lo sheet `data-variant="a"` di `design/design-board.html`
(`python3 design/build-board.py` lo rigenera dal profilo reale).

### Rischi

- `display: contents` su `.hero-text`: sostenuto da Chromium, ma cambia il contesto di
  formattazione — va verificato che `.hero-section { break-inside: avoid }` (print.css,
  riga 136) continui a tenere insieme l'header.
- L'aside a 58mm su un profilo con descrizioni lunghe (`profiles/stress/long.json`) può
  produrre una colonna molto più alta dell'altra e quindi pagine mezze vuote: dopo la
  Fase 0 il conteggio le vede, ma restano brutte. Se accade, è il caso 3 della regola qui
  sopra.

---

## Fase 3 — Layout `editorial` (variante B del board)

Colonna unica con corsia di etichette a sinistra (rail 26mm), zero card, gerarchia solo
tipografica. È la variante più sicura per gli ATS e va trattata come **layout di
riferimento per la stampa**.

### File nuovi

`layouts/editorial/screen.css`, `layouts/editorial/print.css`.

### Elementi già emessi

Gli stessi della tabella in Fase 2. In più serve un'etichetta di sezione nella corsia
sinistra: esiste già ed è statica in `index.html` —
`h3.section-title > span` ("Core Technologies", "Professional Experience", …). Il layout la
sposta nella corsia; non serve nessun nuovo elemento e nessun testo scritto nel JS.

### Classi CSS da scrivere

- Corsia: `.main-content section { display: grid; grid-template-columns: var(--rail) 1fr; column-gap: var(--s6) }`
  con `.main-content { --rail: 26mm }`; `.section-title { grid-column: 1; grid-row: 1 }`
  (font `--fs-micro`, maiuscoletto, `letter-spacing: .11em`, colore `--ink-3`), e i
  contenitori `#profile, #skills, #experience, #education, #languages, #certifications, #interests`
  in `grid-column: 2`.
- Nessuna card: azzerare bordi/ombre/riempimenti ereditati (`border`, `box-shadow`,
  `background`) su `.job-entry`, `.edu-entry`, `#certifications li`; separatori solo
  `border-top: .5px solid var(--rule-soft)` fra righe.
- Skill: `.skill-group { display: grid; grid-template-columns: 34mm 1fr }` come `.b-skill`
  del board (il commento del board alle righe 451-452 spiega perché griglia e non
  `inline-block`: un'etichetta più lunga della corsia deve spingere il testo, non
  incollarcisi). Run compatta visibile (`.skill-list`), badge nascosti.
- Contatti come riga singola separata: già prodotti come `.contact-line` +
  `span.inline-separator`; il layout cambia solo colore/spaziatura del separatore. **Non**
  sostituire i separatori con `content:` generato: `renderers/inlineSeparator.js` documenta
  (righe 5-14) che in stampa Chromium collassa gli spazi di `content: ' · '` e salda i due
  elementi.

### Renderer da estendere: nessuno

Editorial si regge interamente su ciò che esiste. È la ragione per cui viene prima di
`ledger`: valida i token e la corsia senza toccare JS.

### Cosa nasconde

Solo `.skill-badges` e, in stampa, `.hero-sidebar` (il ritratto: la variante B non lo
prevede). Tutto il resto resta visibile. La regola vale sempre: se un dato non piace al
layout, si nasconde in CSS, non si smette di emetterlo.

### Test da aggiungere

`tests/EditorialLayout.test.js`: la corsia è dichiarata (`--rail` esiste e vale `26mm`);
`.section-title` sta in colonna 1 e i contenitori in colonna 2; il layout non dichiara
`border-radius`/`box-shadow` su `.job-entry` (zero card); più il test parametrico
"non nasconde nessun dato" identico a quello di Fase 2.

### Criterio di "fatto"

```bash
npm test
LAYOUT=editorial node scripts/verify-pagination.mjs   # 5/5 SI
LAYOUT=editorial node scripts/render-cv.mjs /tmp/cv-editorial.pdf
pdftotext -layout /tmp/cv-editorial.pdf - | head -40   # ordine di lettura = ordine DOM
```

L'ultimo comando è il vero criterio ATS: il testo estratto deve uscire nell'ordine
`profile, skills, experience, education, languages, certifications, interests`, cioè il
`SECTION_ORDER` asserito in `tests/PrintLayout.test.js` (riga 19).

### Rischi

- Una corsia da 26mm con etichette lunghe ("Professional Experience") va a capo: previsto
  dal board (griglia, non larghezza fissa), ma va guardato sui 5 profili.
- Le etichette stanno in `index.html` e sono in inglese: restano dove sono. Tradurle
  significherebbe metterle nel JSON, che è un'altra decisione (contratto dati) e non
  appartiene a questo piano.

---

## Fase 4 — Layout `ledger` (variante C del board)

Date in colonna propria allineata (rail 30mm), header a fascia scura piena a tutta
larghezza.

### File nuovi

`layouts/ledger/screen.css`, `layouts/ledger/print.css`.

### Qui, e solo qui, serve estendere due renderer — in modo additivo

La corsia delle date richiede che la data sia un elemento **selezionabile e figlio diretto**
del blocco che la porta.

- **Esperienza: già a posto.** `ExperienceRenderer.createJobEntry()` (riga 39) appende
  `.job-period` come figlio diretto di `.job-entry`. Nessuna modifica.
- **Formazione: da estendere.** `EducationRenderer.createEducationEntry()` costruisce
  l'entry via `innerHTML` e annida `.edu-school` e `.edu-period` dentro un `<div>` anonimo
  (righe 20-27). La data non è raggiungibile per la corsia. Modifica additiva: dare una
  classe a quel `div`, `class="edu-meta"`, lasciando invariati `.edu-degree`,
  `.edu-school`, `.edu-period`, `.edu-description` e il testo prodotto. Il layout può
  allora fare `.edu-entry { display:grid; grid-template-columns: var(--rail) 1fr }` con
  `.edu-period { grid-column: 1 }` — oppure, se si preferisce non spezzare `.edu-meta`,
  spostare `.edu-period` fuori dal `div` come figlio diretto: anche questa è additiva
  (nessun campo perso, nessun testo cambiato) ma tocca l'ordine DOM, quindi va coperta da test.
- **Certificazioni: da estendere.** `CertificationsRenderer.createCertificationItem()`
  concatena `` ` – ${cert.issuer} (${cert.year})` `` come testo nudo (riga 62): l'anno non
  è selezionabile. Modifica additiva: avvolgere emittente e anno in
  `<span class="cert-issuer">` e `<span class="cert-year">` **senza cambiare di un carattere
  il testo risultante**. I test esistenti asseriscono `textContent` (`'Amazon (2023)'`,
  `'PMI (2022)'` in `tests/CertificationsRenderer.test.js`, righe 42 e 64) e continuano a
  passare solo se non si introduce spaziatura extra: è il modo giusto di verificare che la
  modifica sia davvero additiva.

Test da aggiungere in `tests/EducationRenderer.test.js` e
`tests/CertificationsRenderer.test.js` (i test esistenti **non** si toccano):

- `espone la data come elemento selezionabile` — `entry.querySelector('.edu-period')`
  esiste ed è figlio diretto del contenitore che il layout usa come griglia;
- `avvolge emittente e anno senza alterare il testo` —
  `item.querySelector('.cert-year').textContent` contiene l'anno **e**
  `item.textContent` è identico a quello prodotto prima della modifica (asserito
  letteralmente, es. `toContain('Amazon (2023)')`).

### Classi CSS da scrivere

- `.job-entry, .edu-entry, #certifications li { display:grid; grid-template-columns: var(--rail) 1fr; column-gap: var(--s5) }`
  con `.ledger { --rail: 30mm }` sul contenitore.
  `.job-period, .edu-period, .cert-year { grid-column: 1 }` in tono `--fs-micro` monospazio;
  tutto il resto in colonna 2.
- Fascia scura dell'header: `.hero-section { background: var(--ink); color: #fff }` a tutta
  larghezza (margini negativi come `.c-head` del board). Funziona in stampa perché
  `print.css` impone già globalmente `-webkit-print-color-adjust: exact` e
  `print-color-adjust: exact` (righe 46-53) — **non** serve ridichiararlo per elemento, ma
  il PDF va prodotto con `printBackground: true`, che `scripts/render-cv.mjs` (riga 82) e
  `scripts/verify-pagination.mjs` (riga 116) già passano.
- Skill a griglia 2×N come `.c-grid`/`.c-cell` del board: si ottiene con
  `#skills { display:grid; grid-template-columns: 1fr 1fr }` sui `.skill-group` esistenti.

### Cosa nasconde

`.skill-badges`, `.hero-sidebar`. Nient'altro.

### Attenzione alla misura

La corsia delle date **non** va realizzata con `position: absolute`: un `.job-period` fuori
flusso ha `topMm`/`heightMm` che non descrivono il flusso, falsando sia
`pageCountFromBlocks()` sia `cutIndexFor()`, e quando l'entry si spezza la data resta sulla
pagina precedente. Griglia (o `float`), mai assoluto. È lo stesso errore che i footer
posizionati in assoluto hanno già causato una volta (cfr. il commento di
`PageMeasurer.withPrintLayout()`, righe 40-46).

### Test da aggiungere

`tests/LedgerLayout.test.js`: `--rail` = `30mm`; `.job-period`/`.edu-period`/`.cert-year`
in `grid-column: 1`; **il layout non dichiara `position: absolute` su nessuno dei selettori
di `MEASURED_BLOCK_SELECTOR`** (guardia diretta sulla misura); test parametrico "non
nasconde nessun dato".

### Criterio di "fatto"

```bash
npm test
LAYOUT=ledger node scripts/verify-pagination.mjs   # 5/5 SI
LAYOUT=ledger node scripts/render-cv.mjs /tmp/cv-ledger.pdf
```

più confronto visivo con lo sheet `data-variant="c"` del board, fascia scura inclusa
(se la fascia esce bianca nel PDF, la causa è `printBackground`, non il CSS).

### Rischi

- Griglia + frammentazione: `.job-entry` è dichiarato `break-inside: auto` in `print.css`
  (righe 143-150) perché deve poter spezzarsi; un grid container che si spezza può lasciare
  la data separata dal corpo. Se `verify-pagination` mostra pagine incoerenti, il ripiego è
  la corsia solo a schermo e le date in linea in stampa.
- La fascia scura a piena larghezza deve rispettare i margini `@page 15mm 21mm`: margini
  negativi calibrati su quei valori e non su numeri inventati.

---

## Fase 5 — Selettore di layout per l'utente e persistenza

Oggi si sceglie solo con `?layout=<nome>` e `script.js` espone `window.cvLayout`.

### Cosa

- **`core/LayoutLoader.js`**, estensione additiva (nessuna firma esistente cambia):
  - `LAYOUTS = ['classic', 'compact', 'editorial', 'ledger']` — costante esportata, unica
    lista di verità, usata sia dal selettore sia dai test;
  - `storedLayout(storage)` / `rememberLayout(name, storage)`: lettura e scrittura della
    chiave `cv.layout` su `localStorage`, con `storage` iniettabile (i test non devono
    dipendere dal `localStorage` di JSDOM);
  - `resolveLayout(search, storage)`: precedenza **URL > memoria > default**;
  - `loadRequested()` continua a esistere e a restituire il nome caricato, ma delega a
    `resolveLayout()`; validazione invariata (`/^[a-z][a-z0-9-]*$/`, che già respinge
    traversal, path assoluti e protocolli — 6 casi coperti alle righe 31-40 di
    `tests/LayoutLoader.test.js`). Un nome non presente in `LAYOUTS` viene rifiutato come
    un nome malformato.
- **Controllo nell'interfaccia**: un `<select>` accanto al bottone "Print CV" in
  `index.html` (dentro `footer.print-footer`, già nascosto in stampa da `print.css`
  righe 110-113). Popolato **da `LAYOUTS`**, non con `<option>` scritte a mano — stessa
  regola del contenuto: niente elenchi duplicati nel markup. Al cambio: `rememberLayout()`
  e ricarica con il query param aggiornato (ricaricare è la scelta onesta: `LayoutLoader`
  aggiunge fogli e non li rimuove, e `script.js` carica il layout una volta sola prima del
  primo render).
- Densità e accento (Fase 1) seguono la stessa strada: `?density=tight|normal|loose`,
  `?accent=blue|mono` → classi `d-tight`/`d-loose`/`mono-accent` sul `<body>`, memorizzate
  con le chiavi `cv.density` e `cv.accent`. Sono token, quindi vivono accanto al layout,
  non dentro di esso.

### File toccati

`core/LayoutLoader.js` (additivo), `index.html` (un `<select>` vuoto + un `<select>` per la
densità), `script.js` (poche righe: popolare i select, applicare le classi token,
registrare il listener). Nessun renderer, nessun profilo JSON.

### Test da aggiungere

In `tests/LayoutLoader.test.js`, nuovi `describe` accanto a quelli esistenti:

- `l'URL vince sulla memoria` — `resolveLayout('?layout=ledger', storageCon('compact'))` = `'ledger'`;
- `senza URL usa la scelta memorizzata`;
- `senza URL né memoria non carica nulla` (comportamento di default invariato);
- `rifiuta un nome che non è nella lista dei layout` — `?layout=nonesiste` → `null`;
- `ricorda la scelta` — `rememberLayout('editorial', storage)` scrive `cv.layout`;
- `degrada senza localStorage` — `storage` assente o che lancia (Safari in modalità privata)
  → nessuna eccezione, si ricade sul default.

### Criterio di "fatto"

```bash
npm test
```

più prova manuale: aprire `index.html`, scegliere `ledger` dal select, ricaricare **senza**
query string → il CV è ancora in `ledger`; aprire `index.html?layout=editorial` → vince
l'URL; svuotare `localStorage` → si torna al layout di default.

### Rischi

- `file://` più `localStorage` può essere bloccato da alcuni browser: da qui il requisito
  "degrada senza eccezioni".
- Il selettore non deve finire nel PDF: sta dentro `.print-footer`, già nascosto in stampa.
  Da confermare con `pdftotext` (Fase 6): il testo del select non deve comparire.

---

## Fase 6 — Verifica end-to-end

### Cosa si esegue

```bash
# 1. suite unitaria
npm test

# 2. server statico che gli harness presuppongono
python3 -m http.server 8899 &

# 3. paginazione: 5 profili di stress × 4 layout + il default
node scripts/verify-pagination.mjs
for L in classic compact editorial ledger; do
  echo "== $L"; LAYOUT=$L node scripts/verify-pagination.mjs
done

# 4. profilo reale, un PDF per layout
node scripts/render-cv.mjs /tmp/cv-default.pdf
for L in classic compact editorial ledger; do
  LAYOUT=$L node scripts/render-cv.mjs /tmp/cv-$L.pdf
done

# 5. ordine di lettura per l'ATS, su ogni PDF
for f in /tmp/cv-*.pdf; do echo "== $f"; pdftotext -layout "$f" - | head -30; done
```

### Criteri di "fatto", tutti obbligatori

1. `npm test`: **nessun test in meno** di quelli verdi oggi (294) più quelli aggiunti nelle
   Fasi 0-5; zero fallimenti.
2. `verify-pagination.mjs`: **25 righe totali** (5 profili × 5 configurazioni, default
   incluso) con `ok: SI`. La colonna `pagine` (pagine `/Type /Page` estratte dal PDF) deve
   uguagliare `footer` (numero di `.page-footer` nel DOM) in ogni riga.
3. `render-cv.mjs`: per ogni layout stampa `N pagine` e un `DOM: {jobs, footers, markers}`
   con `footers === N` e `jobs > 0`.
4. `pdftotext`: in ogni PDF le sezioni escono nell'ordine `SECTION_ORDER` e **nessun campo
   sparisce fra un layout e l'altro** — controllo concreto: il testo estratto di ciascun
   layout contiene le stesse voci di `interests` e le stesse categorie di `skills` del
   profilo. Uno script di confronto (`diff` fra gli elenchi estratti) è preferibile
   all'occhio.
5. I PDF hanno un numero di pagine ragionevole e coerente col board (compact/ledger non
   devono costare pagine in più di editorial a parità di dati; se lo fanno, la densità è il
   token da girare, non il layout da riscrivere).

### File toccati

Nessuno, se tutto passa. Altrimenti si torna alla fase che ha rotto — non si aggiungono
correzioni in Fase 6.

### Rischi

- Il ciclo su 4 layout × 5 profili apre 20 istanze di Brave in sequenza
  (`scripts/verify-pagination.mjs` alloca la porta `9400 + rows.length` e ne uccide una per
  volta): lento, e se una istanza resta appesa la porta successiva collide. Se accade,
  `pkill -f 'remote-debugging-port=94'` fra un layout e l'altro.
- `verify-pagination.mjs` scrive in `/tmp/cv-verify-<layout>/`: cartelle diverse per
  layout, quindi i PDF non si sovrascrivono — è già così (riga 20), va solo ricordato quando
  si confrontano gli output.

---

## Trappole note (questo repo, non trappole generiche)

1. **Un layout che fa sparire un dato.** È già successo: `level` delle skill e la sezione
   `interests` andarono persi perché il layout chiese ai renderer markup diverso invece di
   nascondere in CSS. Il commento in testa a `core/LayoutLoader.js` (righe 4-8) e quello di
   `SkillsRenderer` (righe 7-22) esistono proprio per questo. Regola operativa: ogni layout
   ha il suo test parametrico "non nasconde nessun dato", e `SkillsRenderer` continua a
   emettere **sia** `.skill-list` **sia** `.skill-badges` per ogni gruppo.

2. **Cache di Chromium: si debugga codice vecchio credendolo nuovo.** Gli harness lo
   sanno e chiamano `Network.setCacheDisabled` (`verify-pagination.mjs` righe 73-74,
   `render-cv.mjs` righe 57-58). Qualunque nuovo script CDP deve fare lo stesso, e nel
   browser interattivo serve hard reload — un CSS di layout appena scritto è esattamente il
   tipo di file che il browser tiene in cache.

3. **Footer posizionati in assoluto che falsano la misura.** `.page-footer` è ancorato a
   `--page-index × 267mm` (`print.css` righe 627-640); se resta visibile durante la misura,
   allunga `scrollHeight` fino a confermare da solo il conteggio precedente e un CV di una
   pagina si porta dietro un secondo foglio vuoto. `PageMeasurer.withPrintLayout()` lo
   nasconde con `display:none !important` (serve `!important` perché `print.css` dichiara
   `display: block !important` sul contenitore) e ripristina in `finally`. **Nessun layout
   deve introdurre altri elementi in `position: absolute` fra quelli misurati.**

4. **Cut chiavizzati per elemento invece che per posizione.** `Paginator.measureCuts()`
   restituisce una `Map<posizioneEntry, indiceCut>`, non una `Map<Element, …>`: applicare
   un cut ri-renderizza la sezione e ogni elemento misurato risulta staccato dal DOM, così
   una mappa per elemento contiene solo orfani e il marker "(continued)" non compare mai.
   Inoltre si contano **tutte** le `.job-entry`, non solo quelle con bullet, altrimenti uno
   stage senza highlights sfasa tutti gli indici successivi (`profiles/stress/renamed-company.json`
   e `profiles/stress/short.json` esistono per questo). Vale anche per il conteggio pagine:
   `pageCountFromBlocks()` legge posizioni, non identità.

5. **Numeri scritti a mano.** Il conteggio pagine e l'indice di cut erano letterali in
   `script.js` (`PrintFooterRenderer(2)`, `beforeHighlight: 5`) e erano corretti solo per la
   copy con cui erano stati misurati; rinominare l'azienda faceva sparire il marker. Non
   reintrodurre costanti di contenuto in nessuna forma — nemmeno un `nth-child` di CSS che
   assume "il terzo lavoro è quello lungo".

6. **`content: ' · '` in stampa.** Chromium collassa gli spazi generati e salda i due
   elementi ai lati; per questo esiste `renderers/inlineSeparator.js` con un `<span
   class="inline-separator">` reale, e `joinSeparated`/`bindSeparators` con spazi
   unificatori per le righe che possono andare a capo. Un layout può ristilare
   `.inline-separator`, mai sostituirlo con contenuto generato.

7. **Lo schermo non è la stampa.** Misurato: 708,6mm a schermo contro 531,8mm in stampa per
   lo stesso contenuto (commento di `PageMeasurer`, righe 8-17). Ogni misura passa da
   `withPrintLayout()`; nessuna decisione di paginazione si prende da `getBoundingClientRect`
   sul layout a schermo.

8. **`@page` e i 267mm sono una costante sola.** `PAGE_CONTENT_HEIGHT_MM` in
   `core/PageGeometry.js` e `--page-content-height` in `print.css` devono restare uguali. Un
   layout che cambiasse i margini `@page` (oggi `15mm 21mm`) spezzerebbe silenziosamente
   l'ancoraggio dei footer e tutta l'aritmetica. **Nessuno dei tre nuovi layout ridichiara
   `@page`.** Se un giorno servisse, la costante va parametrizzata in entrambi i posti nella
   stessa modifica, con test.

9. **`grep` prima di dedurre.** Esempio trovato scrivendo questo piano: `.skill-badges` non
   è nascosto né in `style.css` né in `print.css`, pur essendo sempre emesso. Prima di
   scrivere una riga di layout, `grep -n '<classe>' style.css print.css layouts/*/*.css` —
   il repo ha già più fogli sovrapposti di quanti se ne ricordino.
