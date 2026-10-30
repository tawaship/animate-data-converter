import typescript from '@rollup/plugin-typescript';
import { deleteAsync } from 'del';

const conf = require('./package.json');
const version = conf.version;

const banner = [
	'/*!',
	` * @tawaship/animate-data-converter - v${version}`,
	' * ',
	' * @author tawaship (makazu.mori@gmail.com)',
	' * @license MIT',
	' */',
	''
].join('\n');

// Writes versions from package.json into the sources that hold their placeholders
function versions(values) {
	return {
		name: 'versions',
		transform(code) {
			let result = code;
			Object.keys(values).forEach(key => {
				result = result.split("'" + key + "'").join(JSON.stringify(values[key]));
			});
			return result === code ? null : { code: result, map: null };
		}
	};
}

export default (async () => {
	if (process.env.PROD) {
		await deleteAsync(['./dist/', './types/']);
	}

	return [
		{
			input: 'src/index.ts',
			output: [
				{
					banner,
					file: 'dist/animate-data-converter.cjs.js',
					format: 'cjs',
					sourcemap: true
				}
			],
			external: ['fs', 'path', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync'],
			watch: {
				clearScreen: false
			},
			plugins: [
				typescript(),
				versions({ __PACKAGE_VERSION__: version })
			]
		},
		// What runs inside the sandbox: a plain script that defines AnimateDataConverterInside (no imports, nothing of Node)
		{
			input: 'src/inside.ts',
			output: [
				{
					banner,
					file: 'dist/animate-data-converter.inside.js',
					format: 'iife',
					name: 'AnimateDataConverterInside'
				}
			],
			watch: {
				clearScreen: false
			},
			plugins: [
				typescript({ declaration: false, declarationMap: false }),
				versions({ __PACKAGE_VERSION__: version })
			]
		}
	];
})();
