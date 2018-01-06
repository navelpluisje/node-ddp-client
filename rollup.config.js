import eslint from 'rollup-plugin-eslint';
import flow from 'rollup-plugin-flow';
import replace from 'rollup-plugin-replace';
import strip from 'rollup-plugin-strip';
import resolve from 'rollup-plugin-node-resolve';
import babel from 'rollup-plugin-babel';

const pkg = require('./package.json');

const stringify = string => `'${string}'`;

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/index.js',
    format: 'umd',
    name: 'DDPClient',
  },
  watch: {
    exclude: ['node_modules/**'],
  },
  plugins: [
    eslint({
      throwOnError: true,
    }),
    flow(),
    strip(),
    replace({
      __VERSION_HEADER__: pkg.version,
      __VERSION__: stringify(pkg.version),
    }),
    resolve(),
    babel({
      presets: ['babel-preset-es2015-rollup', 'stage-0'],
      exclude: 'node_modules/**', // only transpile our source code
    }),
  ],
};
