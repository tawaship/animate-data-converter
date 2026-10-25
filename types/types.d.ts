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
export declare const INIT_KEYS: string[];
/**
 * Text properties recorded for a Text.
 */
export declare const TEXT_KEYS: string[];
/**
 * Any JSON value.
 */
export type TDataValue = number | string | boolean | null | TDataValue[] | IDataMap;
export interface IDataMap {
    [key: string]: TDataValue;
}
export interface IRectDef {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type TDisplayKind = 'movieclip' | 'shape' | 'sprite' | 'bitmap' | 'text' | 'unsupported';
export type TTargetDef = {
    type: 'self';
} | {
    type: 'slot';
    slot: number;
} | {
    type: 'filter';
    slot: number;
    filter: number;
} | {
    type: 'object';
};
export interface IStateEntryDef {
    target: TTargetDef;
    props: IPropMapDef | null;
}
/**
 * A Graphics written by a tween (e.g. a mask outline per keyframe), as an
 * index into the symbol's `graphics` table.
 */
export interface IGraphicsRefDef {
    graphics: number;
}
export type TFrameValue = number | string | boolean | null | IStateEntryDef[] | IGraphicsRefDef;
export interface IPropMapDef {
    [key: string]: TFrameValue;
}
export interface IActionDef {
    /** Timeline position the action sits on */
    position: number;
    /**
     * Source text of the frame script function, as published
     * (e.g. `function () { this.stop(); }`). Variables it references outside
     * its own body are not carried along.
     */
    source: string;
    params: TFrameValue[] | null;
}
export interface ITweenDef {
    target: TTargetDef;
    duration: number;
    /** The properties this tween writes, i.e. its managed properties */
    props: string[];
    /** frames[position][i] is the value of props[i] at that position (0..duration) */
    frames: TFrameValue[][];
    /**
     * Start positions of the tween's steps, in order. createjs derives the frame
     * of a SYNCHED / SINGLE_FRAME child placed by this tween from the distance
     * between the current position and the start of the step containing it
     * (the last step whose start is at or before the position).
     */
    keyframes: number[];
    actions: IActionDef[];
}
/**
 * One drawing command of a Graphics, as createjs holds it after decoding
 * (`p("...")` compact paths become moveTo / lineTo / curveTo commands).
 * `type` is the createjs command class name (MoveTo, QuadraticCurveTo, Fill,
 * StrokeStyle, ...); `props` are its own properties. A gradient or bitmap fill
 * style is recorded by the arguments it was created with (`type`, `colors`,
 * `ratios`, coordinates). A bitmap fill's image is `{ image: <image id> }` for
 * an image of the manifest, or `{ sheet: <sprite sheet name>, frame: <frame> }`
 * for an image drawn from a sprite sheet frame (sprite sheet publish output
 * makes it with `SpriteSheetUtils.extractFrame` and sets the fill once it loads).
 */
export interface IGraphicsCommandDef {
    type: string;
    props: IDataMap;
}
export interface IGraphicsDef {
    commands: IGraphicsCommandDef[];
}
export interface ISpriteDef {
    /** Sprite sheet name (`lib.ssMetadata[].name`) */
    sheet: string;
    frame: number;
    paused: boolean;
}
export interface IBitmapDef {
    /** Image id (`lib.properties.manifest[].id`) */
    image: string;
    sourceRect: IRectDef | null;
}
export interface IFilterDef {
    /** createjs filter class name. Only ColorFilter is supported */
    type: string;
    props: IDataMap;
}
export interface ICacheDef {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
}
/**
 * A createjs.ButtonHelper attached to a slot.
 */
export interface IButtonDef {
    out: string | number;
    over: string | number;
    down: string | number;
    play: boolean;
    /** Slot index of the hit area clip, if any */
    hit: number | null;
    /** Frame the hit area clip was sent to */
    hitFrame: number | null;
}
/**
 * An entry of `filterCacheList`, read by the published template's
 * `AdobeAn.handleFilterCache` to re-cache an instance within a frame range.
 * `instance` refers to a slot of the symbol that owns the list.
 */
export interface IFilterCacheEntryDef {
    instance: TTargetDef;
    startFrame: number;
    endFrame: number;
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface ISlotDef {
    kind: TDisplayKind;
    /** Symbol id for MovieClip slots, and for Sprite / Bitmap slots that are instances of a lib symbol */
    symbol: string | null;
    /** Constructor-time display properties */
    init: IPropMapDef;
    /** Per-instance MovieClip arguments (null unless kind is movieclip) */
    mode: string | null;
    startPosition: number | null;
    loop: number | null;
    /** Index into the symbol's `graphics` table (shape) */
    graphics: number | null;
    /**
     * Sprite / Bitmap content. For an instance of a lib symbol, null when it is
     * the symbol's own (the symbol's definition has it), recorded only when the
     * instance differs from it
     */
    sprite: ISpriteDef | null;
    bitmap: IBitmapDef | null;
    /** Text properties (`TEXT_KEYS`) */
    text: IDataMap | null;
    /** Slot index of the mask */
    mask: number | null;
    /** Slot index of the hit area */
    hitArea: number | null;
    filters: IFilterDef[] | null;
    cache: ICacheDef | null;
    button: IButtonDef | null;
    /**
     * Whether the template's AdobeAn.handleFilterCache is attached as a tick
     * listener (published code attaches it to an instance of a symbol that has
     * a `filterCacheList`; the HTML template does the same for the root)
     */
    filterCacheListener: boolean;
    /**
     * Whether the constructor set `parent` to the owning clip without adding it
     * as a child (published code does this for Text)
     */
    parentSet: boolean;
}
export interface IMemberDef {
    name: string;
    slot: number;
}
export interface ILabelDef {
    label: string;
    position: number;
}
/**
 * MovieClip constructor arguments as resolved on an instance.
 */
export interface IInstanceArgsDef {
    mode: string;
    startPosition: number;
    loop: number;
}
interface ISymbolBaseDef {
    /**
     * The key of the symbol in the published `lib` (used as is, including
     * non-ASCII names). Symbols that are not in `lib` (a bare createjs.MovieClip
     * created inside a constructor, or a class the content never registered)
     * get an id starting with `#`.
     */
    id: string;
    nominalBounds: IRectDef | null;
    frameBounds: IRectDef[] | null;
}
export interface IMovieClipSymbolDef extends ISymbolBaseDef {
    kind: 'movieclip';
    /** The resolved arguments when the symbol is constructed with none (null for symbols not in `lib`) */
    defaults: IInstanceArgsDef | null;
    labels: ILabelDef[];
    duration: number;
    /** Every display object an instance owns: members, children, tween and state targets, masks, hit areas */
    slots: ISlotDef[];
    members: IMemberDef[];
    /** Slots added as children without being driven by the timeline */
    unmanaged: number[];
    /** In timeline order (the order decides stacking) */
    tweens: ITweenDef[];
    /** Every Graphics an instance owns (referenced by shape slots and tween values) */
    graphics: IGraphicsDef[];
    /**
     * The `filterCacheList` the symbol's constructor sets on the instance itself
     * (null if it sets none). It takes effect only while AdobeAn.handleFilterCache
     * is attached to the instance as a tick listener, which whoever creates the
     * instance does (see ISlotDef.filterCacheListener)
     */
    filterCacheList: IFilterCacheEntryDef[] | null;
}
export interface ISpriteSymbolDef extends ISymbolBaseDef {
    kind: 'sprite';
    sprite: ISpriteDef;
}
export interface IBitmapSymbolDef extends ISymbolBaseDef {
    kind: 'bitmap';
    bitmap: IBitmapDef;
}
export type TSymbolDef = IMovieClipSymbolDef | ISpriteSymbolDef | IBitmapSymbolDef;
export interface ISpriteSheetDef {
    name: string;
    /** As published in `lib.ssMetadata` (`[x, y, width, height, ...]` per frame) */
    frames: TDataValue[];
}
export interface IManifestEntryDef {
    id: string;
    src: string;
}
export interface IIssue {
    symbol: string;
    slot: number | null;
    message: string;
}
/**
 * Published content has no root of its own: the HTML template merely
 * instantiates one of the symbols. Every symbol in `lib` is extracted on an
 * equal footing; which one to use as a root is up to the consumer.
 */
export interface IDefinition {
    /**
     * The version of animate-data-converter that extracted the definition. What
     * reads a definition tells by it whether it can (a version it does not
     * read, or one newer than it knows of, which may hold what it leaves out)
     */
    converterVersion: string;
    /** Primitive entries of the published `lib.properties` (width, height, fps, ...) */
    properties: IPropMapDef;
    /** `lib.properties.manifest`: the images and sounds the content loads */
    manifest: IManifestEntryDef[];
    /** `lib.ssMetadata` */
    spriteSheets: ISpriteSheetDef[];
    symbols: {
        [id: string]: TSymbolDef;
    };
    /** Features found in the content that this version cannot represent */
    issues: IIssue[];
}
export {};
