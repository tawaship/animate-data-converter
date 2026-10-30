/*!
 * @tawaship/animate-data-converter - v0.1.0
 * 
 * @author tawaship (makazu.mori@gmail.com)
 * @license MIT
 */

'use strict';

var fs = require('fs');
var path = require('path');
var quickjsEmscriptenCore = require('quickjs-emscripten-core');
var variant = require('@jitl/quickjs-wasmfile-release-sync');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);

/**
 * The engine-independent definition extracted from published content.
 *
 * - One definition per symbol (class), shared by every instance of it
 * - Tweens are recorded as the exact value of every managed property at every
 *   integer frame, as createjs evaluates it. Nothing is approximated here;
 *   compression belongs to engine-specific layers
 * - Frame scripts are kept as source text, exactly as published. They are not
 *   interpreted here: treating them as JavaScript is up to the next layer
 * - The whole definition is plain data and can be written out as JSON. Values
 *   JSON cannot keep apart are normalized: a written `undefined` is recorded as
 *   null (published content clears a blend with `compositeOperation: undefined`,
 *   and createjs reads such properties by truthiness), and -0 becomes 0
 */
/**
 * Display properties recorded as the initial state of an instance.
 */
const INIT_KEYS = [
    'x', 'y', 'scaleX', 'scaleY', 'rotation', 'skewX', 'skewY',
    'regX', 'regY', 'alpha', 'visible', 'compositeOperation', '_off', 'name'
];
/**
 * Text properties recorded for a Text.
 */
const TEXT_KEYS = ['text', 'font', 'color', 'textAlign', 'textBaseline', 'lineHeight', 'lineWidth', 'maxWidth', 'outline'];

/** The version of this package (written in from package.json when the package is built) */
const VERSION = "0.1.0";

/** The values of a slot's fields that a slot template leaves out */
const SLOT_DEFAULTS = {
    symbol: null, mode: null, startPosition: null, loop: null, graphics: null, sprite: null, bitmap: null, text: null,
    mask: null, hitArea: null, filters: null, cache: null, button: null, filterCacheListener: false, parentSet: false
};
/** A table of values written once each, identical ones (compared by a key) sharing one index */
class Table {
    constructor() {
        this.list = [];
        this._indexes = new Map();
    }
    add(value, key) {
        const known = this._indexes.get(key);
        if (known !== undefined) {
            return known;
        }
        this.list.push(value);
        this._indexes.set(key, this.list.length - 1);
        return this.list.length - 1;
    }
}
/**
 * Writes every value of an expanded definition once: drawings in one table for
 * the content (identical ones merged, each command by the index of its kind),
 * slots as templates and initial values, and each tween's distinct values with
 * the index of the values of every position. Nothing is left out: `expand`
 * gives the expanded definition back.
 */
function compact(definition) {
    const graphics = new Table();
    const templates = new Table();
    const symbols = {};
    Object.keys(definition.symbols).forEach(id => {
        const symbol = definition.symbols[id];
        symbols[id] = symbol.kind === 'movieclip' ? compactMovieClip(symbol, graphics, templates) : symbol;
    });
    const written = writtenGraphics(graphics.list);
    return {
        converterVersion: definition.converterVersion,
        form: 'compact',
        properties: definition.properties,
        manifest: definition.manifest,
        spriteSheets: definition.spriteSheets,
        graphics: written.graphics,
        commandKinds: written.commandKinds,
        slotTemplates: templates.list,
        symbols,
        issues: definition.issues
    };
}
function compactMovieClip(def, graphics, templates) {
    return Object.assign({}, def, {
        slots: def.slots.map((slot) => {
            const template = slotTemplate(slot);
            const index = templates.add(template, JSON.stringify(template));
            return Object.keys(slot.init).length ? [index, slot.init] : index;
        }),
        graphics: def.graphics.map(g => graphics.add(g, JSON.stringify(g.commands))),
        tweens: def.tweens.map(compactTween)
    });
}
/** A slot's template: its kind and the fields not at their defaults, without its initial values */
function slotTemplate(slot) {
    const template = { kind: slot.kind };
    Object.keys(SLOT_DEFAULTS).forEach(key => {
        const value = Reflect.get(slot, key);
        if (JSON.stringify(value) !== JSON.stringify(Reflect.get(SLOT_DEFAULTS, key))) {
            Reflect.set(template, key, value);
        }
    });
    return template;
}
/**
 * A tween's distinct values and the index of every position's values. In a
 * display list (the `state` prop), an entry that places a slot as it is (no
 * props) is written as the slot's index.
 */
function compactTween(tween) {
    const state = tween.props.indexOf('state');
    const values = new Table();
    const frames = tween.frames.map(frame => {
        const row = frame.map((value, i) => {
            if (i !== state || !Array.isArray(value)) {
                return value;
            }
            return value.map(entry => entry.target.type === 'slot' && entry.props === null ? entry.target.slot : entry);
        });
        return values.add(row, JSON.stringify(row));
    });
    return Object.assign({}, tween, { values: values.list, frames });
}
/** The drawings with each command as the index of its kind (its type and the names of its props) and its props' values */
function writtenGraphics(list) {
    const kinds = new Table();
    const graphics = list.map(def => ({
        commands: def.commands.map(command => {
            const names = Object.keys(command.props);
            const index = kinds.add([command.type, names], JSON.stringify([command.type, names]));
            const written = [index];
            return written.concat(names.map(name => command.props[name]));
        })
    }));
    return { graphics, commandKinds: kinds.list };
}
/**
 * The expanded form of a definition: each slot whole, each tween's values at
 * every position, and each symbol's drawings in the symbol. It is the
 * definition `compact` was given, value for value.
 */
