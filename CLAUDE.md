# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static CV/resume website built with vanilla HTML, CSS, and JavaScript. The CV content is driven by JSON data and rendered dynamically into the DOM using modular JavaScript renderers.

## Commands

### Testing
- **Run tests**: `npm test`
- **Run single test**: `npm test -- --testNamePattern="test name"`

### Development
- **Install dependencies**: `npm install`
- **Open CV**: Open `index.html` in a browser (no build step required)

## Architecture

### Data Flow
- CV data is stored in `cv-data.json` containing structured information (personal details, experience, education, skills, etc.)
- Main application loads JSON data via fetch and renders sections using dedicated renderer functions
- Each section is rendered by calling specific functions that manipulate the DOM directly

### File Structure
- `script.js` - Main application entry point that fetches CV data and orchestrates rendering
- `cv-data.json` - All CV content as structured JSON data
- `renderers/` - Directory containing modular rendering functions
- `tests/` - Jest tests for renderer functions
- `index.html` - Static HTML template with placeholders for dynamic content
- `style.css` - Styling for the CV layout

### Renderer Pattern
The project uses a modular renderer pattern where each major CV section has its own renderer function:
- `renderHeader.js` - Renders name, title, location, and contact information
- Additional renderers are inline in `script.js` for experience, education, skills, etc.

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