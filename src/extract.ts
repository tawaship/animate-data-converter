import {
	ICreatejs, ICjsDisplayObject, ICjsMovieClip, ICjsTween, ICjsTweenStep, ICjsTweenAction,
	ICjsSprite, ICjsSpriteSheet, ICjsBitmap, IExtractSource, IPropBag, TValue, TLibraryClass
} from './createjs';
import {
	IDefinition, IMovieClipSymbolDef, ISlotDef, ITweenDef, IActionDef, IPropMapDef, IStateEntryDef,
	IGraphicsDef, IGraphicsCommandDef, ISpriteDef, IBitmapDef, IFilterDef, ICacheDef, IButtonDef,
	IFilterCacheEntryDef, IRectDef, IDataMap, TDataValue, TFrameValue, TTargetDef,
	ISpriteSheetDef, IManifestEntryDef, TSymbolDef, INIT_KEYS, TEXT_KEYS
} from './types';
import { VERSION } from './version';

interface IContext {
	cjs: ICreatejs;
	source: IExtractSource;
	/**
	 * Symbol id by class prototype: lib keys for registered classes, generated ids
	 * for the rest. Classes are told apart by prototype, not by `constructor`:
	 * published code often replaces a symbol's prototype without setting
	 * `constructor` (`(lib.x = function () { ... }).prototype = new lib.AnMovieClip()`),
	 * so `constructor` resolves to an ancestor shared by unrelated symbols.
	 */
	ids: Map<object, string>;
	/** Graphics command class name by prototype */
	commandTypes: Map<object, string>;
	/** The template's AdobeAn.handleFilterCache, when the AdobeAn object is given */
	filterCacheHandler: TValue;
	/** lib classes by id */
	classes: Map<string, TLibraryClass>;
	/** Images SpriteSheetUtils.extractFrame made during extraction, by the sheet and frame drawn */
	frameImages: Map<object, { sheet: string; frame: number }>;
	definition: IDefinition;
	baseKeys: Set<string> | null;
	counter: number;
}

type TPrimitive = number | string | boolean | null | undefined;

/**
 * Resolution of objects met while defining one MovieClip symbol.
 */