function expand(definition) {
    const drawings = definition.graphics.map(g => ({ commands: commandsOf(definition.commandKinds, g) }));
    const symbols = {};
    Object.keys(definition.symbols).forEach(id => {
        const symbol = definition.symbols[id];
        symbols[id] = symbol.kind === 'movieclip' ? expandMovieClip(symbol, definition.slotTemplates, drawings) : symbol;
    });
    return {
        converterVersion: definition.converterVersion,
        form: 'expanded',
        properties: definition.properties,
        manifest: definition.manifest,
        spriteSheets: definition.spriteSheets,
        symbols,
        issues: definition.issues
    };
}
function expandMovieClip(def, templates, drawings) {
    return Object.assign({}, def, {
        slots: def.slots.map(ref => slotOf(templates, ref)),
        graphics: def.graphics.map(index => drawings[index]),
        tweens: def.tweens.map(expandTween)
    });
}
/** A slot from its template (the fields it leaves out at their defaults) and its initial values */
function slotOf(templates, ref) {
    const t = templates[typeof ref === 'number' ? ref : ref[0]];
    const d = SLOT_DEFAULTS;
    return {
        kind: t.kind,
        symbol: t.symbol !== undefined ? t.symbol : d.symbol,
        init: typeof ref === 'number' ? {} : ref[1],
        mode: t.mode !== undefined ? t.mode : d.mode,
        startPosition: t.startPosition !== undefined ? t.startPosition : d.startPosition,
        loop: t.loop !== undefined ? t.loop : d.loop,
        graphics: t.graphics !== undefined ? t.graphics : d.graphics,
        sprite: t.sprite !== undefined ? t.sprite : d.sprite,
        bitmap: t.bitmap !== undefined ? t.bitmap : d.bitmap,
        text: t.text !== undefined ? t.text : d.text,
        mask: t.mask !== undefined ? t.mask : d.mask,
        hitArea: t.hitArea !== undefined ? t.hitArea : d.hitArea,
        filters: t.filters !== undefined ? t.filters : d.filters,
        cache: t.cache !== undefined ? t.cache : d.cache,
        button: t.button !== undefined ? t.button : d.button,
        filterCacheListener: t.filterCacheListener !== undefined ? t.filterCacheListener : d.filterCacheListener,
        parentSet: t.parentSet !== undefined ? t.parentSet : d.parentSet
    };
}
/** A tween with the values of every position, its display list entries whole */
function expandTween(tween) {
    const state = tween.props.indexOf('state');
    const values = tween.values.map(row => row.map((value, i) => {
        if (i === state && Array.isArray(value)) {
            return value.map(stateEntryOf);
        }
        return isFrameValue(value) ? value : null;
    }));
    return {
        target: tween.target,
        duration: tween.duration,
        props: tween.props,
        frames: tween.frames.map(index => values[index]),
        keyframes: tween.keyframes,
        actions: tween.actions
    };
}
function stateEntryOf(entry) {
    return typeof entry === 'number' ? { target: { type: 'slot', slot: entry }, props: null } : entry;
}
/** Whether a written value is a frame value as it is (all but a display list with slot indexes) */
function isFrameValue(value) {
    return !Array.isArray(value) || value.every(entry => typeof entry !== 'number');
}
/** A drawing's commands from their written form */
function commandsOf(kinds, graphics) {
    return graphics.commands.map(command => {
        const kind = kinds[typeof command[0] === 'number' ? command[0] : 0];
        const props = {};
        kind[1].forEach((name, i) => {
            props[name] = command[i + 1];
        });
        return { type: kind[0], props };
    });
}

/**
 * Properties a tween writes that carry no display state, left out of the
 * definition. MotionGuidePlugin writes its input (the path object) to `guide`
 * at the end of a step and null elsewhere; the motion it produces is recorded
 * through the x / y / rotation it writes.
 */
const PLUGIN_BOOKKEEPING_KEYS = ['guide'];
/**
 * What Function.prototype.toString returns for functions with no source text
 * of their own (built-ins, bound functions).
 */
const NATIVE_SOURCE = /\{\s*\[native code\]\s*\}\s*$/;
/**
 * createjs.Graphics command classes.
 */
const GRAPHICS_COMMANDS = [
    'MoveTo', 'LineTo', 'ArcTo', 'Arc', 'QuadraticCurveTo', 'BezierCurveTo', 'Rect', 'ClosePath', 'BeginPath',
    'Fill', 'Stroke', 'StrokeStyle', 'StrokeDash', 'RoundRect', 'Circle', 'Ellipse', 'PolyStar'
];
const COLOR_FILTER_KEYS = [
    'redMultiplier', 'greenMultiplier', 'blueMultiplier', 'alphaMultiplier',
    'redOffset', 'greenOffset', 'blueOffset', 'alphaOffset'
];
/**
 * The member through which a timeline using the Animate camera holds the
 * camera ("Advanced Layers" output). Such a timeline also sorts its layers by
 * depth from a tick listener, and the published Stage projects the layers
 * through the camera every tick, relying on the template's global exportRoot.
 */
const CAMERA_MEMBER = '___camera___instance';
/** Event types a ButtonHelper listens to on its target */
const BUTTON_EVENTS = ['rollover', 'rollout', 'mousedown', 'pressup'];
/**
 * Extracts the definition of every symbol in a published `lib`.
 *
 * `source.lib` is the library object the published code fills in
 * (`lib.xxx = function ...`), obtained by running the published code with
 * `createjs`. Every display object class in it is constructed once with no
 * arguments, and its timeline is read and evaluated at every integer frame on
 * that throwaway instance.
 *
 * Entries that are not symbols are skipped: non-class values (`properties`,
 * `ssMetadata`), the template's createjs.Stage subclass, and MovieClip-derived
 * helper classes that never initialize a timeline of their own (such as the
 * `AnMovieClip` base class newer Animate versions publish).
 *
 * The definition is returned in its compact form (each value written once;
 * `expand` gives every value as it is).
 */
