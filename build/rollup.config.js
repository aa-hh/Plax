import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

const production = process.env.NODE_ENV === 'production';

export default {
  input: 'src/core/app.js',
  output: {
    file: 'dist/app.js',
    format: 'iife',
    name: 'Plax',
    sourcemap: !production
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    postcss({ extract: 'app.css', minimize: production }),
    babel({
      babelHelpers: 'bundled',
      presets: [
        [
          '@babel/preset-env',
          {
            targets: { browsers: ['chrome 53'] },
            modules: false,
            useBuiltIns: false
          }
        ]
      ],
      exclude: 'node_modules/**'
    }),
    copy({
      targets: [
        { src: 'index.html', dest: 'dist' },
        { src: 'early-errors.js', dest: 'dist' },
        { src: 'appinfo.json', dest: 'dist' },
        { src: 'assets/**/*', dest: 'dist/assets' },
        { src: 'node_modules/webostvjs/webOSTV.js', dest: 'dist' }
      ]
    }),
    production && terser({
      compress: { drop_console: false, drop_debugger: false },
      format: { comments: false }
    })
  ].filter(Boolean)
};
