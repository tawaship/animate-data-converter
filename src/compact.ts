import {
	IDefinition, IExpandedDefinition, IMovieClipSymbolDef, ICompactMovieClipSymbolDef, ISlotDef, ITweenDef, ICompactTweenDef,
	IGraphicsDef, IGraphicsCommandDef, IGraphicsDataDef, IStateEntryDef, IDataMap, TDataValue, TFrameValue, TCompactFrameValue,
	TCommandKindDef, TSlotTemplateDef, TSlotRefDef, TSymbolDef, TCompactSymbolDef
} from './types';

/** The values of a slot's fields that a slot template leaves out */
export const SLOT_DEFAULTS: Omit<ISlotDef, 'kind' | 'init'> = {
	symbol: null, mode: null, startPosition: null, loop: null, graphics: null, sprite: null, bitmap: null, text: null,
	mask: null, hitArea: null, filters: null, cache: null, button: null, filterCacheListener: false, parentSet: false
};

/** A table of values written once each, identical ones (compared by a key) sharing one index */
class Table<T> {
	readonly list: T[] = [];
	private readonly _indexes = new Map<string, number>();

	add(value: T, key: string): number {
		const known = this._indexes.get(key);
		if (known !== undefined) {
			return known;
		}
		this.list.push(value);
		this._indexes.set(key, this.list.length - 1);
		return this.list.length - 1;
	}
}

/**
 * Writes every value of an expanded definition once: drawings in one table for
 * the content (identical ones merged, each command by the index of its kind),
 * slots as templates and initial values, and each tween's distinct values with
 * the index of the values of every position. Nothing is left out: `expand`
 * gives the expanded definition back.
 */
export function compact(definition: IExpandedDefinition): IDefinition {
	const graphics = new Table<IGraphicsDef>();
	const templates = new Table<TSlotTemplateDef>();
	const symbols: { [id: string]: TCompactSymbolDef } = {};
	Object.keys(definition.symbols).forEach(id => {
		const symbol = definition.symbols[id];
		symbols[id] = symbol.kind === 'movieclip' ? compactMovieClip(symbol, graphics, templates) : symbol;
	});
	const written = writtenGraphics(graphics.list);
	return {
		converterVersion: definition.converterVersion,
		form: 'compact',
		properties: definition.properties,
		manifest: definition.manifest,
		spriteSheets: definition.spriteSheets,
		graphics: written.graphics,
		commandKinds: written.commandKinds,
		slotTemplates: templates.list,
		symbols,
		issues: definition.issues
	};
}

function compactMovieClip(def: IMovieClipSymbolDef, graphics: Table<IGraphicsDef>, templates: Table<TSlotTemplateDef>): ICompactMovieClipSymbolDef {
	return Object.assign({}, def, {
		slots: def.slots.map((slot): TSlotRefDef => {
			const template = slotTemplate(slot);
			const index = templates.add(template, JSON.stringify(template));
			return Object.keys(slot.init).length ? [index, slot.init] : index;
		}),
		graphics: def.graphics.map(g => graphics.add(g, JSON.stringify(g.commands))),
		tweens: def.tweens.map(compactTween)
	});
}

/** A slot's template: its kind and the fields not at their defaults, without its initial values */
function slotTemplate(slot: ISlotDef): TSlotTemplateDef {
	const template: TSlotTemplateDef = { kind: slot.kind };
	Object.keys(SLOT_DEFAULTS).forEach(key => {
		const value = Reflect.get(slot, key);
		if (JSON.stringify(value) !== JSON.stringify(Reflect.get(SLOT_DEFAULTS, key))) {
			Reflect.set(template, key, value);
		}
	});
	return template;
}

/**
 * A tween's distinct values and the index of every position's values. In a
 * display list (the `state` prop), an entry that places a slot as it is (no
 * props) is written as the slot's index.
 */
function compactTween(tween: ITweenDef): ICompactTweenDef {
	const state = tween.props.indexOf('state');
	const values = new Table<TCompactFrameValue[]>();
	const frames = tween.frames.map(frame => {
		const row = frame.map((value, i): TCompactFrameValue => {
			if (i !== state || !Array.isArray(value)) {
				return value;
			}
			return value.map(entry => entry.target.type === 'slot' && entry.props === null ? entry.target.slot : entry);
		});
		return values.add(row, JSON.stringify(row));
	});
	return Object.assign({}, tween, { values: values.list, frames });
}