function extract(cjs, source) {
    const lib = source.lib;
    const properties = lib.properties;
    const adobeAn = source.adobeAn;
    const ctx = {
        cjs,
        source,
        ids: new Map(),
        commandTypes: new Map(),
        filterCacheHandler: adobeAn ? adobeAn.handleFilterCache : undefined,
        classes: new Map(),
        frameImages: new Map(),
        definition: {
            converterVersion: VERSION,
            form: 'expanded',
            properties: readProperties(properties),
            manifest: [],
            spriteSheets: [],
            symbols: {},
            issues: []
        },
        baseKeys: null,
        counter: 0
    };
    ctx.definition.manifest = readManifest(ctx, properties);
    ctx.definition.spriteSheets = readSpriteSheets(ctx, lib.ssMetadata);
    GRAPHICS_COMMANDS.forEach(name => {
        const command = cjs.Graphics[name];
        if (typeof command === 'function') {
            const prototype = command.prototype;
            if (isPropBag(prototype)) {
                ctx.commandTypes.set(prototype, name);
            }
        }
    });
    const classes = [];
    Object.keys(lib).forEach(id => {
        const value = lib[id];
        if (isLibraryClass(cjs, value)) {
            const prototype = value.prototype;
            if (isPropBag(prototype) && !ctx.ids.has(prototype)) {
                ctx.ids.set(prototype, id);
                classes.push({ id, ctor: value });
                ctx.classes.set(id, value);
            }
        }
    });
    // Bitmap fills in sprite sheet publish output draw a sheet frame into a new
    // image (SpriteSheetUtils.extractFrame) and set the fill when it loads. The
    // images made while the symbols are constructed here are told apart by the
    // sheet and frame they were drawn from. The environment has to deliver the
    // load at once (an image's onload runs when assigned), or such fills are
    // never set while the symbols are read.
    const utils = cjs.SpriteSheetUtils;
    const extractFrame = utils.extractFrame;
    utils.extractFrame = function (spriteSheet, frame) {
        const image = extractFrame.call(utils, spriteSheet, frame);
        recordFrameImage(ctx, image, spriteSheet, frame);
        return image;
    };
    try {
        classes.forEach(entry => defineLibraryClass(ctx, entry.id, entry.ctor));
    }
    finally {
        utils.extractFrame = extractFrame;
    }
    return compact(ctx.definition);
}
function recordFrameImage(ctx, image, spriteSheet, frame) {
    if (!isPropBag(image)) {
        return;
    }
    const sheet = keyOf(ctx.source.spriteSheets, spriteSheet);
    // A frame given by animation name resolves to the animation's first frame, as extractFrame does
    let index = frame;
    if (typeof frame === 'string') {
        const animation = spriteSheet.getAnimation(frame);
        const frames = animation ? animation.frames : undefined;
        index = Array.isArray(frames) ? frames[0] : undefined;
    }
    if (sheet === null || !isNumber(index)) {
        issue(ctx, '', null, 'an image extracted from a sprite sheet that is not one of the published sheets');
        return;
    }
    ctx.frameImages.set(image, { sheet, frame: index });
}
function defineLibraryClass(ctx, id, ctor) {
    const cjs = ctx.cjs;
    const instance = new ctor();
    if (instance instanceof cjs.MovieClip) {
        if (!Object.prototype.hasOwnProperty.call(instance, 'timeline')) {
            return;
        }
        // Only a fresh instance tells what the constructor set on the symbol itself:
        // a definition may be read from a child instance its parent has modified
        // (e.g. assigned a mask), which is recorded on the parent's slot instead
        if (Object.prototype.hasOwnProperty.call(instance, CAMERA_MEMBER)) {
            issue(ctx, id, null, 'the Animate camera (Advanced Layers output) is not supported: delete the camera layer and publish again');
        }
        else if (instance.mask || (instance.filters && instance.filters.length) || instance.bitmapCache || hasListeners(instance)) {
            issue(ctx, id, null, 'a mask, filters, cache or event listeners set by the constructor on the symbol itself');
        }
        const def = ctx.definition.symbols[defineMovieClip(ctx, instance)];
        if (def.kind === 'movieclip') {
            def.defaults = { mode: instance.mode, startPosition: instance.startPosition, loop: instance.loop };
        }
        return;
    }
    if (instance instanceof cjs.Sprite) {
        // Possibly defined already, when an instance of it was met as a slot
        if (ctx.definition.symbols[id]) {
            return;
        }
        ctx.definition.symbols[id] = {
            kind: 'sprite',
            id,
            nominalBounds: readRect(instance.nominalBounds),
            frameBounds: readRects(instance.frameBounds),
            sprite: readSprite(ctx, id, null, instance)
        };
        return;
    }
    if (instance instanceof cjs.Bitmap) {
        if (ctx.definition.symbols[id]) {
            return;
        }
        ctx.definition.symbols[id] = {
            kind: 'bitmap',
            id,
            nominalBounds: readRect(instance.nominalBounds),
            frameBounds: readRects(instance.frameBounds),
            bitmap: readBitmap(ctx, id, null, instance)
        };
        return;
    }
    issue(ctx, id, null, 'unsupported library symbol (not a MovieClip, Sprite or Bitmap)');
}
function isPrimitive(value) {
    return value === null || (typeof value !== 'object' && typeof value !== 'function');
}
function isPropBag(value) {
    return !isPrimitive(value);
}
function isNumber(value) {
    return typeof value === 'number';
}
function isDisplayObject(ctx, value) {
    return isPropBag(value) && value instanceof ctx.cjs.DisplayObject;
}
function isLibraryClass(cjs, value) {
    if (typeof value !== 'function') {
        return false;
    }
    const prototype = value.prototype;
    return isPropBag(prototype) && prototype instanceof cjs.DisplayObject && !(prototype instanceof cjs.Stage);
}
function issue(ctx, symbol, slot, message) {
    ctx.definition.issues.push({ symbol, slot, message });
}
function keyOf(map, value) {
    if (!map) {
        return null;
    }
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
        if (map[keys[i]] === value) {
            return keys[i];
        }
    }
    return null;
}
/**
 * Own properties every bare MovieClip has. Anything else that points at a
 * display object was assigned by the symbol's constructor (a member).
 */
