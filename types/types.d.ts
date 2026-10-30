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
/**
 * A JSON object: property names to JSON values.
 */
export interface IDataMap {
    [key: string]: TDataValue;
}
/**
 * A rectangle, as createjs.Rectangle holds it.
 */
export interface IRectDef {
    /** Left edge */
    x: number;
    /** Top edge */
    y: number;
    /** Width */
    width: number;
    /** Height */
    height: number;
}
/**
 * The kind of a display object an instance owns. `unsupported` is any other
 * display object (it is also listed in `issues`).
 */
export type TDisplayKind = 'movieclip' | 'shape' | 'sprite' | 'bitmap' | 'text' | 'unsupported';
/**
 * What a tween writes to (or what a state entry or a filter cache entry
 * refers to), inside the symbol:
 *
 * - `self`: the instance of the symbol itself (its own `x`, `alpha`, ...)
 * - `slot`: the display object in `slots[slot]`
 * - `filter`: the filter `filters[filter]` of the display object in
 *   `slots[slot]` (color effect tweens write to the ColorFilter itself)
 * - `object`: a plain object that is not displayed. Published content keeps its
 *   display list this way: a tween of `{}` writes `state` (see IStateEntryDef)
 */
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
/**
 * One entry of a display list (createjs's `state` array: `{ t, p }`).
 * The value of a `state` property is the whole display list of the symbol at
 * that frame: the display objects in it, bottom to top. Placing them follows
 * createjs (MovieClip `_addManagedChild`): an object whose `_off` is true is
 * not placed, and an independent MovieClip with `autoReset` that was not on
 * the list on the frame before starts its timeline again.
 */
export interface IStateEntryDef {
    /** The display object on the list (a `slot` target) */
    target: TTargetDef;
    /** Properties set on it as it is placed (the entry's `p`), or null when the entry has none */
    props: IPropMapDef | null;
}
/**
 * A Graphics written by a tween (e.g. a mask outline per keyframe), as an
 * index into the symbol's `graphics` table.
 */
export interface IGraphicsRefDef {
    /** Index into the symbol's `graphics` */
    graphics: number;
}
/**
 * The value of a property at a frame: a number, string, boolean or null as
 * createjs holds it (`rotation` and skews in degrees, `alpha` 0 to 1, colors
 * and blends as strings), a display list (the value of `state`), or a
 * Graphics (the value of `graphics`).
 */
export type TFrameValue = number | string | boolean | null | IStateEntryDef[] | IGraphicsRefDef;
/**
 * Property names to values (initial state, state entry properties, document properties).
 */
export interface IPropMapDef {
    [key: string]: TFrameValue;
}
/**
 * A frame script: a function the timeline calls when it reaches a position.
 */
export interface IActionDef {
    /** Timeline position the action sits on */
    position: number;
    /**
     * Source text of the frame script function, as published
     * (e.g. `function () { this.stop(); }`). Variables it references outside
     * its own body are not carried along.
     */
    source: string;
    /**
     * The arguments it is called with, or null for the default (createjs calls
     * it with the tween itself). `this` is the instance of the symbol
     */
    params: TFrameValue[] | null;
}
/**
 * One tween of a symbol's timeline, evaluated at every integer position.
 */
export interface ITweenDef {
    /** What the tween writes to */
    target: TTargetDef;
    /** Length in frames: the tween has positions 0 to duration */
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
    /** Frame scripts on this tween, in the order they run */
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
    /** The createjs command class name (`createjs.Graphics.<type>`) */
    type: string;
    /** The command's own properties (coordinates, colors, styles, ...) */
    props: IDataMap;
}
/**
 * A Graphics: its drawing commands, in the order they are drawn.
 */
export interface IGraphicsDef {
    /** The commands, as createjs holds them */
    commands: IGraphicsCommandDef[];
}
/**
 * What a Sprite shows: a frame of a sprite sheet.
 */
export interface ISpriteDef {
    /** Sprite sheet name (`lib.ssMetadata[].name`) */
    sheet: string;
    /** Frame index in the sprite sheet */
    frame: number;
    /** Whether the Sprite stays on that frame (published sprites do) */
    paused: boolean;
}
/**
 * What a Bitmap shows: an image of the manifest, or a part of it.
 */
export interface IBitmapDef {
    /** Image id (`lib.properties.manifest[].id`) */
    image: string;
    /** The part of the image shown, or null for the whole image */
    sourceRect: IRectDef | null;
}
/**
 * A filter on a display object (a color effect set in Animate).
 */
export interface IFilterDef {
    /** createjs filter class name. Only ColorFilter is supported */
    type: string;
    /**
     * The filter's values. For ColorFilter: `redMultiplier`, `greenMultiplier`,
     * `blueMultiplier`, `alphaMultiplier` and `redOffset`, `greenOffset`,
     * `blueOffset`, `alphaOffset`
     */
    props: IDataMap;
}
/**
 * A display object's cache (`cache(x, y, width, height, scale)`), which
 * createjs draws it through (filters take effect only on a cached object).
 */
export interface ICacheDef {
    /** Left edge of the cached area, in the object's own coordinates */
    x: number;
    /** Top edge of the cached area */
    y: number;
    /** Width of the cached area */
    width: number;
    /** Height of the cached area */
    height: number;
    /** Scale the cache is drawn at */
    scale: number;
}
/**
 * A createjs.ButtonHelper attached to a slot.
 */
