import * as fs from 'fs';
import { extractPublishedFile } from './load';
import { expand } from './compact';
import { IDefinition } from './types';

const USAGE = [
	'Usage: animate-data-converter <published.js> [--out <file.json>] [--pretty] [--expanded] [--force]',
	'',
	'  <published.js>          the JavaScript file Animate published for HTML5 Canvas',
	'  --out <file>            where to write the definition (standard output when omitted)',
	'  --pretty                indent the JSON',
	'  --expanded              write the expanded definition (every value as it is) instead of the compact one',
	'  --force                 write the definition even when the content uses unsupported features'
].join('\n');

export interface ICliIO {
	stdout(text: string): void;
	stderr(text: string): void;
}

interface ICliArgs {
	published: string | null;
	out: string | null;
	pretty: boolean;
	expanded: boolean;
	force: boolean;
}

function parseArgs(args: string[]): ICliArgs | string {
	const parsed: ICliArgs = { published: null, out: null, pretty: false, expanded: false, force: false };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--out') {
			const value = args[++i];
			if (value === undefined) {
				return arg + ' needs a file';
			}
			parsed.out = value;
		} else if (arg === '--pretty') {
			parsed.pretty = true;
		} else if (arg === '--expanded') {
			parsed.expanded = true;
		} else if (arg === '--force') {
			parsed.force = true;
		} else if (arg.indexOf('--') === 0 || parsed.published !== null) {
			return 'unexpected argument: ' + arg;
		} else {
			parsed.published = arg;
		}
	}

	if (parsed.published === null) {
		return 'no published file given';
	}
	return parsed;
}

/**
 * The command line tool. Returns the exit code: 0 when the definition was
 * written, 1 when the content uses features this version cannot represent
 * (they are listed, and nothing is written unless --force is given), 2 for
 * usage and loading errors.
 */
export async function runCli(args: string[], io: ICliIO): Promise<number> {
	const parsed = parseArgs(args);
	if (typeof parsed === 'string') {
		io.stderr(parsed + '\n\n' + USAGE + '\n');
		return 2;
	}

	let definition: IDefinition;
	try {
		definition = await extractPublishedFile(parsed.published || '');
	} catch (e) {
		io.stderr('could not load ' + parsed.published + ': ' + (e instanceof Error ? e.message : String(e)) + '\n');
		return 2;
	}

	definition.issues.forEach(issue => {
		io.stderr('unsupported: ' + (issue.symbol ? issue.symbol : '(content)') + (issue.slot !== null ? ' slot ' + issue.slot : '') + ': ' + issue.message + '\n');
	});
	if (definition.issues.length && !parsed.force) {
		io.stderr(definition.issues.length + ' unsupported feature(s); nothing written (use --force to write anyway)\n');
		return 1;
	}

	const json = JSON.stringify(parsed.expanded ? expand(definition) : definition, null, parsed.pretty ? '\t' : undefined) + '\n';
	if (parsed.out) {
		fs.writeFileSync(parsed.out, json);
	} else {
		io.stdout(json);
	}
	return definition.issues.length ? 1 : 0;
}
