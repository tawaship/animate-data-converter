import { IDefinition, IExpandedDefinition, ISlotDef } from './types';
/** The values of a slot's fields that a slot template leaves out */
export declare const SLOT_DEFAULTS: Omit<ISlotDef, 'kind' | 'init'>;
/**
 * Writes every value of an expanded definition once: drawings in one table for
 * the content (identical ones merged, each command by the index of its kind),
 * slots as templates and initial values, and each tween's distinct values with
 * the index of the values of every position. Nothing is left out: `expand`
 * gives the expanded definition back.
 */
export declare function compact(definition: IExpandedDefinition): IDefinition;
/**
 * The expanded form of a definition: each slot whole, each tween's values at
 * every position, and each symbol's drawings in the symbol. It is the
 * definition `compact` was given, value for value.
 */
export declare function expand(definition: IDefinition): IExpandedDefinition;
