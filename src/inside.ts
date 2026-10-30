/**
 * What runs inside the sandbox (QuickJS, see load.ts): createjs and the
 * published code are run on the sandbox's global object, the assets are wired
 * up the way the HTML template does, and the definition is extracted. Only
 * text crosses the boundary: the sources come in as strings and the result
 * goes out as a JSON string. Nothing of the host is reachable from here.
 */
import { ICreatejs, IPropBag, TValue } from './createjs';
import { extract } from './extract';
import { createSandbox, createLoadedImage } from './environment';

const SILENT_CONSOLE: IPropBag = {
	log() { /* silenced */ },
	info() { /* silenced */ },
	debug() { /* silenced */ },
	warn() { /* silenced */ },
	error() { /* silenced */ }
};

function isPropBag(value: TValue): value is IPropBag {
	return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function isCreatejs(value: TValue): value is ICreatejs {
	return isPropBag(value) && ['DisplayObject', 'MovieClip', 'Shape', 'Sprite', 'Bitmap', 'Text', 'Stage', 'Graphics', 'ColorFilter', 'ButtonHelper']
		.every(name => typeof value[name] === 'function') && isPropBag(value.SpriteSheetUtils);
}

function call(owner: IPropBag, name: string, ...args: TValue[]): TValue {
	const method = owner[name];
	if (typeof method !== 'function') {
		throw new Error('"' + name + '" is not a function');
	}
	return method.apply(owner, args);
}

/** Runs code on the global object (an indirect eval) */
const runGlobally: (code: string) => TValue = eval;

/**
 * Runs createjs (the CreateJS 1.0.0 build Animate publishes for, as the
 * CommonJS module source of @tawaship/createjs-module) and the published code
 * on this realm's global object, wires up the assets the way the HTML template
 * does without loading anything (every manifest entry gets a stand-in image,
 * every sprite sheet of `lib.ssMetadata` is built over the manifest image of
 * the same id, MotionGuidePlugin is installed), and extracts the definition.
 * The result is `{ ok: true, definition }` or `{ ok: false, message }`, as JSON.
 */
export function extractInside(createjsModuleSource: string, published: string): string {
	try {
		const global: TValue = globalThis;
		if (!isPropBag(global)) {
			throw new Error('the sandbox has no global object');
		}
		const sandbox = createSandbox(SILENT_CONSOLE);
		Object.keys(sandbox).forEach(key => {
			global[key] = sandbox[key];
		});
		global.window = global;
		global.self = global;

		// The published code reaches createjs through the global `createjs`
		const createjsModule: IPropBag = { exports: {} };
		const runModule = runGlobally('(function (module, exports) {' + createjsModuleSource + '\n})');
		if (typeof runModule !== 'function') {
			throw new Error('could not run createjs');
		}
		runModule.call(global, createjsModule, createjsModule.exports);
		const cjs: TValue = createjsModule.exports;
		if (!isCreatejs(cjs)) {
			throw new Error('createjs did not export a createjs namespace with the expected classes');
		}
		global.createjs = cjs;

		const plugin = cjs.MotionGuidePlugin;
		if (isPropBag(plugin) && typeof plugin.install === 'function') {
			call(plugin, 'install');
		}

		runGlobally(published);

		const adobeAn: TValue = global.AdobeAn;
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
			manifest.forEach((entry: TValue) => {
				if (isPropBag(entry) && typeof entry.id === 'string' && typeof entry.src === 'string' && images[entry.id] === undefined) {
					images[entry.id] = createLoadedImage(entry.src);
				}
			});
		}

		const ssMetadata = lib.ssMetadata;
		if (Array.isArray(ssMetadata)) {
			const SpriteSheet = cjs.SpriteSheet;
			ssMetadata.forEach((meta: TValue) => {
				if (isPropBag(meta) && typeof meta.name === 'string' && typeof SpriteSheet === 'function') {
					const image = images[meta.name];
					if (image === undefined) {
						throw new Error('sprite sheet "' + meta.name + '" has no image in the manifest');
					}
					spriteSheets[meta.name] = Reflect.construct(SpriteSheet, [{ images: [image], frames: meta.frames }]);
				}
			});
		}

		return JSON.stringify({ ok: true, definition: extract(cjs, { lib, spriteSheets, images, adobeAn }) });
	} catch (e) {
		return JSON.stringify({ ok: false, message: e instanceof Error ? e.message : String(e) });
	}
}
