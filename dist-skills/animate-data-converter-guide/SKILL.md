---
name: animate-data-converter-guide
description: Use this skill whenever the user asks to extract, inspect, or debug the data that @tawaship/animate-data-converter extracts from Adobe Animate HTML5 Canvas (CreateJS) publish output — the engine-independent symbol and timeline definitions (IDefinition). Trigger on any mention of 'animate-data-converter', 'extractPublishedFile', 'extractPublished', 'expand', 'compact', 'IDefinition', 'converterVersion', definition JSON files, or unsupported-feature 'issues' reported for Animate content. To play content on PixiJS, use the pixi-animate-runtime-guide skill instead (its generator runs this converter for you); with Pixim.js, the pixim-animate-runtime-guide skill.
---

# @tawaship/animate-data-converter development skill

Supported versions: **`^0.1.0`** (written against `0.1.0`).

First determine the installed version (`node_modules/@tawaship/animate-data-converter/package.json`). If it is outside the supported range, **treat the type definitions in node_modules as authoritative** and follow them wherever they disagree with this skill.

The content is assumed to be published by **Adobe Animate 24.0.15** for HTML5 Canvas, the only version checked: this package depends on the form of the published JavaScript. If the user's content comes from another version of Animate and something does not work, mention this before looking for other causes.

## Overview

`@tawaship/animate-data-converter` reads the JavaScript that Adobe Animate publishes for HTML5 Canvas and extracts every symbol and its timeline as plain data (JSON-compatible), one definition per symbol, shared by every instance. A player for a specific engine builds on this data, so content can be played without CreateJS or the published code at play time.

- It runs in **Node.js 18 or later only**, at development time. Never suggest running it in the browser
- It reads only the published JavaScript. Images and sounds are not read, and CreateJS 1.0.0 comes with the package
- Most users do not call it directly: `@tawaship/pixi-animate-runtime`'s generator (`npx --no-install @tawaship/pixi-animate-runtime`) runs it. Use the converter directly only to keep definitions as files, to inspect them, or to build a player of your own

## Type definition files

**Before writing code that uses this package, check the corresponding type definition file.** Read them from the package installed in the project (`node_modules/@tawaship/animate-data-converter/types/`); that is the single source of truth.

| What | Type definition file |
|---|---|
| Entry point (everything exported) | `types/index.d.ts` |
| The definition (`IDefinition` and the types it is made of) | `types/types.d.ts` |
| `extractPublishedFile`, `extractPublished` | `types/load.d.ts` |
| `expand`, `compact`, `SLOT_DEFAULTS` | `types/compact.d.ts` |
| `extract` | `types/extract.d.ts` |
| The CreateJS surface `extract` reads | `types/createjs.d.ts` |

## Basic usage

### Command line

```sh
npx --no-install @tawaship/animate-data-converter game.js --out game.json --pretty
```

- `-o, --out <file>`: where to write (standard output without it). `-p, --pretty`: indented JSON. `-e, --expanded`: the expanded form instead of the compact one. `-f, --force`: write even with unsupported features. `-h, --help`: the usage
- Exit code `1` when the content uses unsupported features (each one is listed, nothing is written unless `--force` is given), `2` when the file cannot be read or is not Animate HTML5 Canvas output

### API

```js
const { extractPublishedFile } = require('@tawaship/animate-data-converter');

extractPublishedFile('game.js').then(definition => {
  definition.issues.forEach(issue => console.warn(issue.symbol, issue.message));
});
```

The published code runs in a sandbox (QuickJS, a JavaScript engine compiled to WebAssembly, given nothing of the host), so extraction is asynchronous. Still tell the user to convert only content they trust (see the README).

| Function | Use it for |
|---|---|
| `extractPublishedFile(path)` | Extracting from a file (returns a promise) |
| `extractPublished({ published })` | Extracting from source text already in hand (returns a promise) |
| `extract(createjs, source)` | Extracting from content already running in an environment you set up |
| `expand(definition)` / `compact(expanded)` | Converting between the compact form (what extraction gives) and the expanded form (every value as it is) |

When calling `extract()` on an environment of your own, images created while symbols are constructed must report that they have loaded as soon as an `onload` handler is assigned; otherwise bitmap fills from sprite sheets are missing from the definition. Prefer `extractPublished()`, which runs the published code in its sandbox (QuickJS) and does this.

## What the definition holds

The definition is extracted in its **compact form** (`form: 'compact'`): every value kept, written once (drawings in the content's `graphics` with `commandKinds`, slots as `slotTemplates` plus initial values, each tween's distinct `values` with the index of every position's values in `frames`). `expand()` gives the **expanded form** (`form: 'expanded'`), every value where it applies; read `IExpandedDefinition` for that. The README's "Reading a definition" explains both. pixi-animate-runtime's generator takes the compact form only.


- `symbols`: every symbol of the published `lib`, under its library name (non-ASCII names kept as they are). Published content has no root of its own; any symbol can be played as a root (the published HTML picks one)
- For a movie clip: labels, length, the display objects it owns with their initial state, masks, buttons, color effects, caching, and its tweens with **the exact value of every controlled property at every frame** (not approximated)
- Frame scripts as their **source text**, unchanged. They are not run or rewritten
- `manifest`, `spriteSheets`, `properties` (size, frame rate, background color), `issues`
- `converterVersion`: the converter version that extracted it. A reader of kept definition files can tell from it whether it knows their form

## Important notes

### Unsupported content is reported, not guessed

When `issues` is not empty, the content uses something outside the supported range (the Animate camera / "Advanced Layers", filters other than color effects, event listeners added by symbol code, hand-written looping/reversed tweens, non-plain frame script functions, display objects other than MovieClip/Shape/Sprite/Bitmap/Text). Report the listed issues to the user and suggest changing the Animate document (for the camera: delete the camera layer and publish again). Do not suggest `--force` as a fix: it only writes the data anyway.

### Publish again → extract again

The definition is a snapshot of one publish. After the content is published again from Animate, extract (or generate) again.
