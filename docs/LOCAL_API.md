# The local API

`npm run serve` serves the site and, under `/api/`, the local app's API: ten endpoints that read and save
the general CV, create and build applications, and run a **tailoring** — the full CV and an advert in, a
CV and a cover letter written for that advert out, checked against the full CV and printed.

This is the reference. `README.md` § The local app is the overview; this file says, for every endpoint,
what it takes, what it answers and why it refuses, and how the whole is built. Every answer shown below
was returned by a server on `main`, except where a section says it follows the code.

- [Starting the server](#starting-the-server)
- [Who may call it](#who-may-call-it)
- [Conventions](#conventions)
- [Endpoints](#endpoints)
- [A tailoring job, end to end](#a-tailoring-job-end-to-end)
- [The full CV and the letter defaults](#the-full-cv-and-the-letter-defaults)
- [Inference backends](#inference-backends)
- [How it is built](#how-it-is-built)
- [Recipes](#recipes)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

## Starting the server

```bash
npm run serve            # port 8080, this machine only
node scripts/serve.mjs 8124   # another port; PORT=8124 does the same
npm run serve -- --network    # also other devices on the network: the page, never applications/ or /api/
```

It prints what a client needs:

```
serving /path/to/cv-giovanni/ on 127.0.0.1:8124 with no-store
  this machine only; pass --network to reach another device
  http://localhost:8124/index.html?layout=nerd
  a CV from applications/ needs this run's key, once: http://localhost:8124/index.html?key=…
  edit the general CV, on this machine: http://localhost:8124/editor.html?key=…
  programs on this machine reach /api/ with Authorization: Bearer <the token in ~/.config/mycv/api-token>
```

The server works on the checkout it is started from: `scripts/serve.mjs` takes its project root from its
own path. Jobs and applications are written to that checkout's `applications/`, so start it from a checkout
that outlives the session — not from a scratch worktree under `/tmp`, which a reboot empties.

On start it takes the tailoring queue (see [The queue](#the-queue-and-its-lock)), resumes the jobs an
earlier run left waiting and marks failed the one it left running.

## Who may call it

The API writes the CV and runs scripts, so it answers exactly whom `applications/` answers. Two kinds of
caller get in:

- **This machine's browser**, holding the run's key. The address the server prints carries `?key=`; the
  server trades it for a cookie (`mycv-preview-<port>`, `HttpOnly`, `SameSite=Strict`) and redirects to the
  same address without it, so the key stays out of history and `Referer`. The key is 256 random bits, made at
  start, held in memory, written nowhere: a restart makes a new one.
- **A program on this machine**, sending `Authorization: Bearer <token>`. The token is in
  `~/.config/mycv/api-token` (`$XDG_CONFIG_HOME/mycv/api-token` when that is set and absolute), made on the
  first start — 256 random bits, mode 600 — and the same on every start after, so a client reads it once. The
  server prints where it is, never what it is. A token file other users can read is not used, and not
  replaced: the server says why and `/api/` stays closed to programs.

Either way the request must also come **directly from this machine**: from a loopback address, to a `Host`
that is `localhost`, `*.localhost` or a loopback address, with no `Forwarded`, `Via`, `X-Forwarded-For`,
`X-Forwarded-Host` or `X-Real-IP` header — and **from no other origin**: no `Origin` but the server's own,
and no `Sec-Fetch-Site` other than `same-origin` or `none`. The server grants no CORS preflight, so a page on
another site cannot send the header at all.

A request that fails any of this gets the server's plain `404 Not found`, as if there were no API — not a
401 that would confirm one:

```bash
curl -i http://localhost:8124/api/inference
# HTTP/1.1 404 Not Found
# Not found
```

The same answer comes back with a valid token and `Origin: http://evil.example`, `Host: mycv.example` or
`X-Forwarded-For: 10.0.0.2`.

The examples below use:

```bash
TOKEN=$(cat ~/.config/mycv/api-token)
API=http://localhost:8124/api
```

## Conventions

- **JSON in, JSON out.** A request with a body sends `Content-Type: application/json`; the answer is
  `application/json; charset=utf-8`, except the two downloads, which are PDFs.
- **Nothing is cached**: every answer carries `Cache-Control: no-store`.
- **A body is at most 1 MiB** (1,048,576 bytes).
- **A name or an id** — an application's name, a job's id — is lowercase letters and digits with hyphens
  inside, at most 40 characters: `^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`. It becomes a directory and a word in
  every filename.
- **A refusal** is `{ "error": "<one sentence>" }`, and, when there is more than one thing wrong,
  `"problems": [{ "path": "<field>", "reason": "<what it must be>" }]` with every one of them. The sentence
  names the first and counts the rest.

What the HTTP layer itself refuses, before any service sees the request:

| Status | When                                            | Answer                                                                |
| -----: | ----------------------------------------------- | --------------------------------------------------------------------- |
|    404 | No endpoint at the path                         | `{"error":"No endpoint at /api/nowhere."}`                            |
|    405 | The path exists, the method does not            | `{"error":"/api/profile does not take DELETE."}`, `Allow: GET, PUT`   |
|    415 | A body without `Content-Type: application/json` | `{"error":"Send JSON, as Content-Type: application/json."}`           |
|    413 | A body past 1 MiB                               | `{"error":"A request body is at most 1048576 bytes."}`                |
|    400 | A body that is not JSON                         | `{"error":"The request body is not valid JSON."}`                     |
|    400 | A name or id that is not valid URL encoding     | `{"error":"The address does not name an application or a job."}`      |
|    500 | A service failed in a way it did not foresee    | `{"error":"The local app failed: the terminal running it says why."}` |

A 500 never carries the error: it can hold a path on this machine, so it goes to the terminal running the
server.

## Endpoints

### GET /api/profile

The general CV, `profiles/general/en.json`, as the file holds it.

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/profile
# {"name":"Giovanni Trovato","title":"Senior iOS Engineer", … }
```

| Status | When   |
| -----: | ------ |
|    200 | Always |

### PUT /api/profile

Replaces the general CV with the body, after checking it against `core/ProfileShape.js`, the shape the
renderers read and the editor builds its form from. It is written as the file is kept — two-space JSON and a
closing newline — so saving the profile unchanged changes no byte of it.

```bash
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @profiles/general/en.json $API/profile
# {"path":"profiles/general/en.json"}
```

| Status | When                                                                           |
| -----: | ------------------------------------------------------------------------------ |
|    200 | Written; the answer says where                                                 |
|    422 | The body does not have the profile's shape: `problems` lists every field wrong |

**The body replaces the whole file.** At the top level only `name` is required, so `{"name":"Ada"}` is
accepted and leaves a CV of one line (#387). Send the whole profile you read, never a part of it.

### GET /api/inference

Which backend a run would use and how it is charged, before any run — and why each backend before it was
passed over.

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/inference
```

```json
{
  "backend": "claude-cli",
  "cost": {
    "charged": "by whatever the claude CLI on this machine is signed in to",
    "note": "A Claude subscription adds no charge per run; an API key the CLI itself is set up with is charged per run."
  },
  "unavailable": []
}
```

With no backend, `backend` and `cost` are `null` and `unavailable` holds
`{ "backend": "…", "reason": "…" }` for each. The API key backend's `cost` carries `usdPerMillionTokens`
for every model and the date those prices were read (`pricesAsOf`).

| Status | When   |
| -----: | ------ |
|    200 | Always |

`claude-cli` is reported available when `claude --version` answers, which does not prove it is signed in: an
expired login shows here as available and fails the first job (#381).

### POST /api/applications

Creates an application by hand: `applications/<name>/advert.txt` with the advert, and
`applications/<name>/en.json`, a copy of the general CV to edit. No model runs; this is the manual path, and
[a tailoring](#post-apitailorings) is the automatic one.

| Field    | Type   | Required | Meaning                                  |
| -------- | ------ | -------- | ---------------------------------------- |
| `name`   | string | yes      | The application's name (see Conventions) |
| `advert` | string | yes      | The advert's text, not empty             |

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"api-docs-example","advert":"Senior iOS Engineer. Swift, SwiftUI, XCTest, GitLab CI."}' \
  $API/applications
# {"name":"api-docs-example","profile":"applications/api-docs-example/en.json","advert":"applications/api-docs-example/advert.txt"}
```

| Status | When                                                                                      |
| -----: | ----------------------------------------------------------------------------------------- |
|    200 | Created; the answer names the two files                                                   |
|    409 | `applications/<name>` exists already, or `<name>` is a published profile, which would win |
|    422 | The name is not a valid name, or the advert is missing or empty                           |

The answer to `general`, for example: `{"error":"\"general\" is a published profile: an application of that
name would be ignored, because the published profile wins."}`

### POST /api/applications/{name}/build

Prints the application: `npm run build:pdf -- --profile=applications/<name>/en.json`, writing the CV — and
the letter, when the profile has a `letter` — into `applications/<name>/out/`. The body is ignored, but a
`POST` must still say `Content-Type: application/json`, or it is refused with 415.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  $API/applications/api-docs-example/build
```

The answer is how the script ended, whatever it found:

```json
{
  "exitCode": 0,
  "signal": null,
  "stdout": "…applications/api-docs-example/out/giovanni-trovato-api-docs-example-en-technical.pdf\n…",
  "stderr": ""
}
```

`exitCode` is `0` printed, `1` failed, `2` checked nothing, `null` stopped by `signal` or by the ten-minute
limit a script run has.

| Status | When                                                                  |
| -----: | --------------------------------------------------------------------- |
|    200 | The script ran; read `exitCode`                                       |
|    404 | No application of that name, or its `en.json` or `advert.txt` is gone |

### POST /api/applications/{name}/match

Measures the printed CV against the advert: `npm run audit:ats -- --profile=… --advert=…`. It reads the PDF,
so **build first**: before a build it answers `exitCode: 2` and says so in `stderr` —
`audit-ats: no PDFs under applications/api-docs-example/out — nothing was checked.`

The answer has the shape `build` gives. The report is in `stdout` and in `applications/<name>/out/ATS_AUDIT.md`.

| Status | When                                           |
| -----: | ---------------------------------------------- |
|    200 | The script ran; read `exitCode`                |
|    404 | No application of that name, or a file is gone |

### POST /api/tailorings

Queues a tailoring and answers **202 at once**: a job at maximum effort takes minutes, longer than a request
should stay open. Poll [its state](#get-apitailoringsid) until it ends.

| Field          | Type    | Default         | Meaning                                                                                                                        |
| -------------- | ------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `advert`       | string  | — (required)    | The advert's text                                                                                                              |
| `cv`           | object  | the full CV     | A CV to start from instead, in the profile's shape; replaces both the full and the published CV                                |
| `letter`       | object  | the defaults    | `salaryExpectation`, `startDate`, `note`: overrides the [letter defaults](#the-full-cv-and-the-letter-defaults) field by field |
| `language`     | string  | `en`            | Any language with catalogues under `locales/`: `en`, `de`. Another than `en` translates the English CV                         |
| `model`        | string  | `claude-opus-5` | `claude-opus-5`, `claude-sonnet-5` or `claude-fable-5-1`                                                                       |
| `effort`       | string  | `max`           | `low`, `medium`, `high`, `xhigh` or `max`                                                                                      |
| `layout`       | string  | `technical`     | Only the layout every CV is printed in, the manifest's `pdf`                                                                   |
| `auditRetries` | integer | `2`             | How many times a print past its pages goes back to the model, 0 to 5                                                           |
| `auditGate`    | boolean | `true`          | Whether a print that still fails ends the job failed (`true`) or ready with its failures listed                                |

Any other field is refused, naming the ones accepted.

```bash
jq -n --rawfile advert advert.txt \
  '{advert: $advert, letter: {note: "I can work US hours."}}' > request.json
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @request.json $API/tailorings
```

```json
{
  "id": "20260922-180303-c8a0ff",
  "status": "running",
  "estimateSeconds": 480,
  "estimateBasis": "seed",
  "backend": "claude-cli",
  "cost": { "charged": "by whatever the claude CLI on this machine is signed in to", "note": "…" },
  "source": "~/.config/mycv/full-cv/en.json"
}
```

`status` is `running` when nothing was ahead of it, `queued` otherwise. `estimateSeconds` counts every job
ahead too. `source` is where the CV it starts from came from: `request`, the full CV's file, or
`profiles/general/en.json`.

A request with several problems names them all:

```json
{
  "error": "The tailoring cannot run as asked: model is one of claude-opus-5, claude-sonnet-5, claude-fable-5-1; not gpt-5, and 3 more.",
  "problems": [
    {
      "path": "model",
      "reason": "is one of claude-opus-5, claude-sonnet-5, claude-fable-5-1; not gpt-5"
    },
    { "path": "effort", "reason": "is one of low, medium, high, xhigh, max; not extreme" },
    { "path": "auditRetries", "reason": "is a whole number from 0 to 5; not 9" },
    { "path": "letter.startDate", "reason": "must be a date, YYYY-MM or YYYY-MM-DD" }
  ]
}
```

| Status | When                                                                                                                      |
| -----: | ------------------------------------------------------------------------------------------------------------------------- |
|    202 | Queued, or already running                                                                                                |
|    409 | Another server on this checkout runs the queue: the answer names its process and the lock file                            |
|    422 | The request: no advert, an unknown field, an option out of range, a `cv` without the profile's shape, a bad `letter`      |
|    503 | The full CV or the letter defaults cannot be used (readable by others, not JSON, wrong shape), or no backend is available |

`startDate` must be a day the calendar has: `2026-02-31` is refused, not moved to March.

### GET /api/tailorings/{id}

The job's state, as written in `applications/<id>/state.json`, with `secondsLeft`, and `downloads` once it is
ready.

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/tailorings/20260922-180303-c8a0ff
```

| Field                                | Present                      | Meaning                                                                            |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------- |
| `id`, `createdAt`                    | always                       | The id, and when the job arrived                                                   |
| `status`                             | always                       | `queued`, `running`, `ready` or `failed`                                           |
| `model`, `effort`                    | always                       | What the job runs with                                                             |
| `backend`, `cost`                    | always                       | The backend, as `GET /api/inference` said; after the run, `cost.usd` summed        |
| `source`                             | always                       | Where its CV came from                                                             |
| `estimate`                           | always                       | `{ "seconds": …, "basis": "seed" \| "measured" }`                                  |
| `secondsLeft`                        | always                       | This job's estimate, and every job's ahead, less the time it has run; 0 once ended |
| `attempts`                           | always                       | Model calls so far, retries included                                               |
| `startedAt`, `finishedAt`, `seconds` | once it runs, ends           | Timestamps, and how long it ran                                                    |
| `reason`, `problems`                 | failed                       | Why, as one sentence, and every failure as `{ path, reason }`                      |
| `result`                             | ready, or failed at the gate | What the job produced: see below                                                   |
| `downloads`                          | ready                        | `{ "cv": "/api/tailorings/<id>/cv", "letter": "/api/tailorings/<id>/letter" }`     |

`result` holds:

- `tailored` — `applications/<id>/tailored.json`, the tailored CV with its letter;
- `report` — the model's own account: its `argument`, what it `cut`, `moved` and `reworded`, the `language`
  and whether it `translated`;
- `sources` — for every role, achievement and career highlight, the item of the full CV it came from;
- `questions` — what the advert asks for that the full CV does not evidence, and what the model says it
  would have needed: `{ "from": "advert" | "model", "term"?, "question" }`;
- `attempts`, `cost` — every model call and its summed cost;
- `gate` — `{ passed, failures: [{ document, check, copy, reason }], notRun, retries }`: what the print
  audits found, which failures the copy can fix (`copy: true`), and which audits did not run;
- `files` — on a ready job, the printed documents.

A failed job's state, trimmed:

```json
{
  "status": "failed",
  "attempts": 4,
  "seconds": 694,
  "cost": { "backend": "claude-cli", "usd": 2.460915 },
  "reason": "The print failed its gate after 2 retries: the CV printed 3 pages, and must fit 2: cut it until it does, and 5 more.",
  "problems": [
    { "path": "cv", "reason": "the CV printed 3 pages, and must fit 2: cut it until it does" },
    { "path": "cv", "reason": "the CV fails bulletsScan in audit:print" },
    {
      "path": "letter",
      "reason": "the letter printed 2 pages, and must fit 1: cut it until it does"
    }
  ],
  "result": {
    "tailored": "…",
    "report": { "…": "…" },
    "questions": ["…"],
    "gate": { "passed": false, "…": "…" }
  },
  "secondsLeft": 0
}
```

| Status | When                                                       |
| -----: | ---------------------------------------------------------- |
|    200 | The job exists, whatever its state                         |
|    404 | `{"error":"No tailoring job \"20260101-000000-abcdef\"."}` |

A server that does not hold the queue answers from the state file the other server wrote.

### GET /api/tailorings/{id}/cv

A ready job's CV, as a PDF to save. This section follows the code: no job has ended ready on the machine
this reference was written on.

```bash
curl -s -OJ -H "Authorization: Bearer $TOKEN" $API/tailorings/<id>/cv
```

The answer is `application/pdf` with `Content-Disposition: attachment; filename="…"`, named for the
recruiter who receives it, as the public CV's download is: the candidate, the CV's title and the document —
`Ada-Lovelace-Senior-iOS-Engineer-CV.pdf`. `-OJ` saves it under that name.

| Status | When                                                                                                    |
| -----: | ------------------------------------------------------------------------------------------------------- |
|    200 | The PDF                                                                                                 |
|    404 | No such job; the job failed (`The job <id> failed: it delivered no cv.`); or the file is gone from disk |
|    409 | The job is queued or running: `The job <id> is running: its cv is not printed yet.`                     |

### GET /api/tailorings/{id}/letter

The ready job's cover letter, as `…/cv` gives the CV, named in the job's language:
`Ada-Lovelace-Senior-iOS-Engineer-Cover-Letter.pdf`, `…-Anschreiben.pdf`. The same statuses.

## A tailoring job, end to end

```
POST /api/tailorings ─▶ queued ─▶ running ─┬─▶ ready   (downloads)
                                            └─▶ failed  (reason, problems)
```

### What a job does

1. **Accept.** The request is checked field by field (422 with every problem). The CV it starts from is
   chosen — the request's `cv`, else the full CV, else the published one — and so are the letter's defaults,
   with the request's `letter` over them. A backend must be available (503).
2. **Write down.** A new directory, `applications/<id>/`, gets the advert, the options and the starting CV,
   and a `state.json` saying `queued`. The id is the arrival time and six random hex digits:
   `20260922-180303-c8a0ff`.
3. **Tailor** (`core/Tailor.js`). The model gets the system prompt `prompts/tailor-cv.md`, byte for byte, and
   a prompt with the CV, the advert, the advert's terms and where the CV evidences each, and the letter's
   defaults. It answers with a tailored profile, its letter, the `sources` of every item, a report and its
   questions. The job dates and signs the letter itself.
4. **Check** (`core/ProvenanceCheck.js`). Every item is held to the item of the full CV it names: a figure, a
   date, a name or a technology its source does not state, a role whose employer, title or period changed, a
   skill the CV does not list — each fails. The failures go back to the model, **at most twice** (three
   calls). Still failing, the job ends `failed` with every failure. Nothing lifts this check: a CV that
   invented a figure is not a CV to send with a warning.
5. **Print** (`core/TailoringPrint.js`). The tailored profile is written to `applications/<id>/<language>.json`
   and printed and audited by the scripts the command line runs, in the one layout: `build:pdf`,
   `audit:print`, `audit:ats`.
6. **Gate** (`core/TailoringJob.js`). A document past its pages — the CV on two A4 pages, the letter on one —
   is the copy's to fix, and goes back to the model with what failed, up to `auditRetries` times; each time
   the check runs again before the print. Any other failed check is treated as a layout defect the copy cannot
   fix, and is not sent back (#17; but see #385). When the last print still fails, `auditGate` decides:
   `true`, the job fails with its results and nothing to download; `false`, it is ready and its `gate` lists
   every failure. An audit that did not run is never a pass, and a build that printed nothing fails the job
   whatever the gate.

Each round of tailoring — the first, and each one a print sends back — has **one hour**; each model call in
it gets what is left of that hour.

### The files a job writes

| File                                | Written                  | Holds                                                                           |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `applications/<id>/advert.txt`      | on arrival               | The advert, as sent                                                             |
| `applications/<id>/request.json`    | on arrival               | Every option with its default, and the letter's fields after overrides          |
| `applications/<id>/source.json`     | on arrival               | The CV the job starts from, as it was then                                      |
| `applications/<id>/state.json`      | on arrival, every change | What `GET /api/tailorings/<id>` answers                                         |
| `applications/<id>/tailored.json`   | when the check passes    | The tailored CV and its letter                                                  |
| `applications/<id>/<language>.json` | before each print        | What was printed: the tailored profile, a local profile named for the job       |
| `applications/<id>/out/`            | at each print            | The PDFs, `manifest.json`, `PRINT_AUDIT.md`, `PRINT_AUDIT.json`, `ATS_AUDIT.md` |

Nothing under `applications/` is ever deleted automatically, and git ignores all of it: a CV written for a
named employer names the employer, and this repository is public. A tailored CV leaves the machine only as an
attached PDF.

### The estimate

Until ten jobs with the same model, effort and backend have ended ready, the estimate is a seed: 90 seconds at
`low`, 150 at `medium`, 240 at `high`, 360 at `xhigh`, 480 at `max`, and `estimateBasis` says `seed`. After
that it is the median of the last ten, retries included, and says `measured`. Failed jobs never count: one
that failed at once would drag the median towards nothing.

### The cost

With the claude CLI signed in to a subscription, a job adds no charge; the CLI still reports what the run
would have cost, and the state keeps it as `cost.usd`. With the API key, `cost.usd` is what was charged,
from the prices in `adapters/AnthropicApiInference.js`.

### The queue and its lock

Jobs run **one at a time, in order of arrival**: one machine should not run three models and three headless
Chromes at once, and a subscription's limits are per account.

One server per checkout runs the queue, and says so in `applications/.queue-lock.json` with its process id.
A second server started on the same checkout answers the jobs' state from disk and refuses new ones with 409,
naming the process that runs them. It takes the queue over once that process has stopped — or died: a lock
whose process is gone is stale, and is taken over. If the refusal names a process that is not a server, delete
the lock file it names.

A server stopping lets the queue go. On the next start, a job left `running` is marked `failed` —
`The job was interrupted: the server stopped while it ran.` — and the jobs left `queued` run again, in their
order of arrival.

## The full CV and the letter defaults

A tailoring subtracts from a CV that lists everything, so it starts from the **full CV** its owner keeps
outside the repository:

| File                                 | Holds                                                               |
| ------------------------------------ | ------------------------------------------------------------------- |
| `~/.config/mycv/full-cv/en.json`     | The full CV, in the profile's shape                                 |
| `~/.config/mycv/full-cv/letter.json` | What every letter is told: `salaryExpectation`, `startDate`, `note` |

Both are read when a job is created, so an edit holds for the next job without a restart. Both must be
readable only by their owner (`chmod 600`): one that others can read is refused with 503. A missing file is
not an error — the job starts from the published CV, or with no letter defaults.

- `salaryExpectation` — text, as the letter should state it.
- `startDate` — `YYYY-MM` or `YYYY-MM-DD`, worded in the letter's language by `Intl`.
- `note` — what the owner wants the letter to say, in the letter's language. The check accepts the figures
  and names the note states, so a fact the full CV does not hold can reach the letter only through it.

A request's `letter` overrides these field by field, for that job only. A field cannot be removed that way:
an empty string is refused. The prompt tells the model to state the salary and the start as given "or
absent", and nothing yet enforces that the salary appears only when the advert asks for it (#376).

The published CV is meant to be a tailoring of the full CV too, and the same check applies to it; nothing in
the repository runs it on its own yet (#386).

## Inference backends

`core/Inference.js` tries the backends in order and uses the first available:

1. **`claude-cli`** — `adapters/ClaudeCliInference.js`. The local `claude` executable, on whatever it is
   signed in to. Each call runs `claude -p --output-format json --tools "" --strict-mcp-config
--no-session-persistence --model <model> [--effort <effort>] --system-prompt <prompt>`, with the prompt on
   stdin, in an empty directory made for the call and removed after it: no tools, no MCP servers, no saved
   session, no project's `CLAUDE.md`. What the user configured in `~/.claude` still applies. A call runs for
   what is left of the round's hour; one past it is stopped (`SIGTERM`, then `SIGKILL` five seconds later).
2. **`anthropic-api`** — `adapters/AnthropicApiInference.js`. The Anthropic SDK with the key in
   `~/.config/mycv/anthropic-api-key` (mode 600), streamed, with `max_tokens` at the models' output ceiling so
   thinking at `max` effort does not truncate the answer. It refuses a model it has no prices for, so a run is
   never started without saying what it costs.

Neither sees the other's credentials, and no service in `core/` sees any.

## How it is built

Ports and adapters, as the rest of the repository (`CLAUDE.md`):

```
scripts/serve.mjs          HTTP: static files, the key, the token, who may call
  └─ adapters/LocalApi.js  the routes: find, read JSON, call one service method, write JSON
       └─ core/            the services — no HTTP, no files, no processes
            ProfileStore       GET/PUT /api/profile
            Applications       /api/applications…
            Inference          /api/inference, and every model call
            Tailorings         /api/tailorings…: the queue, the jobs' state, the downloads
              └─ TailoringJob  tailor → print → gate, with retries
                   ├─ Tailor         the model, then ProvenanceCheck
                   └─ TailoringPrint build:pdf, audit:print, audit:ats
       └─ adapters/        the machine: NodeProjectFiles, NodeScripts, ClaudeCliInference,
                           AnthropicApiInference, FullCvFiles, ApiToken, QueueLock, ConfigDirectory
```

The decisions behind it:

- **A route only passes a request through.** `tests/LocalApi.test.js` reads `ROUTES` in
  `adapters/LocalApi.js` as source and fails when a route does more than call one service method: the browser
  and the command line then run the same code, and no rule lives in a view. `tests/LocalApiIsDocumented.test.js`
  fails when a route and this file stop naming the same endpoints.
- **A tailoring is a job, not a request.** Opus at maximum effort thinks for minutes; a request held open that
  long is what timeouts end. So `POST` answers 202 with an id and an estimate, and the client polls.
- **The job's state lives on disk**, in `applications/<id>/state.json`, written in order after every change,
  so a job survives the server stopping and a second server can answer for it.
- **The check comes before the print.** A print takes a headless Chrome and three scripts; a CV that states
  something its source does not must never reach one, however it would have looked.
- **Only what the copy can fix goes back to the model.** Another attempt costs minutes at maximum effort, so a
  layout defect — a margin, a contrast, a typeface — is not sent to a model that cannot change it (#17).
- **The token stands in for the cookie and for nothing else.** A program without a browser gets in with it,
  but the request must still come directly from this machine and from no other origin.
- **Secrets and records stay outside the repository.** The token, the API key, the full CV and the letter
  defaults live under `~/.config/mycv/`; `adapters/ConfigDirectory.js` refuses a place for them inside the
  project, by the path as written and by where it really leads.
- **An unauthorised request finds nothing**, not a 401: the API does not confirm it exists.

## Recipes

### Tailor a CV to an advert, from a shell

```bash
TOKEN=$(cat ~/.config/mycv/api-token); API=http://localhost:8124/api
curl -s -H "Authorization: Bearer $TOKEN" $API/inference        # a backend, before spending anything
jq -n --rawfile advert advert.txt '{advert: $advert}' > request.json
ID=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  --data-binary @request.json $API/tailorings | jq -r .id)
while :; do
  STATE=$(curl -s -H "Authorization: Bearer $TOKEN" $API/tailorings/$ID)
  echo "$STATE" | jq -r '"\(.status) — \(.secondsLeft)s left, \(.attempts) attempts"'
  case $(echo "$STATE" | jq -r .status) in ready|failed) break ;; esac
  sleep 30
done
echo "$STATE" | jq '.reason, .result.questions'
curl -s -OJ -H "Authorization: Bearer $TOKEN" $API/tailorings/$ID/cv
curl -s -OJ -H "Authorization: Bearer $TOKEN" $API/tailorings/$ID/letter
```

Read `result.questions` whatever the outcome: what the advert asks for and the full CV does not evidence is
an answer for the full CV, where it holds for every application after, never a line to add to this one.

### Finish a failed job by hand

A job that failed its gate keeps its last tailored CV in `applications/<id>/<language>.json`. To finish it:

1. Copy the job's directory to a new name under `applications/`, so the model's answer stays as it was.
2. Edit that `en.json`: shorten, reorder, remove. Anything added must come from the full CV, word for word
   where it can.
3. Hold it to the full CV. There is no command for this yet (#386): `ProvenanceCheck.failures` in
   `core/ProvenanceCheck.js` takes the full CV, the edited profile, the job's `sources` re-keyed to the edit,
   the advert and the letter defaults, and must return no failure.
4. Print and audit it as the job would:

   ```bash
   npm run build:pdf -- --profile=applications/<name>/en.json --layout technical
   npm run audit:print -- --profile=applications/<name>/en.json --layout technical
   npm run audit:ats -- --profile=applications/<name>/en.json --layout technical
   ```

   The documents are in `applications/<name>/out/`, the reports beside them.

## Troubleshooting

| Symptom                                                                        | Why, and what to do                                                                                                                 |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Every `/api/` call answers `404 Not found` in plain text                       | Not a trusted caller: no token or a wrong one, or a `Host`, `Origin` or proxy header that says it is not this machine's own request |
| The server prints `programs cannot reach /api/: …`                             | The token file cannot be used: the reason says why — usually `set its mode to 600`                                                  |
| `409` on `POST /api/tailorings`, naming a process                              | Another server on this checkout holds the queue. Send the job to it, or stop it; if the process is no server, delete the lock file  |
| A job fails with `The claude CLI did not answer: Failed to authenticate…`      | The CLI's login expired. Run `claude`, then `/login`, and send the job again (#381)                                                 |
| `503 No inference is available on this machine — …`                            | Neither backend can run: install and sign in to `claude`, or put a key in `~/.config/mycv/anthropic-api-key`                        |
| `503 The full CV at ~/.config/mycv/full-cv/en.json can be read by other users` | `chmod 600` the file                                                                                                                |
| A job fails its gate on pages, and its first page is half empty                | The first role moved whole to the next page; cutting elsewhere does not help. Finish it by hand (#383)                              |
| `match` answers `exitCode: 2`                                                  | Nothing was printed yet: `build` first                                                                                              |
| A job stays `running` after the server was killed                              | It is marked failed as interrupted on the next start; send it again                                                                 |

## Known limitations

- **#376** — nothing enforces that a letter states the salary only when the advert asks for it.
- **#381** — `GET /api/inference` reports the CLI available while its login has expired.
- **#382** — a heading such as `PREFERRED:` is not read as one, so preferred items are asked about as
  requirements, and plain words ("end", "real", "feel") pass as terms.
- **#383** — a job told its CV runs to three pages is not told why, and cuts content that is not the cause.
- **#385** — bullets and a summary that run too long fail the print but are never sent back to the model.
- **#386** — a hand-edited tailored CV cannot be checked against the full CV from the command line.
- **#387** — `PUT /api/profile` replaces the whole CV with any object that has a `name`.
- The PDFs carry no real structure tree: see `AGENTS.md` § Known limitation.
