export interface ICliIO {
    stdout(text: string): void;
    stderr(text: string): void;
}
/**
 * The command line tool. Returns the exit code: 0 when the definition was
 * written, 1 when the content uses features this version cannot represent
 * (they are listed, and nothing is written unless --force is given), 2 for
 * usage and loading errors.
 */
export declare function runCli(args: string[], io: ICliIO): number;
