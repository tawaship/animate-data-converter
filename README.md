# @tawaship/animate-data-converter

Turns what Adobe Animate publishes for HTML5 Canvas into plain data that any engine can play from.

- **What you get**: every symbol and its timeline, with the value of every property at every frame as CreateJS
  computes it, as JSON-ready data (written compactly; every value can be expanded)
- **What it is for**: building a player for an engine without CreateJS and without the published code at play
  time. [@tawaship/pixi-animate-runtime](https://github.com/tawaship/pixi-animate-runtime) is such a player for
  PixiJS, and runs this package for you
- **How**: a command (or a function) reads the published JavaScript at development time

**Status: under development.** The format of the extracted data may still change between 0.x versions
(a definition records the version that extracted it, see `converterVersion` below).

API reference: https://tawaship.github.io/animate-data-converter/docs/

**Convert only content you trust.** Extracting runs the published JavaScript, frame scripts included. It
runs in a sandbox: QuickJS, a separate JavaScript engine compiled to WebAssembly, which is given nothing of
your machine (no files, no commands, no network, no function of Node.js); only the published file goes in and
the definition comes out, as text. Running code is never without risk all the same: a flaw in the sandbox or
the engines could let code in the file reach further. Convert content published by you or by people you
trust, and treat content you receive (from a contractor, an asset store and so on) as code you would run.

## Quick start

To play Animate content on PixiJS, you do not need this package directly: use
[@tawaship/pixi-animate-runtime](https://github.com/tawaship/pixi-animate-runtime), whose command line tool runs it
for you. Use this package to get the data itself:

1. **Publish from Animate.** In Adobe Animate, publish the document for HTML5 Canvas (you get `game.js` next
   to `game.html`).

2. **Install.** In your project (Node.js 18 or later):

   ```
   npm install --save-dev @tawaship/animate-data-converter
   ```

3. **Extract.**

   ```
   npx --no-install @tawaship/animate-data-converter game.js --out game.json --pretty
   ```

   `game.json` holds the definition of every symbol of `game.js`. When the content uses something the converter
   does not support, each one is listed and nothing is written.

4. **Read it.** The definition is in a compact form, each value written once; `--expanded` writes every value
   where it applies instead, which is easier to read. [Reading a definition](#reading-a-definition) explains
   both, and the [API reference](https://tawaship.github.io/animate-data-converter/docs/) describes every field.

From a script, `extractPublishedFile('game.js')` gives the same definition (see [API](#api)).

## What you need

- Node.js 18 or later. The converter runs at development time, not in the browser
- The published JavaScript file (`<document name>.js`, next to the published HTML)

Images and sounds are not read. The converter only needs the JavaScript. CreateJS 1.0.0, the version
Animate publishes for, comes with the converter (through `@tawaship/createjs-module`), and so does the sandbox
it runs the published code in (QuickJS, through `quickjs-emscripten-core`); you do not need to provide either.

## Supported versions

- Content published by **Adobe Animate 24.0.15** for HTML5 Canvas. What this package reads is the form of the published
  JavaScript, which depends on the version of Animate; content published by other versions has not been checked
- CreateJS 1.0.0, the version Animate publishes for (it comes with the converter)

## Command line

Use the command line tool to turn a published file into a JSON file:

```
npx --no-install @tawaship/animate-data-converter game.js --out game.json
```

`--no-install` runs only the copy installed in your project: without it, `npx` would download and run a package from the npm registry when the command is not installed. In the `scripts` of your `package.json`, the command name alone is enough (`animate-data-converter game.js -o game.json`): npm runs scripts with the commands installed in the project and downloads nothing.

To keep `npx` from downloading anything in your project at all (also when `--no-install` is forgotten), put
`yes=false` in the project's `.npmrc`. `npx` then stops with an error when a command is not installed, instead
of asking or, where nobody can answer (CI, scripts), downloading it without asking.

This writes the definition of every symbol in `game.js` to `game.json`, in its compact form (see
[The compact and the expanded form](#the-compact-and-the-expanded-form)).

| Option | Effect |
|---|---|
| `-o, --out <file>` | Where to write the JSON. Without it, the JSON goes to standard output |
| `-p, --pretty` | Indents the JSON so that it is easier to read |
| `-e, --expanded` | Writes the expanded form (every value as it is) instead of the compact one |
| `-f, --force` | Writes the JSON even when the content uses features the converter does not support |
| `-h, --help` | Shows the usage |

Exit codes: `0` when the definition was written, `1` when the content uses unsupported features
(each one is listed, and nothing is written unless `--force` is given), `2` when the files cannot be read
or are not Animate HTML5 Canvas output.

## API

Use the API to extract from a script or a build tool:

```js
const { extractPublishedFile } = require('@tawaship/animate-data-converter');

extractPublishedFile('game.js').then(definition => {
	definition.issues.forEach(issue => console.warn(issue.symbol, issue.message));
});
```

This gives the same definition the command line tool writes, as a JavaScript object (through a promise: the
sandbox is set up asynchronously).

| Function | Use it for |
|---|---|
| `extractPublishedFile(publishedPath)` | Extracting from a file (a promise of the definition) |
| `extractPublished({ published })` | Extracting from source text you already have (a promise of the definition) |
| `extract(createjs, { lib, spriteSheets, images, adobeAn })` | Extracting from content already running in a CreateJS environment you set up (where you run it is up to you) |
| `expand(definition)` | The expanded form of a definition (every value as it is) |
| `compact(expanded)` | The compact form of an expanded definition (what the functions above give) |

`extractPublished()` and `extractPublishedFile()` run CreateJS 1.0.0 and the published code in a fresh sandbox
(QuickJS) with a minimal stand-in for the browser, and connect the images and sprite sheets the way the
published HTML does (no file is loaded). The published code is stopped when it runs longer than a minute or uses
more than 1 GB. Every call gets its own sandbox, so several files can be converted in one process. Numbers that
come out of math functions (eased tween values) can differ from another engine's in their last digit.

If you call `extract()` on an environment of your own, images created while the symbols are constructed
must report that they have loaded as soon as an `onload` handler is assigned. Published code that uses
sprite sheets sets bitmap fills in such a handler; when it never runs, those fills are missing from the definition.

The TypeScript types of the definition are exported as well: `IDefinition` (the compact form),
`IExpandedDefinition` (the expanded form) and the types they are made of.

## What the definition contains

The published code defines each symbol as a class whose constructor builds its children and timeline.
The converter constructs each symbol once, reads what the constructor built, and evaluates the timeline
at every frame. The result is plain data (it can be written as JSON) with one definition per symbol,
shared by every instance:

- Every symbol of the published library, under its library name (non-ASCII names are kept as they are).
  Published content has no root of its own: any symbol can be played as a root
- For a MovieClip symbol: its frame labels and length, the display objects it owns (MovieClips, Shapes,
  Sprites, Bitmaps, Texts) with their initial state, masks, hit areas and buttons, color effects and caching,
  and its timeline
- The timeline as the exact value of every property the timeline controls, at every frame, as CreateJS
  computes it (tweens, easing and motion guides included). Values are not approximated
- Frame scripts as their source text, unchanged (including any `console.log`). They are not run or
  rewritten; running them is up to the player
- Drawing commands of shapes, including gradient and bitmap fills
- Sprite symbols with their sprite sheet frames (`lib.ssMetadata`), Bitmap symbols with their images
  (manifest ids), the manifest itself, and the document properties (size, frame rate, background color)
- `converterVersion`: the version of this package that extracted the definition (also exported as
  `VERSION`). What reads a definition later can tell from it whether it knows the definition's form, for
  definitions kept as files and read by another version

### Content the converter does not support

When the content uses one of these, the converter lists it in `issues` (the command line tool stops):

- The Animate camera ("Advanced Layers" output). Delete the camera layer and publish again
- Filters other than color effects (blur, glow, drop shadow and so on)
- Event listeners added by symbol code (other than buttons and the published filter cache handling)
- Looping, reversed or bouncing tweens, and passive waits, created by hand in symbol code
- Frame scripts that are not plain functions of the symbol (bound or native functions, an explicit scope)
- Display objects other than MovieClip, Shape, Sprite, Bitmap and Text

Sounds are not part of the definition. The manifest entries of sounds are kept, and frame scripts that
call `playSound()` keep that call in their text; whether it plays anything is up to the player.

## Reading a definition

Every type and field of the definition is described in the [API reference](https://tawaship.github.io/animate-data-converter/docs/)
(`IDefinition` and the types it is made of). This section shows how the parts fit, and what a player has to
do itself to play a definition the way CreateJS plays the published content.

### The compact and the expanded form

The extracted definition is in its **compact form** (`form: 'compact'`): every value is kept, but written once.
`expand()` gives the **expanded form** (`form: 'expanded'`), value for value the same, where every value is
written where it applies; `compact()` turns an expanded definition back. The compact form is about the size of
the published file; the expanded form is several times, up to about twenty times, its size.

What the compact form writes once, and how `expand()` writes it out:

- Drawings: `graphics` holds every drawing of the content, identical ones merged; a MovieClip symbol's
  `graphics` lists the indexes of its drawings in it. A command is `[kind, value, ...]`: the kind is an index
  into `commandKinds` (`[type, names]`), and the values are those of the props named there, in that order
- Slots: `slotTemplates` holds every slot without its initial values, the fields at their defaults
  (`SLOT_DEFAULTS`: null, or false for `filterCacheListener` and `parentSet`) left out; a symbol's slot is the
  index of its template, or `[index, init]` when it has initial values
- Tweens: `values` holds the tween's distinct values (each the values of its `props`, in order) and
  `frames[position]` the index of the position's values. In a display list, an entry that places a slot with
  no props is the slot's index

The rest of this section describes the expanded form.

### How the parts fit

- `symbols[id]` is a symbol of the published library: a MovieClip (`kind: 'movieclip'`), a Sprite or a Bitmap
- An instance of a MovieClip symbol owns the display objects in `slots`, created in that order. Everything
  else refers to them by index: tween targets, display list entries, masks, hit areas, `members` (the
  instance names set as `this.<name>`) and `unmanaged` (children added without the timeline). A slot of a
  nested MovieClip names its symbol in `symbol`; a Shape's drawing is `graphics[slot.graphics]` of the symbol
- The timeline is `duration` frames long, with `labels`. Each tween in `tweens` (in timeline order) writes
  its `props` to its `target`; `frames[position][i]` is the value of `props[i]` at that position. A value is a
  plain value, `{ graphics: n }` (the Graphics `graphics[n]` of the symbol), or, for the `state` property of an
  `object` target, the symbol's display list at that frame: the slots on it, bottom to top, with the
  properties set as each is placed
- Frame scripts are `actions` of the tweens: the source text of a function and the position it runs at
- `spriteSheets`, `manifest` and `properties` are those of the published `lib`

### What a player has to do

The definition holds what CreateJS computes for each frame. How CreateJS plays those frames is up to the
player; to play as CreateJS 1.0.0 does:

- **Playing a timeline**: advance the position every frame, loop as `loop` says, and go to labels. Tween
  values are written only when the position changes: while a clip plays they are written again on every
  frame (overriding what scripts wrote to those properties), but a stopped clip, a clip of one frame or a
  `gotoAndStop` to the current frame writes nothing, so values written by scripts stay. A property not in a
  tween's `props` is never written by it
- **Display lists**: on every frame, set the display list from the `state` value, as CreateJS's MovieClip
  `_addManagedChild` does: an object whose `_off` is true is not placed, and an independent MovieClip with
  `autoReset` that was not on the list the frame before starts its timeline again
- **Child clips**: an `independent` clip plays its own timeline. A `synched` or `single` clip shows the frame
  `startPosition` plus the distance from the start of the current step (`keyframes`) of the tween that placed it
- **Frame scripts**: run `source` as a function when the timeline reaches its position, with `this` being the
  instance and the arguments `params` (the tween itself when null). Published scripts expect the names
  published code has around them: `cjs` / `createjs`, `lib`, and the page's globals (`exportRoot`, `stage`,
  `playSound`)
- **Drawing**: compose transforms as CreateJS does (`regX` / `regY`, then rotation and skew, in degrees), apply
  `alpha`, `visible` and `compositeOperation` (a blend set on a container applies to its contents), clip
  masks by the shape of their path whatever its fill, apply ColorFilter values, and break Text into lines as
  CreateJS does (at spaces only; a `lineHeight` of 0 is 1.2 times the width of `M`)

`@tawaship/pixi-animate-runtime` is a player built this way, checked frame by frame against CreateJS.

## Claude Code skills

The package comes with a skill for Claude Code (Anthropic's AI coding tool) in `dist-skills/`:
`animate-data-converter-guide`, which tells it how to extract definitions and read them. To let Claude Code use it
in your project, copy it into the project's `.claude/skills/`:

```
mkdir -p .claude/skills
cp -r node_modules/@tawaship/animate-data-converter/dist-skills/* .claude/skills/
```

Copy it again after updating the package. The skill names the versions it was written for; with another
version, it tells Claude Code to follow the type definitions in `node_modules` where they disagree.

## How correctness is checked

The converter was developed with Claude (Anthropic's AI assistant). Its correctness rests on testing rather
than on trust in the author: for every test content, the definition is written out as JSON, read back, and
used to rebuild the content, and the rebuilt content is compared with the original running on CreateJS at
every frame, including drawing commands, images, text, masks, filters, caching and buttons. Known faults
are put into the definition on purpose to confirm that the comparison notices them.

## Change log

### 0.1.0

- First release: extracts every symbol of content published by Adobe Animate for HTML5 Canvas, with its timeline
  evaluated at every frame, as plain data written in a compact form (`expand()` and `--expanded` give every value
  as it is), with the command line tool and the API, running the published code in a sandbox (QuickJS on
  WebAssembly), and lists the features it does not support
- Claude Code skills in `dist-skills/`, published with the package

## License

MIT
