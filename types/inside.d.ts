/**
 * Runs createjs (the CreateJS 1.0.0 build Animate publishes for, as the
 * CommonJS module source of @tawaship/createjs-module) and the published code
 * on this realm's global object, wires up the assets the way the HTML template
 * does without loading anything (every manifest entry gets a stand-in image,
 * every sprite sheet of `lib.ssMetadata` is built over the manifest image of
 * the same id, MotionGuidePlugin is installed), and extracts the definition.
 * The result is `{ ok: true, definition }` or `{ ok: false, message }`, as JSON.
 */
export declare function extractInside(createjsModuleSource: string, published: string): string;
