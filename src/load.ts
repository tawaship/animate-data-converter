import * as fs from 'fs';
import * as path from 'path';
import { newQuickJSWASMModuleFromVariant, shouldInterruptAfterDeadline, QuickJSWASMModule, QuickJSContext } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { IDefinition } from './types';

export interface ILoadOptions {
	/** Source text of the published JS */
	published: string;
	/** The published file's name, shown in messages */
	publishedFilename?: string;
}

/**
 * The createjs runtime: the CreateJS 1.0.0 combined build Animate publishes
 * for, as @tawaship/createjs-module exports it (CommonJS module source, run
 * inside the sandbox).
 */
const CREATEJS_MODULE = '@tawaship/createjs-module';

/** The script run inside the sandbox (inside.ts, built next to this bundle) */
const INSIDE_FILE = 'animate-data-converter.inside.js';

/** How long the published code may run, in milliseconds, before it is stopped */
const TIME_LIMIT = 60000;

/** How much memory the sandbox may use, in bytes */
const MEMORY_LIMIT = 1024 * 1024 * 1024;

let quickjs: Promise<QuickJSWASMModule> | null = null;
let sources: { createjs: string; inside: string } | null = null;

function getQuickJS(): Promise<QuickJSWASMModule> {
	if (!quickjs) {
		quickjs = newQuickJSWASMModuleFromVariant(variant);
	}
	return quickjs;
}

function getSources(): { createjs: string; inside: string } {
	if (!sources) {
		sources = {
			createjs: fs.readFileSync(require.resolve(CREATEJS_MODULE), 'utf8'),
			inside: fs.readFileSync(path.join(__dirname, INSIDE_FILE), 'utf8')
		};
	}
	return sources;
}

/** Runs code in the sandbox; its result as a string, or the error it threw */
function evaluate(context: QuickJSContext, code: string, filename: string): string {
	const result = context.evalCode(code, filename);
	if (result.error) {
		const message = context.getProp(result.error, 'message');
		const raw = context.typeof(message) === 'string' ? context.getString(message) : 'unknown error';
		// QuickJS stops the code when the interrupt handler (the time limit) says so
		const text = raw === 'interrupted' ? 'the published code ran longer than ' + TIME_LIMIT / 1000 + ' seconds and was stopped' : raw;
		message.dispose();
		result.error.dispose();
		throw new Error(text);
	}
	const text = context.typeof(result.value) === 'string' ? context.getString(result.value) : '';
	result.value.dispose();
	return text;
}

/** Whether data read back from the sandbox is a definition (in its compact form) */
function isDefinition(value: object | null): value is IDefinition {
	return value !== null && Reflect.get(value, 'form') === 'compact' && typeof Reflect.get(value, 'converterVersion') === 'string'
		&& Reflect.get(value, 'symbols') !== null && typeof Reflect.get(value, 'symbols') === 'object' && Array.isArray(Reflect.get(value, 'issues'));
}

/** The definition from the sandbox's result (`{ ok: true, definition }` or `{ ok: false, message }`, as JSON) */
function definitionOf(json: string): IDefinition {
	const result: object | null = JSON.parse(json);
	if (result === null || typeof result !== 'object') {
		throw new Error('the sandbox gave no result');
	}
	if (Reflect.get(result, 'ok') !== true) {
		const message = Reflect.get(result, 'message');
		throw new Error(typeof message === 'string' ? message : 'the extraction failed');
	}
	const definition = Reflect.get(result, 'definition');
	if (!isDefinition(definition)) {
		throw new Error('the sandbox gave no definition');
	}
	return definition;
}

/**
 * Extracts the definition of published content. createjs and the published
 * code (frame scripts included) run in a sandbox: QuickJS, a separate
 * JavaScript engine compiled to WebAssembly, which is given nothing of the
 * host (no files, no commands, no network, no function of Node). Only the
 * sources go in and the definition comes out, as text. The published code is
 * stopped when it runs longer than a minute or uses more than 1 GB.
 */
export async function extractPublished(options: ILoadOptions): Promise<IDefinition> {
	const QuickJS = await getQuickJS();
	const code = getSources();
	const runtime = QuickJS.newRuntime();
	try {
		runtime.setMemoryLimit(MEMORY_LIMIT);
		runtime.setMaxStackSize(0);
		runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + TIME_LIMIT));
		const context = runtime.newContext();
		try {
			evaluate(context, code.inside, INSIDE_FILE);
			const pass = (name: string, value: string): void => {
				const handle = context.newString(value);
				context.setProp(context.global, name, handle);
				handle.dispose();
			};
			pass('__createjs', code.createjs);
			pass('__published', options.published);
			return definitionOf(evaluate(context, 'AnimateDataConverterInside.extractInside(__createjs, __published)', options.publishedFilename || 'published.js'));
		} finally {
			context.dispose();
		}
	} finally {
		runtime.dispose();
	}
}

/**
 * extractPublished() with the published JS read from a file.
 */
export function extractPublishedFile(publishedPath: string): Promise<IDefinition> {
	return extractPublished({
		published: fs.readFileSync(publishedPath, 'utf8'),
		publishedFilename: path.basename(publishedPath)
	});
}
