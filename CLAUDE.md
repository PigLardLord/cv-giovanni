# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The project's instructions are in @AGENTS.md — read and follow them.

## Project Overview

This is a static CV/resume website built with vanilla HTML, CSS, and JavaScript. The CV content is driven by JSON data and rendered dynamically into the DOM using modular JavaScript renderers.

## Commands

### Testing

- **Run tests**: `npm test`
- **Run single test**: `npm test -- --testNamePattern="test name"`

### Development

- **Install dependencies**: `npm install`
- **Serve the site**: `npm run serve` (sends `no-store`; never `python -m http.server` — its
  heuristic caching has hidden real changes more than once)
- **Serve to another device**: `npm run serve -- --network` (by default the server answers only this
  machine; hidden paths such as `.git/` are never served, and `applications/` goes only to this machine's
  own browser once it has opened the `?key=` address the server prints — a new key every run, so neither a
  proxy nor a raw TCP tunnel reaches a tailored CV)
- **Open CV**: Open `index.html` in a browser (no build step required)

### Formatting

- **Format everything**: `npm run format` (Prettier — `npm test` fails on any file it would change)
- **Check only**: `npm run format:check`

### Artefacts

- **Generate the PDFs**: `npm run verify:pdf` (build, then audit the twelve variants)
- **Audit what the browser prints**: `npm run audit:print` (needs Chrome; `CHROME_PATH` overrides)
- **Audit what a reader copies off the screen**: `npm run audit:screen` (needs Chrome; `CHROME_PATH` overrides)

### Publishing

- **A merge to `main` publishes.** `.github/workflows/gates.yml` runs every gate on it, then its `deploy`
  job hands GitHub Pages the tree with the PDFs that run built. A red gate publishes nothing, and nothing
  else publishes: the Pages source is the workflow, not the branch.

## Architecture

Ports and adapters. `AGENTS.md` holds the product rules and the settled decisions; this is the map.

### Data flow

A CV is `profile × locale × layout`. `config/cv-manifest.json` declares the supported combinations;
`ProfileResolver` reads `?profile=` and refuses an unknown one rather than falling back. Content
lives in `profiles/<profile>/<locale>.json`, labels in `locales/<lang>/`, and `domain/CvDocument.js`
normalises the two into the model every output boundary consumes.

There are **two artefacts and they do not share a DOM**: the page renders through `renderers/`,
while the PDF is composed from the model by `adapters/PdfLayout.js` and written by pdfmake. That is
why there are three audits.

### Layers

- `domain/` — the model, framework-free, no I/O.
- `core/` — application services: `CVApplication`, `DataLoader`, `PdfExporter`, `ProfileResolver`,
  `I18nService`. No markup, no typography, no hex colours — `tests/CoreHasNoUI.test.js` enforces it.
- `interfaces/` and `boundaries/` — the ports.
- `renderers/` — the DOM implementations, all extending `BaseRenderer`.
- `adapters/` — the PDF implementations: layout, design system, theme registry, pdfmake renderer.
- `scripts/` — generation, the audits, and the no-store development server.
- `vendor/` — i18next and Inter, checked in so the page runs off the file tree with no install step.

### Testing Setup

- Uses Jest with JSDOM for DOM testing
- ES modules configuration with `node --experimental-vm-modules`
- Test environment configured for DOM manipulation testing
- Tests focus on verifying DOM content insertion and formatting

## Key Design Decisions

- Pure vanilla JavaScript (no frameworks)
- JSON-driven content for easy updates
- Modular renderer functions for maintainability
- Static hosting friendly (no build process)
- Print-optimized styling
