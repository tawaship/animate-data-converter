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
			external: ['fs', 'path', 'vm'],
			watch: {
				clearScreen: false
			},
			plugins: [
				typescript(),
				versions({ __PACKAGE_VERSION__: version })
			]
		}
	];
})();