function getBaseKeys(ctx) {
    if (!ctx.baseKeys) {
        ctx.baseKeys = new Set(Object.keys(new ctx.cjs.MovieClip()));
    }
    return ctx.baseKeys;
}
function readProperties(value) {
    const properties = {};
    if (isPropBag(value)) {
        Object.keys(value).forEach(key => {
            const v = value[key];
            if (isPrimitive(v) && v !== undefined) {
                properties[key] = v;
            }
        });
    }
    return properties;
}
function readManifest(ctx, properties) {
    const manifest = [];
    const list = isPropBag(properties) ? properties.manifest : undefined;
    if (Array.isArray(list)) {
        list.forEach((entry) => {
            if (isPropBag(entry) && typeof entry.id === 'string' && typeof entry.src === 'string') {
                manifest.push({ id: entry.id, src: entry.src });
            }
            else {
                issue(ctx, '', null, 'malformed manifest entry');
            }
        });
    }
    return manifest;
}
function readSpriteSheets(ctx, value) {
    const sheets = [];
    if (Array.isArray(value)) {
        value.forEach((entry) => {
            if (isPropBag(entry) && typeof entry.name === 'string' && Array.isArray(entry.frames)) {
                sheets.push({ name: entry.name, frames: entry.frames.map((frame) => toPlainData(ctx, '', frame)) });
            }
            else {
                issue(ctx, '', null, 'malformed sprite sheet metadata');
            }
        });
    }
    return sheets;
}
/**
 * Plain data (numbers, strings, arrays, plain objects) as a JSON value.
 */
function toPlainData(ctx, symbol, value) {
    if (isPrimitive(value)) {
        return value === undefined ? null : value;
    }
    if (!isPropBag(value)) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map((v) => toPlainData(ctx, symbol, v));
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
        const map = {};
        Object.keys(value).forEach(key => {
            map[key] = toPlainData(ctx, symbol, value[key]);
        });
        return map;
    }
    issue(ctx, symbol, null, 'unsupported value (an object that is not plain data)');
    return null;
}
function readInit(obj) {
    const init = {};
    // An unset property (undefined) is left out: it is simply not assigned
    INIT_KEYS.forEach(key => {
        const value = obj[key];
        if (isPrimitive(value) && value !== undefined) {
            init[key] = value;
        }
    });
    return init;
}
function readRect(value) {
    if (isPropBag(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height)) {
        return { x: value.x, y: value.y, width: value.width, height: value.height };
    }
    return null;
}
function readRects(value) {
    if (!Array.isArray(value)) {
        return null;
    }
    const rects = [];
    value.forEach((v) => {
        const rect = readRect(v);
        if (rect) {
            rects.push(rect);
        }
    });
    return rects;
}
function readSprite(ctx, symbol, slot, sprite) {
    const sheet = keyOf(ctx.source.spriteSheets, sprite.spriteSheet);
    if (sheet === null) {
        issue(ctx, symbol, slot, 'a sprite whose sprite sheet is not one of the published sheets');
    }
    return { sheet: sheet === null ? '' : sheet, frame: sprite.currentFrame, paused: sprite.paused };
}
function readBitmap(ctx, symbol, slot, bitmap) {
    const image = keyOf(ctx.source.images, bitmap.image);
    if (image === null) {
        issue(ctx, symbol, slot, 'a bitmap whose image is not one of the published images');
    }
    return { image: image === null ? '' : image, sourceRect: readRect(bitmap.sourceRect) };
}
function readText(obj) {
    const text = {};
    TEXT_KEYS.forEach(key => {
        const value = obj[key];
        if (isPrimitive(value) && value !== undefined) {
            text[key] = value;
        }
    });
    return text;
}
function readCache(value) {
    if (isPropBag(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height) && isNumber(value.scale)) {
        return { x: value.x, y: value.y, width: value.width, height: value.height, scale: value.scale };
    }
    return null;
}
function readGraphics(ctx, symbol, graphics) {
    const instructions = graphics.instructions;
    const commands = [];
    if (!Array.isArray(instructions)) {
        issue(ctx, symbol, null, 'a graphics object without instructions');
        return { commands };
    }
    instructions.forEach((instruction) => {
        if (!isPropBag(instruction)) {
            issue(ctx, symbol, null, 'malformed graphics instruction');
            return;
        }
        const type = ctx.commandTypes.get(Object.getPrototypeOf(instruction));
        if (type === undefined) {
            issue(ctx, symbol, null, 'unsupported graphics command');
            return;
        }
        const props = {};
        Object.keys(instruction).forEach(key => {
            const value = instruction[key];
            if (value !== undefined && typeof value !== 'function') {
                props[key] = toCommandValue(ctx, symbol, value);
            }
        });
        commands.push({ type, props });
    });
    return { commands };
}
/**
 * A value held by a graphics command: plain data, a fill / stroke style, a
 * transform matrix, or an image (as its manifest id).
 */
