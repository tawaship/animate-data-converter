# @tawaship/animate-data-converter

Reads what Adobe Animate publishes for HTML5 Canvas (CreateJS) and extracts the symbols and
their timelines as plain, engine-independent data.
A player for a specific engine (such as `@tawaship/pixi-animate-runtime` for PixiJS) builds on this data,
so that content made in Animate can be played without running the published code or CreateJS at play time.

**Status: under development.** The format of the extracted data (schema version 0) may still change.

## What you need

- Node.js 18 or later. The converter runs at development time, not in the browser
- The published JavaScript file (`<document name>.js`, next to the published HTML)

Images and sounds are not read. The converter only needs the JavaScript. CreateJS 1.0.0, the version
Animate publishes for, comes with the converter (through `@tawaship/createjs-module`); you do not need to provide it.

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

## How correctness is checked

The converter was developed with Claude (Anthropic's AI assistant). Its correctness rests on testing rather
than on trust in the author: for every test content, the definition is written out as JSON, read back, and
used to rebuild the content, and the rebuilt content is compared with the original running on CreateJS at
every frame, including drawing commands, images, text, masks, filters, caching and buttons. Known faults
are put into the definition on purpose to confirm that the comparison notices them.

## License

MIT
