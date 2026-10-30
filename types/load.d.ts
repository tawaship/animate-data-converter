import { IDefinition } from './types';
export interface ILoadOptions {
    /** Source text of the published JS */
    published: string;
    /** The published file's name, shown in messages */
    publishedFilename?: string;
}
/**
 * Extracts the definition of published content. createjs and the published
 * code (frame scripts included) run in a sandbox: QuickJS, a separate
 * JavaScript engine compiled to WebAssembly, which is given nothing of the
 * host (no files, no commands, no network, no function of Node). Only the
 * sources go in and the definition comes out, as text. The published code is
 * stopped when it runs longer than a minute or uses more than 1 GB.
 */
export declare function extractPublished(options: ILoadOptions): Promise<IDefinition>;
/**
 * extractPublished() with the published JS read from a file.
 */
export declare function extractPublishedFile(publishedPath: string): Promise<IDefinition>;