function toCommandValue(ctx, symbol, value) {
    if (isPrimitive(value)) {
        return value === undefined ? null : value;
    }
    if (!isPropBag(value)) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map((v) => toCommandValue(ctx, symbol, v));
    }
    // Gradient and bitmap fill styles keep the arguments they were created with in `props`
    const props = value.props;
    if (isPropBag(props)) {
        const map = {};
        Object.keys(props).forEach(key => {
            map[key] = toCommandValue(ctx, symbol, props[key]);
        });
        return map;
    }
    if (isNumber(value.a) && isNumber(value.b) && isNumber(value.c) && isNumber(value.d) && isNumber(value.tx) && isNumber(value.ty)) {
        return { a: value.a, b: value.b, c: value.c, d: value.d, tx: value.tx, ty: value.ty };
    }
    const image = keyOf(ctx.source.images, value);
    if (image !== null) {
        return { image };
    }
    const frameImage = ctx.frameImages.get(value);
    if (frameImage) {
        return { sheet: frameImage.sheet, frame: frameImage.frame };
    }
    if (Object.getPrototypeOf(value) === Object.prototype) {
        return toPlainData(ctx, symbol, value);
    }
    issue(ctx, symbol, null, 'unsupported value in a graphics command');
    return null;
}
function defineMovieClip(ctx, mc) {
    const prototype = Object.getPrototypeOf(mc);
    // A bare createjs.MovieClip has no class of its own to share
    const shared = prototype !== ctx.cjs.MovieClip.prototype;
    // lib classes have their ids assigned up front; a symbol is defined once,
    // from whichever instance of the class is met first
    const known = shared ? ctx.ids.get(prototype) : undefined;
    if (known !== undefined && ctx.definition.symbols[known]) {
        return known;
    }
    let id;
    if (known !== undefined) {
        id = known;
    }
    else {
        // Classes not registered in lib get a generated id (`#` never starts a lib key,
        // which is a JavaScript identifier in published code)
        id = '#' + (ctx.counter++);
        if (shared) {
            ctx.ids.set(prototype, id);
        }
    }
    const def = {
        kind: 'movieclip',
        id,
        nominalBounds: readRect(mc.nominalBounds),
        frameBounds: readRects(mc.frameBounds),
        defaults: null,
        labels: mc.labels.map(label => ({ label: label.label, position: label.position })),
        duration: mc.timeline.duration,
        slots: [],
        members: [],
        unmanaged: [],
        tweens: [],
        graphics: [],
        filterCacheList: null
    };
    // Registered before recursing into children
    ctx.definition.symbols[id] = def;
    const slotObjects = [];
    const slotIndex = new Map();
    const filterOwners = new Map();
    const graphicsIndex = new Map();
    const addSlot = (obj) => {
        const known = slotIndex.get(obj);
        if (known !== undefined) {
            return known;
        }
        slotIndex.set(obj, slotObjects.length);
        slotObjects.push(obj);
        return slotObjects.length - 1;
    };
    const scope = {
        symbol: id,
        stateMemo: new Map(),
        targetOf(value) {
            if (value === mc) {
                return { type: 'self' };
            }
            if (isPropBag(value)) {
                const owner = filterOwners.get(value);
                if (owner) {
                    return { type: 'filter', slot: owner.slot, filter: owner.filter };
                }
            }
            if (isDisplayObject(ctx, value)) {
                return { type: 'slot', slot: addSlot(value) };
            }
            return null;
        },
        graphicsOf(value) {
            if (!isPropBag(value) || !(value instanceof ctx.cjs.Graphics)) {
                return null;
            }
            const known = graphicsIndex.get(value);
            if (known !== undefined) {
                return known;
            }
            graphicsIndex.set(value, def.graphics.length);
            def.graphics.push(readGraphics(ctx, id, value));
            return def.graphics.length - 1;
        },
        slotOf(value) {
            if (!isDisplayObject(ctx, value)) {
                return null;
            }
            const known = slotIndex.get(value);
            return known === undefined ? null : known;
        }
    };
    // Masks and hit areas live outside the display list and are reachable only
    // through these references
    const addReferenced = () => {
        for (let i = 0; i < slotObjects.length; i++) {
            const obj = slotObjects[i];
            if (isDisplayObject(ctx, obj.mask)) {
                addSlot(obj.mask);
            }
            if (isDisplayObject(ctx, obj.hitArea)) {
                addSlot(obj.hitArea);
            }
        }
    };
    const baseKeys = getBaseKeys(ctx);
    Object.keys(mc).forEach(key => {
        const value = mc[key];
        if (!baseKeys.has(key) && value !== mc && isDisplayObject(ctx, value)) {
            def.members.push({ name: key, slot: addSlot(value) });
        }
    });
    mc.children.forEach(child => {
        addSlot(child);
    });
    mc.timeline.tweens.forEach(tween => {
        if (tween.target !== mc && isDisplayObject(ctx, tween.target)) {
            addSlot(tween.target);
        }
    });
    addReferenced();
    // Set by the symbol's own constructor on the instance itself; its entries
    // refer to the symbol's own slots (resolved before the slots are defined)
    def.filterCacheList = readFilterCacheList(ctx, scope, null, mc);
    addReferenced();
    slotObjects.forEach((obj, slot) => {
        if (obj.filters) {
            obj.filters.forEach((filter, index) => {
                if (isPropBag(filter)) {
                    filterOwners.set(filter, { slot, filter: index });
                }
            });
        }
    });
    def.tweens = mc.timeline.tweens.map(tween => {
        const target = scope.targetOf(tween.target);
        return evaluateTween(ctx, scope, tween, target ? target : { type: 'object' });
    });
    // State entries may have brought in more slots
    addReferenced();
    const managed = new Set();
    const markManaged = (target) => {
        if (target.type === 'slot') {
            managed.add(target.slot);
        }
    };
    def.tweens.forEach(tween => {
        markManaged(tween.target);
        tween.frames.forEach(frame => {
            frame.forEach(value => {
                if (Array.isArray(value)) {
                    value.forEach((entry) => {
                        markManaged(entry.target);
                    });
                }
            });
        });
    });
    mc.children.forEach(child => {
        const index = slotIndex.get(child);
        if (index !== undefined && !managed.has(index)) {
            def.unmanaged.push(index);
        }
    });
    def.slots = slotObjects.map((obj, index) => defineSlot(ctx, scope, mc, index, obj));
    return id;
}
function hasListeners(obj) {
    const listeners = obj._listeners;
    if (!isPropBag(listeners)) {
        return false;
    }
    return Object.keys(listeners).some(type => {
        const list = listeners[type];
        return Array.isArray(list) && list.length > 0;
    });
}
function emptySlot(obj) {
    return {
        kind: 'unsupported',
        symbol: null,
        init: readInit(obj),
        mode: null,
        startPosition: null,
        loop: null,
        graphics: null,
        sprite: null,
        bitmap: null,
        text: null,
        mask: null,
        hitArea: null,
        filters: null,
        cache: null,
        button: null,
        filterCacheListener: false,
        parentSet: false
    };
}
function defineSlot(ctx, scope, mc, index, obj) {
    const symbol = scope.symbol;
    const slot = emptySlot(obj);
    slot.mask = scope.slotOf(obj.mask);
    slot.hitArea = scope.slotOf(obj.hitArea);
    slot.filters = readFilters(ctx, symbol, index, obj);
    slot.cache = readCache(obj.bitmapCache);
    slot.parentSet = obj.parent === mc && mc.children.indexOf(obj) < 0;
    readListeners(ctx, scope, index, obj, slot);
    // A clip's own list comes with its symbol (IMovieClipSymbolDef.filterCacheList)
    if (!(obj instanceof ctx.cjs.MovieClip) && obj.filterCacheList !== undefined) {
        issue(ctx, symbol, index, 'a filterCacheList on a display object that is not a MovieClip');
    }
    if (obj instanceof ctx.cjs.MovieClip) {
        slot.kind = 'movieclip';
        slot.symbol = defineMovieClip(ctx, obj);
        slot.mode = obj.mode;
        slot.startPosition = obj.startPosition;
        slot.loop = obj.loop;
    }
    else if (obj instanceof ctx.cjs.Sprite) {
        slot.kind = 'sprite';
        slot.symbol = libraryIdOf(ctx, obj);
        const sprite = readSprite(ctx, symbol, index, obj);
        const own = librarySymbol(ctx, slot.symbol);
        slot.sprite = own && own.kind === 'sprite' && sameData(own.sprite, sprite) ? null : sprite;
    }
    else if (obj instanceof ctx.cjs.Bitmap) {
        slot.kind = 'bitmap';
        slot.symbol = libraryIdOf(ctx, obj);
        const bitmap = readBitmap(ctx, symbol, index, obj);
        const own = librarySymbol(ctx, slot.symbol);
        slot.bitmap = own && own.kind === 'bitmap' && sameData(own.bitmap, bitmap) ? null : bitmap;
    }
    else if (obj instanceof ctx.cjs.Text) {
        slot.kind = 'text';
        slot.text = readText(obj);
    }
    else if (obj instanceof ctx.cjs.Shape) {
        slot.kind = 'shape';
        slot.graphics = scope.graphicsOf(obj.graphics);
    }
    else {
        issue(ctx, symbol, index, 'unsupported display object (not a MovieClip, Shape, Sprite, Bitmap or Text)');
    }
    return slot;
}
/**
 * The lib id of a Sprite / Bitmap that is an instance of a lib symbol class
 * (null for one created inline with `new cjs.Sprite(...)` / `new cjs.Bitmap(...)`).
 */
