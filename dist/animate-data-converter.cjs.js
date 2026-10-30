/*!
 * @tawaship/animate-data-converter - v0.1.0
 * 
 * @author tawaship (makazu.mori@gmail.com)
 * @license MIT
 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

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
var vm__namespace = /*#__PURE__*/_interopNamespaceDefault(vm);

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
            if (isPropBag$1(prototype)) {
                ctx.commandTypes.set(prototype, name);
            }
        }
    });
    const classes = [];
    Object.keys(lib).forEach(id => {
        const value = lib[id];
        if (isLibraryClass(cjs, value)) {
            const prototype = value.prototype;
            if (isPropBag$1(prototype) && !ctx.ids.has(prototype)) {
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
    return ctx.definition;
}
function recordFrameImage(ctx, image, spriteSheet, frame) {
    if (!isPropBag$1(image)) {
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
function isPropBag$1(value) {
    return !isPrimitive(value);
}
function isNumber(value) {
    return typeof value === 'number';
}
function isDisplayObject(ctx, value) {
    return isPropBag$1(value) && value instanceof ctx.cjs.DisplayObject;
}
function isLibraryClass(cjs, value) {
    if (typeof value !== 'function') {
        return false;
    }
    const prototype = value.prototype;
    return isPropBag$1(prototype) && prototype instanceof cjs.DisplayObject && !(prototype instanceof cjs.Stage);
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
    if (isPropBag$1(value)) {
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
    const list = isPropBag$1(properties) ? properties.manifest : undefined;
    if (Array.isArray(list)) {
        list.forEach((entry) => {
            if (isPropBag$1(entry) && typeof entry.id === 'string' && typeof entry.src === 'string') {
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
            if (isPropBag$1(entry) && typeof entry.name === 'string' && Array.isArray(entry.frames)) {
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
    if (!isPropBag$1(value)) {
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
    if (isPropBag$1(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height)) {
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
    if (isPropBag$1(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height) && isNumber(value.scale)) {
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
        if (!isPropBag$1(instruction)) {
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
    if (!isPropBag$1(value)) {
        return null;
    }
    if (Array.isArray(value)) {
        return value.map((v) => toCommandValue(ctx, symbol, v));
    }
    // Gradient and bitmap fill styles keep the arguments they were created with in `props`
    const props = value.props;
    if (isPropBag$1(props)) {
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
            if (isPropBag$1(value)) {
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
            if (!isPropBag$1(value) || !(value instanceof ctx.cjs.Graphics)) {
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
                if (isPropBag$1(filter)) {
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
    if (!isPropBag$1(listeners)) {
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
        if (isPropBag$1(filter) && filter instanceof ctx.cjs.ColorFilter) {
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
    if (!isPropBag$1(listeners)) {
        return;
    }
    Object.keys(listeners).forEach(type => {
        const list = listeners[type];
        if (!Array.isArray(list)) {
            return;
        }
        list.forEach((listener) => {
            if (BUTTON_EVENTS.indexOf(type) >= 0 && isPropBag$1(listener) && listener instanceof ctx.cjs.ButtonHelper) {
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
        const instance = isPropBag$1(entry) ? scope.targetOf(entry.instance) : null;
        if (isPropBag$1(entry) && instance && isNumber(entry.startFrame) && isNumber(entry.endFrame)
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
        if (!isPropBag$1(entry)) {
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
        if (isPropBag$1(source)) {
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

/**
 * The minimal browser environment createjs and the published code need to
 * run in a Node vm context. Nothing is drawn and nothing is loaded:
 *
 * - A canvas has a 2D context whose drawing calls do nothing. toDataURL()
 *   names what was last drawn on it (the source image and the rectangles),
 *   so that every image made from a canvas has a src of its own
 * - An <img> counts as loaded as soon as its src is set, and assigning
 *   `onload` afterwards calls the handler at once. Published code sets some
 *   graphics in an image's onload (bitmap fills drawn from a sprite sheet
 *   frame); in a browser the handler runs a moment after construction, here it
 *   runs during construction, so the state read is the one after loading
 * - Timers never fire and time does not pass: the content is constructed, not
 *   played
 */
function noop() {
    // Nothing to do in a headless environment
}
function isHandler(value) {
    return typeof value === 'function';
}
function createContext2D(canvas, drawn) {
    const context = {
        canvas,
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        measureText: () => ({ width: 0 }),
        getImageData: () => ({ data: [0, 0, 0, 0] }),
        createImageData: () => ({ data: [0, 0, 0, 0] }),
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createPattern: () => ({}),
        isPointInPath: () => false,
        drawImage: (image, ...rest) => {
            const src = image !== null && typeof image === 'object' && 'src' in image ? String(image.src) : '';
            drawn.last = src + ':' + rest.join(',');
        }
    };
    [
        'save', 'restore', 'setTransform', 'transform', 'translate', 'scale', 'rotate', 'clearRect', 'fillRect',
        'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'arc', 'quadraticCurveTo',
        'bezierCurveTo', 'rect', 'fill', 'stroke', 'clip', 'fillText', 'strokeText', 'putImageData'
    ].forEach(name => {
        context[name] = noop;
    });
    return context;
}
function createCanvas() {
    const drawn = { last: '' };
    const canvas = {
        width: 0,
        height: 0,
        style: {},
        addEventListener: noop,
        removeEventListener: noop,
        toDataURL: () => 'canvas:' + drawn.last
    };
    const context = createContext2D(canvas, drawn);
    canvas.getContext = () => context;
    return canvas;
}
function createImage() {
    let src = '';
    let onload = null;
    const image = {
        style: {},
        width: 0,
        height: 0,
        naturalWidth: 0,
        naturalHeight: 0,
        complete: false,
        addEventListener: noop,
        removeEventListener: noop
    };
    Object.defineProperty(image, 'src', {
        enumerable: true,
        get: () => src,
        set: (value) => {
            src = String(value);
            image.width = image.height = image.naturalWidth = image.naturalHeight = 1;
            image.complete = true;
        }
    });
    Object.defineProperty(image, 'onload', {
        enumerable: true,
        get: () => onload,
        set: (handler) => {
            onload = handler;
            if (image.complete && isHandler(handler)) {
                handler.call(image, {});
            }
        }
    });
    return image;
}
function createElement(tag) {
    if (tag === 'canvas') {
        return createCanvas();
    }
    if (tag === 'img') {
        return createImage();
    }
    return {
        style: {},
        addEventListener: noop,
        removeEventListener: noop,
        appendChild: noop,
        removeChild: noop,
        setAttribute: noop,
        canPlayType: () => ''
    };
}
/**
 * The globals of a fresh vm context. The context's own global object is made
 * `window` / `self` after the context is created, so that built-ins such as
 * String and JSON are reachable through `window` as in a browser.
 */
function createSandbox(console) {
    return {
        document: {
            createElement,
            addEventListener: noop,
            removeEventListener: noop,
            getElementsByTagName: () => [],
            documentElement: { style: {} },
            body: { appendChild: noop, removeChild: noop, style: {} }
        },
        navigator: { userAgent: 'animate-data-converter', platform: 'headless', maxTouchPoints: 0 },
        performance: { now: () => 0 },
        console,
        addEventListener: noop,
        removeEventListener: noop,
        setTimeout: () => 0,
        clearTimeout: noop,
        setInterval: () => 0,
        clearInterval: noop,
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: noop
    };
}
/**
 * A stand-in for an image the HTML template would load from the manifest
 * (`src` is the manifest entry's path, nothing is fetched).
 */
function createLoadedImage(src) {
    const image = createImage();
    image.src = src;
    return image;
}

const SILENT_CONSOLE = {
    log() { },
    info() { },
    debug() { },
    warn() { },
    error() { }
};
/**
 * The createjs runtime: the CreateJS 1.0.0 combined build Animate publishes
 * for, as @tawaship/createjs-module exports it. Its code refers to the browser
 * globals (window, document) as soon as it runs, so it is not required into
 * Node but run inside each vm context, as a CommonJS module, from its source.
 */
const CREATEJS_MODULE = '@tawaship/createjs-module';
let createjsScript = null;
function getCreatejsScript() {
    if (!createjsScript) {
        const file = require.resolve(CREATEJS_MODULE);
        const source = fs__namespace.readFileSync(file, 'utf8');
        createjsScript = new vm__namespace.Script('(function (module, exports) {' + source + '\n})', { filename: path__namespace.basename(file) });
    }
    return createjsScript;
}
function isPropBag(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function');
}
function isCreatejs(value) {
    return isPropBag(value) && ['DisplayObject', 'MovieClip', 'Shape', 'Sprite', 'Bitmap', 'Text', 'Stage', 'Graphics', 'ColorFilter', 'ButtonHelper']
        .every(name => typeof value[name] === 'function') && isPropBag(value.SpriteSheetUtils);
}
function call(owner, name, ...args) {
    const method = owner[name];
    if (typeof method !== 'function') {
        throw new Error('"' + name + '" is not a function');
    }
    return method.apply(owner, args);
}
/**
 * Runs createjs (CreateJS 1.0.0, see CREATEJS_MODULE) and the published code
 * in a fresh vm context and wires up the
 * assets the way the HTML template does, without loading anything: every
 * manifest entry gets a stand-in image (its `src` is the entry's path), and
 * every sprite sheet of `lib.ssMetadata` is built over the manifest image of
 * the same id. MotionGuidePlugin is installed, as the template does for
 * content with motion guides.
 */
function loadPublished(options) {
    const sandbox = createSandbox(options.console ? options.console : SILENT_CONSOLE);
    const context = vm__namespace.createContext(sandbox);
    const global = vm__namespace.runInContext('this', context);
    if (!isPropBag(global)) {
        throw new Error('the vm context has no global object');
    }
    global.window = global;
    global.self = global;
    // The published code reaches createjs through the global `createjs`
    const createjsModule = { exports: {} };
    const runModule = getCreatejsScript().runInContext(context);
    if (typeof runModule !== 'function') {
        throw new Error('could not run ' + CREATEJS_MODULE);
    }
    runModule.call(global, createjsModule, createjsModule.exports);
    const cjs = createjsModule.exports;
    if (!isCreatejs(cjs)) {
        throw new Error(CREATEJS_MODULE + ' did not export a createjs namespace with the expected classes');
    }
    global.createjs = cjs;
    const plugin = cjs.MotionGuidePlugin;
    if (isPropBag(plugin) && typeof plugin.install === 'function') {
        call(plugin, 'install');
    }
    vm__namespace.runInContext(options.published, context, { filename: options.publishedFilename || 'published.js' });
    const adobeAn = global.AdobeAn;
    const compositions = isPropBag(adobeAn) ? adobeAn.compositions : undefined;
    if (!isPropBag(adobeAn) || !isPropBag(compositions)) {
        throw new Error('the published code registered no composition (AdobeAn.compositions); is it Animate HTML5 Canvas output?');
    }
    const ids = Object.keys(compositions);
    const composition = compositions[ids[ids.length - 1]];
    if (!isPropBag(composition)) {
        throw new Error('malformed composition');
    }
    const lib = call(composition, 'getLibrary');
    const spriteSheets = call(composition, 'getSpriteSheet');
    const images = call(composition, 'getImages');
    if (!isPropBag(lib) || !isPropBag(spriteSheets) || !isPropBag(images)) {
        throw new Error('the composition did not provide its library, sprite sheets and images');
    }
    const properties = lib.properties;
    const manifest = isPropBag(properties) ? properties.manifest : undefined;
    if (Array.isArray(manifest)) {
        manifest.forEach((entry) => {
            if (isPropBag(entry) && typeof entry.id === 'string' && typeof entry.src === 'string' && images[entry.id] === undefined) {
                images[entry.id] = createLoadedImage(entry.src);
            }
        });
    }
    const ssMetadata = lib.ssMetadata;
    if (Array.isArray(ssMetadata)) {
        const SpriteSheet = cjs.SpriteSheet;
        ssMetadata.forEach((meta) => {
            if (isPropBag(meta) && typeof meta.name === 'string' && typeof SpriteSheet === 'function') {
                const image = images[meta.name];
                if (image === undefined) {
                    throw new Error('sprite sheet "' + meta.name + '" has no image in the manifest');
                }
                spriteSheets[meta.name] = Reflect.construct(SpriteSheet, [{ images: [image], frames: meta.frames }]);
            }
        });
    }
    return { createjs: cjs, source: { lib, spriteSheets, images, adobeAn } };
}
/**
 * Loads published content (see loadPublished) and extracts its definition.
 */
function extractPublished(options) {
    const content = loadPublished(options);
    return extract(content.createjs, content.source);
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
    'Usage: animate-data-converter <published.js> [--out <file.json>] [--pretty] [--force]',
    '',
    '  <published.js>          the JavaScript file Animate published for HTML5 Canvas',
    '  --out <file>            where to write the definition (standard output when omitted)',
    '  --pretty                indent the JSON',
    '  --force                 write the definition even when the content uses unsupported features'
].join('\n');
function parseArgs(args) {
    const parsed = { published: null, out: null, pretty: false, force: false };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--out') {
            const value = args[++i];
            if (value === undefined) {
                return arg + ' needs a file';
            }
            parsed.out = value;
        }
        else if (arg === '--pretty') {
            parsed.pretty = true;
        }
        else if (arg === '--force') {
            parsed.force = true;
        }
        else if (arg.indexOf('--') === 0 || parsed.published !== null) {
            return 'unexpected argument: ' + arg;
        }
        else {
            parsed.published = arg;
        }
    }
    if (parsed.published === null) {
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
    const parsed = parseArgs(args);
    if (typeof parsed === 'string') {
        io.stderr(parsed + '\n\n' + USAGE + '\n');
        return 2;
    }
    let definition;
    try {
        definition = extractPublishedFile(parsed.published || '');
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
    const json = JSON.stringify(definition, null, parsed.pretty ? '\t' : undefined) + '\n';
    if (parsed.out) {
        fs__namespace.writeFileSync(parsed.out, json);
    }
    else {
        io.stdout(json);
    }
    return definition.issues.length ? 1 : 0;
}

exports.INIT_KEYS = INIT_KEYS;
exports.TEXT_KEYS = TEXT_KEYS;
exports.VERSION = VERSION;
exports.extract = extract;
exports.extractPublished = extractPublished;
exports.extractPublishedFile = extractPublishedFile;
exports.loadPublished = loadPublished;
exports.runCli = runCli;
//# sourceMappingURL=animate-data-converter.cjs.js.map
