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
import { IPropBag } from './createjs';
/**
 * The globals of a fresh vm context. The context's own global object is made
 * `window` / `self` after the context is created, so that built-ins such as
 * String and JSON are reachable through `window` as in a browser.
 */
export declare function createSandbox(console: IPropBag): IPropBag;
/**
 * A stand-in for an image the HTML template would load from the manifest
 * (`src` is the manifest entry's path, nothing is fetched).
 */
export declare function createLoadedImage(src: string): IPropBag;