/**
 * The definition of a lib symbol, defined now if it has not been met yet.
 */
function librarySymbol(ctx, id) {
    if (id === null) {
        return null;
    }
    const ctor = ctx.classes.get(id);
    if (!ctx.definition.symbols[id] && ctor) {
        defineLibraryClass(ctx, id, ctor);
    }
    const def = ctx.definition.symbols[id];
    return def ? def : null;
}
function sameData(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}
function libraryIdOf(ctx, obj) {
    const id = ctx.ids.get(Object.getPrototypeOf(obj));
    return id === undefined ? null : id;
}
function readFilters(ctx, symbol, slot, obj) {
    if (!obj.filters) {
        return null;
    }
    const filters = [];
    obj.filters.forEach(filter => {
        if (isPropBag(filter) && filter instanceof ctx.cjs.ColorFilter) {
            const props = {};
            COLOR_FILTER_KEYS.forEach(key => {
                const value = filter[key];
                if (isNumber(value)) {
                    props[key] = value;
                }
            });
            filters.push({ type: 'ColorFilter', props });
        }
        else {
            issue(ctx, symbol, slot, 'unsupported filter (only ColorFilter is supported)');
        }
    });
    return filters;
}
function readListeners(ctx, scope, index, obj, slot) {
    const listeners = obj._listeners;
    if (!isPropBag(listeners)) {
        return;
    }
    Object.keys(listeners).forEach(type => {
        const list = listeners[type];
        if (!Array.isArray(list)) {
            return;
        }
        list.forEach((listener) => {
            if (BUTTON_EVENTS.indexOf(type) >= 0 && isPropBag(listener) && listener instanceof ctx.cjs.ButtonHelper) {
                if (!slot.button) {
                    const hit = obj.hitArea;
                    slot.button = {
                        out: listener.outLabel,
                        over: listener.overLabel,
                        down: listener.downLabel,
                        play: listener.play,
                        hit: scope.slotOf(hit),
                        hitFrame: hit instanceof ctx.cjs.MovieClip ? hit.currentFrame : null
                    };
                }
                return;
            }
            if (type === 'tick' && ctx.filterCacheHandler !== undefined && listener === ctx.filterCacheHandler) {
                slot.filterCacheListener = true;
                return;
            }
            issue(ctx, scope.symbol, index, 'unsupported event listener ("' + type + '") added by a constructor');
        });
    });
}
function readFilterCacheList(ctx, scope, index, obj) {
    const list = obj.filterCacheList;
    if (list === undefined) {
        return null;
    }
    const entries = [];
    if (!Array.isArray(list)) {
        issue(ctx, scope.symbol, index, 'malformed filterCacheList');
        return entries;
    }
    list.forEach((entry) => {
        const instance = isPropBag(entry) ? scope.targetOf(entry.instance) : null;
        if (isPropBag(entry) && instance && isNumber(entry.startFrame) && isNumber(entry.endFrame)
            && isNumber(entry.x) && isNumber(entry.y) && isNumber(entry.w) && isNumber(entry.h)) {
            entries.push({
                instance,
                startFrame: entry.startFrame,
                endFrame: entry.endFrame,
                x: entry.x,
                y: entry.y,
                w: entry.w,
                h: entry.h
            });
        }
        else {
            issue(ctx, scope.symbol, index, 'malformed filterCacheList entry');
        }
    });
    return entries;
}
function evaluateTween(ctx, scope, tween, target) {
    const symbol = scope.symbol;
    if (tween.loop !== 0 || tween.reversed || tween.bounce) {
        issue(ctx, symbol, null, 'looping, reversed or bouncing tweens are not supported');
    }
    // The head step is a sentinel created as passive; real steps start after it
    for (let step = tween._stepHead.next; step; step = step.next) {
        if (step.passive) {
            issue(ctx, symbol, null, 'passive waits are not supported');
            break;
        }
    }
    // Observe what the tween writes at each integer position through a
    // recording stand-in for its target. Reads fall through to the real target
    // (plugins may read it), writes never reach it.
    const original = tween.target;
    const written = [];
    let current = {};
    const recorder = new Proxy({}, {
        get(_target, key) {
            if (typeof key !== 'string') {
                return undefined;
            }
            return Object.prototype.hasOwnProperty.call(current, key) ? current[key] : original[key];
        },
        set(_target, key, value) {
            if (typeof key === 'string' && PLUGIN_BOOKKEEPING_KEYS.indexOf(key) < 0) {
                if (written.indexOf(key) < 0) {
                    written.push(key);
                }
                current[key] = value;
            }
            return true;
        }
    });
    const writes = [];
    const savedPosition = tween.position;
    for (let position = 0; position <= tween.duration; position++) {
        current = {};
        tween.position = position;
        tween.target = recorder;
        tween._updatePosition(false, position >= tween.duration);
        tween.target = original;
        writes.push(current);
    }
    tween.position = savedPosition;
    const frames = writes.map((frame, position) => written.map(key => {
        if (!Object.prototype.hasOwnProperty.call(frame, key)) {
            issue(ctx, symbol, null, 'property "' + key + '" is not written at position ' + position);
            return null;
        }
        return toFrameValue(ctx, scope, frame[key]);
    }));
    const keyframes = [];
    for (let step = tween._stepHead.next; step; step = step.next) {
        keyframes.push(step.t);
    }
    const actions = [];
    for (let action = tween._actionHead; action; action = action.next) {
        if (action.scope !== original) {
            issue(ctx, symbol, null, 'frame scripts with an explicit scope are not supported');
        }
        const source = Function.prototype.toString.call(action.funct);
        if (NATIVE_SOURCE.test(source)) {
            issue(ctx, symbol, null, 'a frame script whose source cannot be read (a native or bound function)');
        }
        actions.push({
            position: action.t,
            source,
            params: readParams(ctx, scope, tween, action)
        });
    }
    return {
        target,
        duration: tween.duration,
        props: written,
        frames,
        keyframes,
        actions
    };
}
/**
 * Tween.call() defaults its params to [the tween itself]; that default is
 * recorded as null (a rebuilt tween gets its own default again).
 */
