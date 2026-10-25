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
				typescript()
			]
		}
	];
})();
