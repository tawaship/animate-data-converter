/**
 * The parts of the createjs (1.0.0) runtime this package reads, declared
 * structurally. Only members the extractor actually touches are listed;
 * the underscore-prefixed ones are createjs internals, so this file doubles
 * as the inventory of internals the extractor depends on.
 *
 * Every interface carries an index signature so that objects can be read
 * generically by property name without widening to `any`.
 */
/**
 * Any value a createjs object property can hold.
 */
export type TValue = number | string | boolean | null | undefined | object;
export interface IPropBag {
    [key: string]: TValue;
}
export interface ICjsDisplayObject extends IPropBag {
    name: string | null;
    parent: TValue;
    mask: ICjsDisplayObject | null;
    hitArea: ICjsDisplayObject | null;
    filters: TValue[] | null;
    bitmapCache: TValue;
    /** Event listeners by type (createjs.EventDispatcher internals) */
    _listeners: TValue;
    nominalBounds: TValue;
    frameBounds: TValue;
}
export interface ICjsContainer extends ICjsDisplayObject {
    children: ICjsDisplayObject[];
}
export interface ICjsTweenStep extends IPropBag {
    next: ICjsTweenStep | null;
    t: number;
    d: number;
    props: IPropBag;
    passive: boolean;
}
export interface ICjsTweenAction extends IPropBag {
    next: ICjsTweenAction | null;
    t: number;
    funct: Function;
    params: TValue[] | null;
    scope: TValue;
}
export interface ICjsTween extends IPropBag {
    target: IPropBag;
    duration: number;
    loop: number;
    reversed: boolean;
    bounce: boolean;
    passive: boolean;
    position: number;
    _stepHead: ICjsTweenStep;
    _actionHead: ICjsTweenAction | null;
    /**
     * Writes the target's properties for the current `position`.
     * Unlike setPosition, it neither skips an unchanged position nor runs actions.
     */
    _updatePosition(jump: boolean, end: boolean): void;
}
export interface ICjsTimeline extends IPropBag {
    tweens: ICjsTween[];
    duration: number;
}
export interface ICjsFrameLabel extends IPropBag {
    label: string;
    position: number;
}
export interface ICjsMovieClip extends ICjsContainer {
    timeline: ICjsTimeline;
    mode: string;
    startPosition: number;
    loop: number;
    labels: ICjsFrameLabel[];
    currentFrame: number;
}
export interface ICjsGraphics extends IPropBag {
    /** The committed drawing commands */
    instructions: IPropBag[];
}
export interface ICjsShape extends ICjsDisplayObject {
    graphics: TValue;
}
export interface ICjsSprite extends ICjsDisplayObject {
    spriteSheet: TValue;
    currentFrame: number;
    paused: boolean;
}
export interface ICjsBitmap extends ICjsDisplayObject {
    image: TValue;
    sourceRect: TValue;
}
export interface ICjsText extends ICjsDisplayObject {
    text: TValue;
    font: TValue;
}
export interface ICjsButtonHelper extends IPropBag {
    target: TValue;
    outLabel: string | number;
    overLabel: string | number;
    downLabel: string | number;
    play: boolean;
}
export interface ICjsSpriteSheet extends IPropBag {
    getAnimation(name: string): IPropBag | null;
}
export interface ICjsSpriteSheetUtils extends IPropBag {
    /** Draws one frame of a sprite sheet into a new image (published code uses it for bitmap fills) */
    extractFrame(spriteSheet: ICjsSpriteSheet, frame: number | string): TValue;
}
type TClass<T extends IPropBag> = new (...args: never[]) => T;
/**
 * A display object class registered in the published `lib`, constructed with
 * no arguments the way the HTML template does.
 */
export type TLibraryClass = new () => ICjsDisplayObject;
/**
 * The createjs namespace the content was built with.
 */
export interface ICreatejs {
    DisplayObject: TClass<ICjsDisplayObject>;
    Container: TClass<ICjsContainer>;
    MovieClip: TClass<ICjsMovieClip>;
    Shape: TClass<ICjsShape>;
    Sprite: TClass<ICjsSprite>;
    Bitmap: TClass<ICjsBitmap>;
    Text: TClass<ICjsText>;
    Stage: TClass<ICjsContainer>;
    Graphics: TClass<ICjsGraphics> & IPropBag;
    ColorFilter: TClass<IPropBag>;
    ButtonHelper: TClass<ICjsButtonHelper>;
    SpriteSheet: TClass<ICjsSpriteSheet>;
    SpriteSheetUtils: ICjsSpriteSheetUtils;
    /** Present in the combined build; installed before the published code runs */
    MotionGuidePlugin?: IPropBag;
}
/**
 * What the published code provides besides the createjs namespace. Animate's
 * composition API hands these out (`getLibrary()`, `getSpriteSheet()`,
 * `getImages()`, and the `AdobeAn` object itself).
 */
export interface IExtractSource {
    /** The library object the published code fills in (`lib.xxx = function ...`) */
    lib: IPropBag;
    /** Sprite sheets by name, as the template builds them from `lib.ssMetadata` */
    spriteSheets?: IPropBag;
    /** Images by manifest id */
    images?: IPropBag;
    /** The `AdobeAn` object (to recognize the template's own listeners, such as handleFilterCache) */
    adobeAn?: IPropBag;
}
export {};