function readParams(ctx, scope, tween, action) {
    const params = action.params;
    if (!params || (params.length === 1 && params[0] === tween)) {
        return null;
    }
    return params.map(value => toFrameValue(ctx, scope, value));
}
function toFrameValue(ctx, scope, value) {
    // A written undefined is recorded as null (see types.ts)
    if (isPrimitive(value)) {
        return value === undefined ? null : value;
    }
    if (Array.isArray(value)) {
        return toStateValue(ctx, scope, value);
    }
    const graphics = scope.graphicsOf(value);
    if (graphics !== null) {
        return { graphics };
    }
    issue(ctx, scope.symbol, null, 'unsupported property value (an object that is neither a state array nor a Graphics)');
    return null;
}
/**
 * A state array: [{ t: displayObject, p: { prop: value } }, ...].
 * The same array object is shared by consecutive frames in published content,
 * and that sharing is kept.
 */
function toStateValue(ctx, scope, value) {
    const known = scope.stateMemo.get(value);
    if (known) {
        return known;
    }
    const entries = [];
    scope.stateMemo.set(value, entries);
    value.forEach(entry => {
        if (!isPropBag(entry)) {
            issue(ctx, scope.symbol, null, 'malformed state entry');
            return;
        }
        const target = scope.targetOf(entry.t);
        if (!target) {
            issue(ctx, scope.symbol, null, 'state entry without a display object target');
            return;
        }
        let props = null;
        const source = entry.p;
        if (isPropBag(source)) {
            const map = {};
            Object.keys(source).forEach(key => {
                const v = source[key];
                if (isPrimitive(v)) {
                    // A written undefined (e.g. `compositeOperation: undefined`, which clears a blend) is recorded as null
                    map[key] = v === undefined ? null : v;
                }
                else {
                    issue(ctx, scope.symbol, null, 'unsupported value in state entry property "' + key + '"');
                }
            });
            props = map;
        }
        entries.push({ target, props });
    });
    return entries;
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/**
 * The createjs runtime: the CreateJS 1.0.0 combined build Animate publishes
 * for, as @tawaship/createjs-module exports it (CommonJS module source, run
 * inside the sandbox).
 */
const CREATEJS_MODULE = '@tawaship/createjs-module';
/** The script run inside the sandbox (inside.ts, built next to this bundle) */
const INSIDE_FILE = 'animate-data-converter.inside.js';
/** How long the published code may run, in milliseconds, before it is stopped */
const TIME_LIMIT = 60000;
/** How much memory the sandbox may use, in bytes */
const MEMORY_LIMIT = 1024 * 1024 * 1024;
let quickjs = null;
let sources = null;
function getQuickJS() {
    if (!quickjs) {
        quickjs = quickjsEmscriptenCore.newQuickJSWASMModuleFromVariant(variant);
    }
    return quickjs;
}
function getSources() {
    if (!sources) {
        sources = {
            createjs: fs__namespace.readFileSync(require.resolve(CREATEJS_MODULE), 'utf8'),
            inside: fs__namespace.readFileSync(path__namespace.join(__dirname, INSIDE_FILE), 'utf8')
        };
    }
    return sources;
}
/** Runs code in the sandbox; its result as a string, or the error it threw */
function evaluate(context, code, filename) {
    const result = context.evalCode(code, filename);
    if (result.error) {
        const message = context.getProp(result.error, 'message');
        const raw = context.typeof(message) === 'string' ? context.getString(message) : 'unknown error';
        // QuickJS stops the code when the interrupt handler (the time limit) says so
        const text = raw === 'interrupted' ? 'the published code ran longer than ' + TIME_LIMIT / 1000 + ' seconds and was stopped' : raw;
        message.dispose();
        result.error.dispose();
        throw new Error(text);
    }
    const text = context.typeof(result.value) === 'string' ? context.getString(result.value) : '';
    result.value.dispose();
    return text;
}
/** Whether data read back from the sandbox is a definition (in its compact form) */
function isDefinition(value) {
    return value !== null && Reflect.get(value, 'form') === 'compact' && typeof Reflect.get(value, 'converterVersion') === 'string'
        && Reflect.get(value, 'symbols') !== null && typeof Reflect.get(value, 'symbols') === 'object' && Array.isArray(Reflect.get(value, 'issues'));
}
/** The definition from the sandbox's result (`{ ok: true, definition }` or `{ ok: false, message }`, as JSON) */
function definitionOf(json) {
    const result = JSON.parse(json);
    if (result === null || typeof result !== 'object') {
        throw new Error('the sandbox gave no result');
    }
    if (Reflect.get(result, 'ok') !== true) {
        const message = Reflect.get(result, 'message');
        throw new Error(typeof message === 'string' ? message : 'the extraction failed');
    }
    const definition = Reflect.get(result, 'definition');
    if (!isDefinition(definition)) {
        throw new Error('the sandbox gave no definition');
    }
    return definition;
}
/**
 * Extracts the definition of published content. createjs and the published
 * code (frame scripts included) run in a sandbox: QuickJS, a separate
 * JavaScript engine compiled to WebAssembly, which is given nothing of the
 * host (no files, no commands, no network, no function of Node). Only the
 * sources go in and the definition comes out, as text. The published code is
 * stopped when it runs longer than a minute or uses more than 1 GB.
 */
function extractPublished(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const QuickJS = yield getQuickJS();
        const code = getSources();
        const runtime = QuickJS.newRuntime();
        try {
            runtime.setMemoryLimit(MEMORY_LIMIT);
            runtime.setMaxStackSize(0);
            runtime.setInterruptHandler(quickjsEmscriptenCore.shouldInterruptAfterDeadline(Date.now() + TIME_LIMIT));
            const context = runtime.newContext();
            try {
                evaluate(context, code.inside, INSIDE_FILE);
                const pass = (name, value) => {
                    const handle = context.newString(value);
                    context.setProp(context.global, name, handle);
                    handle.dispose();
                };
                pass('__createjs', code.createjs);
                pass('__published', options.published);
                return definitionOf(evaluate(context, 'AnimateDataConverterInside.extractInside(__createjs, __published)', options.publishedFilename || 'published.js'));
            }
            finally {
                context.dispose();
            }
        }
        finally {
            runtime.dispose();
        }
    });
}
/**
 * extractPublished() with the published JS read from a file.
 */
