# @tawaship/animate-data-converter

Reads what Adobe Animate publishes for HTML5 Canvas (CreateJS) and extracts the symbols and
their timelines as plain, engine-independent data.
A player for a specific engine (such as `@tawaship/pixi-animate-runtime` for PixiJS) builds on this data,
so that content made in Animate can be played without running the published code or CreateJS at play time.

**Status: under development.** The format of the extracted data may still change between 0.x versions
(a definition records the version that extracted it, see `converterVersion` below).

API reference: https://tawaship.github.io/animate-data-converter/docs/

**Convert only content you trust.** Extracting runs the published JavaScript, frame scripts included, in
Node.js. The `vm` context keeps the published code apart from the converter's own objects, but it is not a
security boundary: code in the file can reach what Node.js can (files, commands, the network) with your
permissions. Treat a published file as you would treat a script you run: convert content published by you or
by people you trust.

## What you need

- Node.js 18 or later. The converter runs at development time, not in the browser
- The published JavaScript file (`<document name>.js`, next to the published HTML)

Images and sounds are not read. The converter only needs the JavaScript. CreateJS 1.0.0, the version
Animate publishes for, comes with the converter (through `@tawaship/createjs-module`); you do not need to provide it.

## Supported versions

- Content published by **Adobe Animate 24.0.15** for HTML5 Canvas. What this package reads is the form of the published
  JavaScript, which depends on the version of Animate; content published by other versions has not been checked
- CreateJS 1.0.0, the version Animate publishes for (it comes with the converter)

## Command line

Use the command line tool to turn a published file into a JSON file:

```
npx animate-data-converter game.js --out game.json
```

This writes the definition of every symbol in `game.js` to `game.json`.

| Option | Effect |
|---|---|
| `--out <file>` | Where to write the JSON. Without it, the JSON goes to standard output |
| `--pretty` | Indents the JSON so that it is easier to read |
| `--force` | Writes the JSON even when the content uses features the converter does not support |

Exit codes: `0` when the definition was written, `1` when the content uses unsupported features
(each one is listed, and nothing is written unless `--force` is given), `2` when the files cannot be read
or are not Animate HTML5 Canvas output.

## API

Use the API to extract from a script or a build tool:

```js
const { extractPublishedFile } = require('@tawaship/animate-data-converter');

const definition = extractPublishedFile('game.js');
if (definition.issues.length) {
	definition.issues.forEach(issue => console.warn(issue.symbol, issue.message));
}
```

This gives the same definition the command line tool writes, as a JavaScript object.

| Function | Use it for |
|---|---|
| `extractPublishedFile(publishedPath)` | Extracting from a file |
| `extractPublished({ published })` | Extracting from source text you already have |
| `loadPublished({ published })` | Running the published code yourself: returns the CreateJS namespace and what `extract()` reads |
| `extract(createjs, { lib, spriteSheets, images, adobeAn })` | Extracting from content already running in a CreateJS environment you set up |

`loadPublished()` runs CreateJS 1.0.0 and the published code in an isolated Node `vm` context with a minimal
stand-in for the browser, and connects the images and sprite sheets the way the published HTML does
(no file is loaded). Every call gets its own context, so several files can be converted in one process.

If you call `extract()` on an environment of your own, images created while the symbols are constructed
must report that they have loaded as soon as an `onload` handler is assigned. Published code that uses
sprite sheets sets bitmap fills in such a handler; when it never runs, those fills are missing from the definition.

The TypeScript types of the definition (`IDefinition` and the types it is made of) are exported as well.

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

Values are recorded for every frame, as they are: a definition is several times, up to about twenty times,
the size of the published file. Compress it in your own layer when you keep or ship it
(`@tawaship/pixi-animate-runtime`'s generator does).

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

## How correctness is checked

The converter was developed with Claude (Anthropic's AI assistant). Its correctness rests on testing rather
than on trust in the author: for every test content, the definition is written out as JSON, read back, and
used to rebuild the content, and the rebuilt content is compared with the original running on CreateJS at
every frame, including drawing commands, images, text, masks, filters, caching and buttons. Known faults
are put into the definition on purpose to confirm that the comparison notices them.

## Change log

### 0.1.0

- First release: extracts every symbol of content published by Adobe Animate for HTML5 Canvas, with its timeline
  evaluated at every frame, as plain data (the command line tool and the API), and lists the features it does not support

## License

MIT
