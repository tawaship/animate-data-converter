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

import { IPropBag, TValue } from './createjs';

type THandler = (this: IPropBag, event: IPropBag) => void;

function noop(): void {
	// Nothing to do in a headless environment
}

function isHandler(value: TValue): value is THandler {
	return typeof value === 'function';
}

function createContext2D(canvas: IPropBag, drawn: { last: string }): IPropBag {
	const context: IPropBag = {
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
		drawImage: (image: TValue, ...rest: TValue[]) => {
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

function createCanvas(): IPropBag {
	const drawn = { last: '' };
	const canvas: IPropBag = {
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

function createImage(): IPropBag {
	let src = '';
	let onload: TValue = null;
	const image: IPropBag = {
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
		set: (value: TValue) => {
			src = String(value);
			image.width = image.height = image.naturalWidth = image.naturalHeight = 1;
			image.complete = true;
		}
	});

	Object.defineProperty(image, 'onload', {
		enumerable: true,
		get: () => onload,
		set: (handler: TValue) => {
			onload = handler;
			if (image.complete && isHandler(handler)) {
				handler.call(image, {});
			}
		}
	});

	return image;
}

function createElement(tag: string): IPropBag {
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
export function createSandbox(console: IPropBag): IPropBag {
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
export function createLoadedImage(src: string): IPropBag {
	const image = createImage();
	image.src = src;
	return image;
}
