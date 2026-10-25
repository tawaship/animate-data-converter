import { ICreatejs, IExtractSource, IPropBag } from './createjs';
import { IDefinition } from './types';
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
/**
 * Runs createjs (CreateJS 1.0.0, see CREATEJS_MODULE) and the published code
 * in a fresh vm context and wires up the
 * assets the way the HTML template does, without loading anything: every
 * manifest entry gets a stand-in image (its `src` is the entry's path), and
 * every sprite sheet of `lib.ssMetadata` is built over the manifest image of
 * the same id. MotionGuidePlugin is installed, as the template does for
 * content with motion guides.
 */
export declare function loadPublished(options: ILoadOptions): ILoadedContent;
/**
 * Loads published content (see loadPublished) and extracts its definition.
 */
export declare function extractPublished(options: ILoadOptions): IDefinition;
/**
 * extractPublished() with the published JS read from a file.
 */
export declare function extractPublishedFile(publishedPath: string): IDefinition;