function extractPublishedFile(publishedPath) {
    return extractPublished({
        published: fs__namespace.readFileSync(publishedPath, 'utf8'),
        publishedFilename: path__namespace.basename(publishedPath)
    });
}

const USAGE = [
    'Usage: animate-data-converter <published.js> [-o <file.json>] [-p] [-e] [-f]',
    '',
    '  <published.js>        the JavaScript file Animate published for HTML5 Canvas',
    '  -o, --out <file>      where to write the definition (standard output when omitted)',
    '  -p, --pretty          indent the JSON',
    '  -e, --expanded        write the expanded definition (every value as it is) instead of the compact one',
    '  -f, --force           write the definition even when the content uses unsupported features',
    '  -h, --help            show this'
].join('\n');
function parseArgs(args) {
    const parsed = { published: null, out: null, pretty: false, expanded: false, force: false, help: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--out' || arg === '-o') {
            const value = args[++i];
            if (value === undefined) {
                return arg + ' needs a file';
            }
            parsed.out = value;
        }
        else if (arg === '--pretty' || arg === '-p') {
            parsed.pretty = true;
        }
        else if (arg === '--expanded' || arg === '-e') {
            parsed.expanded = true;
        }
        else if (arg === '--force' || arg === '-f') {
            parsed.force = true;
        }
        else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
        else if (arg.charAt(0) === '-' || parsed.published !== null) {
            return 'unexpected argument: ' + arg;
        }
        else {
            parsed.published = arg;
        }
    }
    if (parsed.published === null && !parsed.help) {
        return 'no published file given';
    }
    return parsed;
}
/**
 * The command line tool. Returns the exit code: 0 when the definition was
 * written, 1 when the content uses features this version cannot represent
 * (they are listed, and nothing is written unless --force is given), 2 for
 * usage and loading errors.
 */
function runCli(args, io) {
    return __awaiter(this, void 0, void 0, function* () {
        const parsed = parseArgs(args);
        if (typeof parsed === 'string') {
            io.stderr(parsed + '\n\n' + USAGE + '\n');
            return 2;
        }
        if (parsed.help) {
            io.stdout(USAGE + '\n');
            return 0;
        }
        let definition;
        try {
            definition = yield extractPublishedFile(parsed.published || '');
        }
        catch (e) {
            io.stderr('could not load ' + parsed.published + ': ' + (e instanceof Error ? e.message : String(e)) + '\n');
            return 2;
        }
        definition.issues.forEach(issue => {
            io.stderr('unsupported: ' + (issue.symbol ? issue.symbol : '(content)') + (issue.slot !== null ? ' slot ' + issue.slot : '') + ': ' + issue.message + '\n');
        });
        if (definition.issues.length && !parsed.force) {
            io.stderr(definition.issues.length + ' unsupported feature(s); nothing written (use --force to write anyway)\n');
            return 1;
        }
        const json = JSON.stringify(parsed.expanded ? expand(definition) : definition, null, parsed.pretty ? '\t' : undefined) + '\n';
        if (parsed.out) {
            fs__namespace.writeFileSync(parsed.out, json);
        }
        else {
            io.stdout(json);
        }
        return definition.issues.length ? 1 : 0;
    });
}

exports.INIT_KEYS = INIT_KEYS;
exports.SLOT_DEFAULTS = SLOT_DEFAULTS;
exports.TEXT_KEYS = TEXT_KEYS;
exports.VERSION = VERSION;
exports.compact = compact;
exports.expand = expand;
exports.extract = extract;
exports.extractPublished = extractPublished;
exports.extractPublishedFile = extractPublishedFile;
exports.runCli = runCli;
//# sourceMappingURL=animate-data-converter.cjs.js.map