interface ISymbolScope {
	symbol: string;
	targetOf(value: TValue): TTargetDef | null;
	graphicsOf(value: TValue): number | null;
	slotOf(value: TValue): number | null;
	stateMemo: Map<TValue[], IStateEntryDef[]>;
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
 */
export function extract(cjs: ICreatejs, source: IExtractSource): IDefinition {
	const lib = source.lib;
	const properties = lib.properties;
	const adobeAn = source.adobeAn;

	const ctx: IContext = {
		cjs,
		source,
		ids: new Map<object, string>(),
		commandTypes: new Map<object, string>(),
		filterCacheHandler: adobeAn ? adobeAn.handleFilterCache : undefined,
		classes: new Map<string, TLibraryClass>(),
		frameImages: new Map<object, { sheet: string; frame: number }>(),
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
			const prototype: TValue = command.prototype;
			if (isPropBag(prototype)) {
				ctx.commandTypes.set(prototype, name);
			}
		}
	});

	const classes: { id: string; ctor: TLibraryClass }[] = [];
	Object.keys(lib).forEach(id => {
		const value = lib[id];
		if (isLibraryClass(cjs, value)) {
			const prototype: TValue = value.prototype;
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
	utils.extractFrame = function (spriteSheet: ICjsSpriteSheet, frame: number | string): TValue {
		const image = extractFrame.call(utils, spriteSheet, frame);
		recordFrameImage(ctx, image, spriteSheet, frame);
		return image;
	};

	try {
		classes.forEach(entry => defineLibraryClass(ctx, entry.id, entry.ctor));
	} finally {
		utils.extractFrame = extractFrame;
	}

	return ctx.definition;
}

function recordFrameImage(ctx: IContext, image: TValue, spriteSheet: ICjsSpriteSheet, frame: number | string): void {
	if (!isPropBag(image)) {
		return;
	}

	const sheet = keyOf(ctx.source.spriteSheets, spriteSheet);
	// A frame given by animation name resolves to the animation's first frame, as extractFrame does
	let index: TValue = frame;
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

function defineLibraryClass(ctx: IContext, id: string, ctor: TLibraryClass): void {
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
		} else if (instance.mask || (instance.filters && instance.filters.length) || instance.bitmapCache || hasListeners(instance)) {
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

function isPrimitive(value: TValue): value is TPrimitive {
	return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

function isPropBag(value: TValue): value is IPropBag {
	return !isPrimitive(value);
}

function isNumber(value: TValue): value is number {
	return typeof value === 'number';
}

function isDisplayObject(ctx: IContext, value: TValue): value is ICjsDisplayObject {
	return isPropBag(value) && value instanceof ctx.cjs.DisplayObject;
}

function isLibraryClass(cjs: ICreatejs, value: TValue): value is TLibraryClass {
	if (typeof value !== 'function') {
		return false;
	}

	const prototype: TValue = value.prototype;
	return isPropBag(prototype) && prototype instanceof cjs.DisplayObject && !(prototype instanceof cjs.Stage);
}

function issue(ctx: IContext, symbol: string, slot: number | null, message: string): void {
	ctx.definition.issues.push({ symbol, slot, message });
}

function keyOf(map: IPropBag | undefined, value: TValue): string | null {
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
function getBaseKeys(ctx: IContext): Set<string> {
	if (!ctx.baseKeys) {
		ctx.baseKeys = new Set<string>(Object.keys(new ctx.cjs.MovieClip()));
	}

	return ctx.baseKeys;
}

function readProperties(value: TValue): IPropMapDef {
	const properties: IPropMapDef = {};

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

function readManifest(ctx: IContext, properties: TValue): IManifestEntryDef[] {
	const manifest: IManifestEntryDef[] = [];
	const list = isPropBag(properties) ? properties.manifest : undefined;

	if (Array.isArray(list)) {
		list.forEach((entry: TValue) => {
			if (isPropBag(entry) && typeof entry.id === 'string' && typeof entry.src === 'string') {
				manifest.push({ id: entry.id, src: entry.src });
			} else {
				issue(ctx, '', null, 'malformed manifest entry');
			}
		});
	}

	return manifest;
}

function readSpriteSheets(ctx: IContext, value: TValue): ISpriteSheetDef[] {
	const sheets: ISpriteSheetDef[] = [];

	if (Array.isArray(value)) {
		value.forEach((entry: TValue) => {
			if (isPropBag(entry) && typeof entry.name === 'string' && Array.isArray(entry.frames)) {
				sheets.push({ name: entry.name, frames: entry.frames.map((frame: TValue) => toPlainData(ctx, '', frame)) });
			} else {
				issue(ctx, '', null, 'malformed sprite sheet metadata');
			}
		});
	}

	return sheets;
}

/**
 * Plain data (numbers, strings, arrays, plain objects) as a JSON value.
 */
function toPlainData(ctx: IContext, symbol: string, value: TValue): TDataValue {
	if (isPrimitive(value)) {
		return value === undefined ? null : value;
	}

	if (!isPropBag(value)) {
		return null;
	}

	if (Array.isArray(value)) {
		return value.map((v: TValue) => toPlainData(ctx, symbol, v));
	}

	if (Object.getPrototypeOf(value) === Object.prototype) {
		const map: IDataMap = {};
		Object.keys(value).forEach(key => {
			map[key] = toPlainData(ctx, symbol, value[key]);
		});
		return map;
	}

	issue(ctx, symbol, null, 'unsupported value (an object that is not plain data)');
	return null;
}

function readInit(obj: IPropBag): IPropMapDef {
	const init: IPropMapDef = {};

	// An unset property (undefined) is left out: it is simply not assigned
	INIT_KEYS.forEach(key => {
		const value = obj[key];
		if (isPrimitive(value) && value !== undefined) {
			init[key] = value;
		}
	});

	return init;
}

function readRect(value: TValue): IRectDef | null {
	if (isPropBag(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height)) {
		return { x: value.x, y: value.y, width: value.width, height: value.height };
	}

	return null;
}

function readRects(value: TValue): IRectDef[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const rects: IRectDef[] = [];
	value.forEach((v: TValue) => {
		const rect = readRect(v);
		if (rect) {
			rects.push(rect);
		}
	});
	return rects;
}

function readSprite(ctx: IContext, symbol: string, slot: number | null, sprite: ICjsSprite): ISpriteDef {
	const sheet = keyOf(ctx.source.spriteSheets, sprite.spriteSheet);
	if (sheet === null) {
		issue(ctx, symbol, slot, 'a sprite whose sprite sheet is not one of the published sheets');
	}

	return { sheet: sheet === null ? '' : sheet, frame: sprite.currentFrame, paused: sprite.paused };
}

function readBitmap(ctx: IContext, symbol: string, slot: number | null, bitmap: ICjsBitmap): IBitmapDef {
	const image = keyOf(ctx.source.images, bitmap.image);
	if (image === null) {
		issue(ctx, symbol, slot, 'a bitmap whose image is not one of the published images');
	}

	return { image: image === null ? '' : image, sourceRect: readRect(bitmap.sourceRect) };
}

function readText(obj: IPropBag): IDataMap {
	const text: IDataMap = {};

	TEXT_KEYS.forEach(key => {
		const value = obj[key];
		if (isPrimitive(value) && value !== undefined) {
			text[key] = value;
		}
	});

	return text;
}

function readCache(value: TValue): ICacheDef | null {
	if (isPropBag(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.width) && isNumber(value.height) && isNumber(value.scale)) {
		return { x: value.x, y: value.y, width: value.width, height: value.height, scale: value.scale };
	}

	return null;
}

function readGraphics(ctx: IContext, symbol: string, graphics: IPropBag): IGraphicsDef {
	const instructions = graphics.instructions;
	const commands: IGraphicsCommandDef[] = [];

	if (!Array.isArray(instructions)) {
		issue(ctx, symbol, null, 'a graphics object without instructions');
		return { commands };
	}

	instructions.forEach((instruction: TValue) => {
		if (!isPropBag(instruction)) {
			issue(ctx, symbol, null, 'malformed graphics instruction');
			return;
		}

		const type = ctx.commandTypes.get(Object.getPrototypeOf(instruction));
		if (type === undefined) {
			issue(ctx, symbol, null, 'unsupported graphics command');
			return;
		}

		const props: IDataMap = {};
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
function toCommandValue(ctx: IContext, symbol: string, value: TValue): TDataValue {
	if (isPrimitive(value)) {
		return value === undefined ? null : value;
	}

	if (!isPropBag(value)) {
		return null;
	}

	if (Array.isArray(value)) {
		return value.map((v: TValue) => toCommandValue(ctx, symbol, v));
	}

	// Gradient and bitmap fill styles keep the arguments they were created with in `props`
	const props = value.props;
	if (isPropBag(props)) {
		const map: IDataMap = {};
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

function defineMovieClip(ctx: IContext, mc: ICjsMovieClip): string {
	const prototype: object = Object.getPrototypeOf(mc);
	// A bare createjs.MovieClip has no class of its own to share
	const shared = prototype !== ctx.cjs.MovieClip.prototype;

	// lib classes have their ids assigned up front; a symbol is defined once,
	// from whichever instance of the class is met first
	const known = shared ? ctx.ids.get(prototype) : undefined;
	if (known !== undefined && ctx.definition.symbols[known]) {
		return known;
	}

	let id: string;
	if (known !== undefined) {
		id = known;
	} else {
		// Classes not registered in lib get a generated id (`#` never starts a lib key,
		// which is a JavaScript identifier in published code)
		id = '#' + (ctx.counter++);
		if (shared) {
			ctx.ids.set(prototype, id);
		}
	}

	const def: IMovieClipSymbolDef = {
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

	const slotObjects: ICjsDisplayObject[] = [];
	const slotIndex = new Map<ICjsDisplayObject, number>();
	const filterOwners = new Map<IPropBag, { slot: number; filter: number }>();
	const graphicsIndex = new Map<IPropBag, number>();

	const addSlot = (obj: ICjsDisplayObject): number => {
		const known = slotIndex.get(obj);
		if (known !== undefined) {
			return known;
		}

		slotIndex.set(obj, slotObjects.length);
		slotObjects.push(obj);
		return slotObjects.length - 1;
	};

	const scope: ISymbolScope = {
		symbol: id,
		stateMemo: new Map<TValue[], IStateEntryDef[]>(),
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
	const addReferenced = (): void => {
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

	const managed = new Set<number>();
	const markManaged = (target: TTargetDef): void => {
		if (target.type === 'slot') {
			managed.add(target.slot);
		}
	};
	def.tweens.forEach(tween => {
		markManaged(tween.target);
		tween.frames.forEach(frame => {
			frame.forEach(value => {
				if (Array.isArray(value)) {
					value.forEach((entry: IStateEntryDef) => {
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

function hasListeners(obj: ICjsDisplayObject): boolean {
	const listeners = obj._listeners;
	if (!isPropBag(listeners)) {
		return false;
	}

	return Object.keys(listeners).some(type => {
		const list = listeners[type];
		return Array.isArray(list) && list.length > 0;
	});
}

function emptySlot(obj: ICjsDisplayObject): ISlotDef {
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

function defineSlot(ctx: IContext, scope: ISymbolScope, mc: ICjsMovieClip, index: number, obj: ICjsDisplayObject): ISlotDef {
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
	} else if (obj instanceof ctx.cjs.Sprite) {
		slot.kind = 'sprite';
		slot.symbol = libraryIdOf(ctx, obj);
		const sprite = readSprite(ctx, symbol, index, obj);
		const own = librarySymbol(ctx, slot.symbol);
		slot.sprite = own && own.kind === 'sprite' && sameData(own.sprite, sprite) ? null : sprite;
	} else if (obj instanceof ctx.cjs.Bitmap) {
		slot.kind = 'bitmap';
		slot.symbol = libraryIdOf(ctx, obj);
		const bitmap = readBitmap(ctx, symbol, index, obj);
		const own = librarySymbol(ctx, slot.symbol);
		slot.bitmap = own && own.kind === 'bitmap' && sameData(own.bitmap, bitmap) ? null : bitmap;
	} else if (obj instanceof ctx.cjs.Text) {
		slot.kind = 'text';
		slot.text = readText(obj);
	} else if (obj instanceof ctx.cjs.Shape) {
		slot.kind = 'shape';
		slot.graphics = scope.graphicsOf(obj.graphics);
	} else {
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
function librarySymbol(ctx: IContext, id: string | null): TSymbolDef | null {
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

function sameData(a: TDataValue | ISpriteDef | IBitmapDef, b: TDataValue | ISpriteDef | IBitmapDef): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function libraryIdOf(ctx: IContext, obj: ICjsDisplayObject): string | null {
	const id = ctx.ids.get(Object.getPrototypeOf(obj));
	return id === undefined ? null : id;
}

function readFilters(ctx: IContext, symbol: string, slot: number, obj: ICjsDisplayObject): IFilterDef[] | null {
	if (!obj.filters) {
		return null;
	}

	const filters: IFilterDef[] = [];
	obj.filters.forEach(filter => {
		if (isPropBag(filter) && filter instanceof ctx.cjs.ColorFilter) {
			const props: IDataMap = {};
			COLOR_FILTER_KEYS.forEach(key => {
				const value = filter[key];
				if (isNumber(value)) {
					props[key] = value;
				}
			});
			filters.push({ type: 'ColorFilter', props });
		} else {
			issue(ctx, symbol, slot, 'unsupported filter (only ColorFilter is supported)');
		}
	});

	return filters;
}

function readListeners(ctx: IContext, scope: ISymbolScope, index: number, obj: ICjsDisplayObject, slot: ISlotDef): void {
	const listeners = obj._listeners;
	if (!isPropBag(listeners)) {
		return;
	}

	Object.keys(listeners).forEach(type => {
		const list = listeners[type];
		if (!Array.isArray(list)) {
			return;
		}

		list.forEach((listener: TValue) => {
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

function readFilterCacheList(ctx: IContext, scope: ISymbolScope, index: number | null, obj: ICjsDisplayObject): IFilterCacheEntryDef[] | null {
	const list = obj.filterCacheList;
	if (list === undefined) {
		return null;
	}

	const entries: IFilterCacheEntryDef[] = [];
	if (!Array.isArray(list)) {
		issue(ctx, scope.symbol, index, 'malformed filterCacheList');
		return entries;
	}

	list.forEach((entry: TValue) => {
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
		} else {
			issue(ctx, scope.symbol, index, 'malformed filterCacheList entry');
		}
	});

	return entries;
}

function evaluateTween(ctx: IContext, scope: ISymbolScope, tween: ICjsTween, target: TTargetDef): ITweenDef {
	const symbol = scope.symbol;

	if (tween.loop !== 0 || tween.reversed || tween.bounce) {
		issue(ctx, symbol, null, 'looping, reversed or bouncing tweens are not supported');
	}

	// The head step is a sentinel created as passive; real steps start after it
	for (let step: ICjsTweenStep | null = tween._stepHead.next; step; step = step.next) {
		if (step.passive) {
			issue(ctx, symbol, null, 'passive waits are not supported');
			break;
		}
	}

	// Observe what the tween writes at each integer position through a
	// recording stand-in for its target. Reads fall through to the real target
	// (plugins may read it), writes never reach it.
	const original = tween.target;
	const written: string[] = [];
	let current: IPropBag = {};

	const recorder = new Proxy<IPropBag>({}, {
		get(_target, key) {
			if (typeof key !== 'string') {
				return undefined;
			}

			return Object.prototype.hasOwnProperty.call(current, key) ? current[key] : original[key];
		},
		set(_target, key, value: TValue) {
			if (typeof key === 'string' && PLUGIN_BOOKKEEPING_KEYS.indexOf(key) < 0) {
				if (written.indexOf(key) < 0) {
					written.push(key);
				}
				current[key] = value;
			}
			return true;
		}
	});

	const writes: IPropBag[] = [];
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

	const keyframes: number[] = [];
	for (let step: ICjsTweenStep | null = tween._stepHead.next; step; step = step.next) {
		keyframes.push(step.t);
	}

	const actions: IActionDef[] = [];
	for (let action: ICjsTweenAction | null = tween._actionHead; action; action = action.next) {
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
function readParams(ctx: IContext, scope: ISymbolScope, tween: ICjsTween, action: ICjsTweenAction): TFrameValue[] | null {
	const params = action.params;
	if (!params || (params.length === 1 && params[0] === tween)) {
		return null;
	}

	return params.map(value => toFrameValue(ctx, scope, value));
}

function toFrameValue(ctx: IContext, scope: ISymbolScope, value: TValue): TFrameValue {
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
function toStateValue(ctx: IContext, scope: ISymbolScope, value: TValue[]): IStateEntryDef[] {
	const known = scope.stateMemo.get(value);
	if (known) {
		return known;
	}

	const entries: IStateEntryDef[] = [];
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

		let props: IPropMapDef | null = null;
		const source = entry.p;
		if (isPropBag(source)) {
			const map: IPropMapDef = {};
			Object.keys(source).forEach(key => {
				const v = source[key];
				if (isPrimitive(v)) {
					// A written undefined (e.g. `compositeOperation: undefined`, which clears a blend) is recorded as null
					map[key] = v === undefined ? null : v;
				} else {
					issue(ctx, scope.symbol, null, 'unsupported value in state entry property "' + key + '"');
				}
			});
			props = map;
		}

		entries.push({ target, props });
	});

	return entries;
}
