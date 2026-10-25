import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { ICreatejs, IExtractSource, IPropBag, TValue } from './createjs';
import { IDefinition } from './types';
import { extract } from './extract';
import { createSandbox, createLoadedImage } from './environment';

export interface ILoadOptions {
	/** Source text of the published JS */
	published: string;
	/** File name shown in error stacks */
	publishedFilename?: string;
	/** Where console output of the published code goes (silenced by default) */
	console?: IPropBag;
}

export interface ILoadedContent {
	/** The createjs namespace the content was run with */
	createjs: ICreatejs;
	/** What extract() reads */
	source: IExtractSource;
}

const SILENT_CONSOLE: IPropBag = {
	log() { /* silenced */ },
	info() { /* silenced */ },
	debug() { /* silenced */ },
	warn() { /* silenced */ },
	error() { /* silenced */ }
};

/**
 * The createjs runtime: the CreateJS 1.0.0 combined build Animate publishes
 * for, as @tawaship/createjs-module exports it. Its code refers to the browser
 * globals (window, document) as soon as it runs, so it is not required into
 * Node but run inside each vm context, as a CommonJS module, from its source.
 */
const CREATEJS_MODULE = '@tawaship/createjs-module';
let createjsScript: vm.Script | null = null;

function getCreatejsScript(): vm.Script {
	if (!createjsScript) {
		const file = require.resolve(CREATEJS_MODULE);
		const source = fs.readFileSync(file, 'utf8');
		createjsScript = new vm.Script('(function (module, exports) {' + source + '\n})', { filename: path.basename(file) });
	}
	return createjsScript;
}

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

/**
 * Runs createjs (CreateJS 1.0.0, see CREATEJS_MODULE) and the published code
 * in a fresh vm context and wires up the
 * assets the way the HTML template does, without loading anything: every
 * manifest entry gets a stand-in image (its `src` is the entry's path), and
 * every sprite sheet of `lib.ssMetadata` is built over the manifest image of
 * the same id. MotionGuidePlugin is installed, as the template does for
 * content with motion guides.
 */
export function loadPublished(options: ILoadOptions): ILoadedContent {
	const sandbox = createSandbox(options.console ? options.console : SILENT_CONSOLE);
	const context = vm.createContext(sandbox);
	const global: TValue = vm.runInContext('this', context);
	if (!isPropBag(global)) {
		throw new Error('the vm context has no global object');
	}
	global.window = global;
	global.self = global;

	// The published code reaches createjs through the global `createjs`
	const createjsModule: IPropBag = { exports: {} };
	const runModule: TValue = getCreatejsScript().runInContext(context);
	if (typeof runModule !== 'function') {
		throw new Error('could not run ' + CREATEJS_MODULE);
	}
	runModule.call(global, createjsModule, createjsModule.exports);
	const cjs: TValue = createjsModule.exports;
	if (!isCreatejs(cjs)) {
		throw new Error(CREATEJS_MODULE + ' did not export a createjs namespace with the expected classes');
	}
	global.createjs = cjs;

	const plugin = cjs.MotionGuidePlugin;
	if (isPropBag(plugin) && typeof plugin.install === 'function') {
		call(plugin, 'install');
	}

	vm.runInContext(options.published, context, { filename: options.publishedFilename || 'published.js' });

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

	return { createjs: cjs, source: { lib, spriteSheets, images, adobeAn } };
}

/**
 * Loads published content (see loadPublished) and extracts its definition.
 */
export function extractPublished(options: ILoadOptions): IDefinition {
	const content = loadPublished(options);
	return extract(content.createjs, content.source);
}

/**
 * extractPublished() with the published JS read from a file.
 */
export function extractPublishedFile(publishedPath: string): IDefinition {
	return extractPublished({
		published: fs.readFileSync(publishedPath, 'utf8'),
		publishedFilename: path.basename(publishedPath)
	});
}
