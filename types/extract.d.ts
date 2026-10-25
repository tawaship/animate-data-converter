import { ICreatejs, IExtractSource } from './createjs';
import { IDefinition } from './types';
/**
 * Extracts the definition of every symbol in a published `lib`.
 *
 * `source.lib` is the library object the published code fills in
 * (`lib.xxx = function ...`), obtained by running the published code with
 * `createjs`. Every display object class in it is constructed once with no
 * arguments, and its timeline is read and evaluated at every integer frame on
 * that throwaway instance.
 *
 * Entries that are not symbols are skipped: non-class values (`properties`,
 * `ssMetadata`), the template's createjs.Stage subclass, and MovieClip-derived
 * helper classes that never initialize a timeline of their own (such as the
 * `AnMovieClip` base class newer Animate versions publish).
 */
export declare function extract(cjs: ICreatejs, source: IExtractSource): IDefinition;