/** The drawings with each command as the index of its kind (its type and the names of its props) and its props' values */
function writtenGraphics(list: IGraphicsDef[]): { graphics: IGraphicsDataDef[]; commandKinds: TCommandKindDef[] } {
	const kinds = new Table<TCommandKindDef>();
	const graphics = list.map(def => ({
		commands: def.commands.map(command => {
			const names = Object.keys(command.props);
			const index = kinds.add([command.type, names], JSON.stringify([command.type, names]));
			const written: TDataValue[] = [index];
			return written.concat(names.map(name => command.props[name]));
		})
	}));
	return { graphics, commandKinds: kinds.list };
}

/**
 * The expanded form of a definition: each slot whole, each tween's values at
 * every position, and each symbol's drawings in the symbol. It is the
 * definition `compact` was given, value for value.
 */
export function expand(definition: IDefinition): IExpandedDefinition {
	const drawings = definition.graphics.map(g => ({ commands: commandsOf(definition.commandKinds, g) }));
	const symbols: { [id: string]: TSymbolDef } = {};
	Object.keys(definition.symbols).forEach(id => {
		const symbol = definition.symbols[id];
		symbols[id] = symbol.kind === 'movieclip' ? expandMovieClip(symbol, definition.slotTemplates, drawings) : symbol;
	});
	return {
		converterVersion: definition.converterVersion,
		form: 'expanded',
		properties: definition.properties,
		manifest: definition.manifest,
		spriteSheets: definition.spriteSheets,
		symbols,
		issues: definition.issues
	};
}

function expandMovieClip(def: ICompactMovieClipSymbolDef, templates: TSlotTemplateDef[], drawings: IGraphicsDef[]): IMovieClipSymbolDef {
	return Object.assign({}, def, {
		slots: def.slots.map(ref => slotOf(templates, ref)),
		graphics: def.graphics.map(index => drawings[index]),
		tweens: def.tweens.map(expandTween)
	});
}

/** A slot from its template (the fields it leaves out at their defaults) and its initial values */
function slotOf(templates: TSlotTemplateDef[], ref: TSlotRefDef): ISlotDef {
	const t = templates[typeof ref === 'number' ? ref : ref[0]];
	const d = SLOT_DEFAULTS;
	return {
		kind: t.kind,
		symbol: t.symbol !== undefined ? t.symbol : d.symbol,
		init: typeof ref === 'number' ? {} : ref[1],
		mode: t.mode !== undefined ? t.mode : d.mode,
		startPosition: t.startPosition !== undefined ? t.startPosition : d.startPosition,
		loop: t.loop !== undefined ? t.loop : d.loop,
		graphics: t.graphics !== undefined ? t.graphics : d.graphics,
		sprite: t.sprite !== undefined ? t.sprite : d.sprite,
		bitmap: t.bitmap !== undefined ? t.bitmap : d.bitmap,
		text: t.text !== undefined ? t.text : d.text,
		mask: t.mask !== undefined ? t.mask : d.mask,
		hitArea: t.hitArea !== undefined ? t.hitArea : d.hitArea,
		filters: t.filters !== undefined ? t.filters : d.filters,
		cache: t.cache !== undefined ? t.cache : d.cache,
		button: t.button !== undefined ? t.button : d.button,
		filterCacheListener: t.filterCacheListener !== undefined ? t.filterCacheListener : d.filterCacheListener,
		parentSet: t.parentSet !== undefined ? t.parentSet : d.parentSet
	};
}

/** A tween with the values of every position, its display list entries whole */
function expandTween(tween: ICompactTweenDef): ITweenDef {
	const state = tween.props.indexOf('state');
	const values = tween.values.map(row => row.map((value, i): TFrameValue => {
		if (i === state && Array.isArray(value)) {
			return value.map(stateEntryOf);
		}
		return isFrameValue(value) ? value : null;
	}));
	return {
		target: tween.target,
		duration: tween.duration,
		props: tween.props,
		frames: tween.frames.map(index => values[index]),
		keyframes: tween.keyframes,
		actions: tween.actions
	};
}

function stateEntryOf(entry: IStateEntryDef | number): IStateEntryDef {
	return typeof entry === 'number' ? { target: { type: 'slot', slot: entry }, props: null } : entry;
}

/** Whether a written value is a frame value as it is (all but a display list with slot indexes) */
function isFrameValue(value: TCompactFrameValue): value is TFrameValue {
	return !Array.isArray(value) || value.every(entry => typeof entry !== 'number');
}

/** A drawing's commands from their written form */
function commandsOf(kinds: TCommandKindDef[], graphics: IGraphicsDataDef): IGraphicsCommandDef[] {
	return graphics.commands.map(command => {
		const kind = kinds[typeof command[0] === 'number' ? command[0] : 0];
		const props: IDataMap = {};
		kind[1].forEach((name, i) => {
			props[name] = command[i + 1];
		});
		return { type: kind[0], props };
	});
}