export interface IButtonDef {
    /** Label (or frame) shown when the pointer is out */
    out: string | number;
    /** Label (or frame) shown when the pointer is over */
    over: string | number;
    /** Label (or frame) shown when the pointer is down */
    down: string | number;
    /** Whether the button plays from those labels instead of stopping on them */
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
    /** The display object to cache again */
    instance: TTargetDef;
    /** First frame of the range */
    startFrame: number;
    /** Last frame of the range */
    endFrame: number;
    /** Left edge of the cached area */
    x: number;
    /** Top edge of the cached area */
    y: number;
    /** Width of the cached area */
    w: number;
    /** Height of the cached area */
    h: number;
}
/**
 * A display object an instance of a MovieClip symbol owns. Every instance of
 * the symbol creates one of each, in the order of `slots`; tweens, state
 * entries, masks and members refer to them by index.
 */
export interface ISlotDef {
    /** What it is */
    kind: TDisplayKind;
    /** Symbol id for MovieClip slots, and for Sprite / Bitmap slots that are instances of a lib symbol */
    symbol: string | null;
    /** Constructor-time display properties */
    init: IPropMapDef;
    /**
     * Per-instance MovieClip arguments (null unless kind is movieclip): how its
     * timeline follows its parent's (`independent`, `single` or `synched`, as
     * createjs.MovieClip names them)
     */
    mode: string | null;
    /** The frame its timeline starts from */
    startPosition: number | null;
    /** How it loops, as createjs holds it (`-1` loops for ever, `0` does not loop) */
    loop: number | null;
    /** Index into the symbol's `graphics` table (shape) */
    graphics: number | null;
    /**
     * Sprite / Bitmap content. For an instance of a lib symbol, null when it is
     * the symbol's own (the symbol's definition has it), recorded only when the
     * instance differs from it
     */
    sprite: ISpriteDef | null;
    /** Bitmap content (as `sprite`) */
    bitmap: IBitmapDef | null;
    /** Text properties (`TEXT_KEYS`) */
    text: IDataMap | null;
    /** Slot index of the mask */
    mask: number | null;
    /** Slot index of the hit area */
    hitArea: number | null;
    /** Filters set on it, or null */
    filters: IFilterDef[] | null;
    /** Its cache, or null when it is not cached */
    cache: ICacheDef | null;
    /** The ButtonHelper attached to it, or null */
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
/**
 * A named member of an instance (`this.<name>` set by the constructor: an
 * instance name given in Animate).
 */
export interface IMemberDef {
    /** The property name */
    name: string;
    /** Slot index of the display object it refers to */
    slot: number;
}
/**
 * A frame label of a timeline.
 */
export interface ILabelDef {
    /** The label */
    label: string;
    /** The position it marks */
    position: number;
}
/**
 * MovieClip constructor arguments as resolved on an instance.
 */
export interface IInstanceArgsDef {
    /** `independent`, `single` or `synched` */
    mode: string;
    /** The frame the timeline starts from */
    startPosition: number;
    /** How it loops (`-1` for ever, `0` not) */
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
    /** The bounds published on the symbol (`nominalBounds`), or null */
    nominalBounds: IRectDef | null;
    /** The bounds of each frame (`frameBounds`), or null when not published */
    frameBounds: IRectDef[] | null;
}
/**
 * A MovieClip symbol: the display objects every instance owns and its timeline.
 */
export interface IMovieClipSymbolDef extends ISymbolBaseDef {
    /** The kind of symbol */
    kind: 'movieclip';
    /** The resolved arguments when the symbol is constructed with none (null for symbols not in `lib`) */
    defaults: IInstanceArgsDef | null;
    /** Frame labels of its timeline */
    labels: ILabelDef[];
    /** Length of its timeline in frames */
    duration: number;
    /** Every display object an instance owns: members, children, tween and state targets, masks, hit areas */
    slots: ISlotDef[];
    /** Instance names the constructor sets (`this.<name>`) */
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
/**
 * A Sprite symbol (a frame of a sprite sheet).
 */
export interface ISpriteSymbolDef extends ISymbolBaseDef {
    /** The kind of symbol */
    kind: 'sprite';
    /** What it shows */
    sprite: ISpriteDef;
}
/**
 * A Bitmap symbol (an image of the manifest).
 */
export interface IBitmapSymbolDef extends ISymbolBaseDef {
    /** The kind of symbol */
    kind: 'bitmap';
    /** What it shows */
    bitmap: IBitmapDef;
}
/**
 * A symbol of the published library, told apart by `kind`.
 */
export type TSymbolDef = IMovieClipSymbolDef | ISpriteSymbolDef | IBitmapSymbolDef;
/**
 * A sprite sheet of the published content (`lib.ssMetadata[]`).
 */
export interface ISpriteSheetDef {
    /** Its name, which is also the id of its image in the manifest */
    name: string;
    /** As published in `lib.ssMetadata` (`[x, y, width, height, ...]` per frame) */
    frames: TDataValue[];
}
/**
 * A file the content loads (`lib.properties.manifest[]`).
 */
export interface IManifestEntryDef {
    /** The id published code refers to the file by */
    id: string;
    /** Its path as published (relative to the published HTML, with the query Animate adds) */
    src: string;
}
/**
 * A feature found in the content that this version cannot represent.
 */
export interface IIssue {
    /** Id of the symbol it was found in */
    symbol: string;
    /** Slot index it concerns, or null when it concerns the symbol */
    slot: number | null;
    /** What it is */
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
    /** Every symbol, by its id */
    symbols: {
        [id: string]: TSymbolDef;
    };
    /** Features found in the content that this version cannot represent */
    issues: IIssue[];
}
export {};
