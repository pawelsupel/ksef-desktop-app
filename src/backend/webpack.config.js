const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './src/index.ts',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'backend.bundle.js',
    libraryTarget: 'commonjs2'
  },

  resolve: {
    extensions: ['.ts', '.js'],
    modules: [
      path.resolve(__dirname, 'node_modules'),
      'node_modules'
    ]
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },

  externals: [
    nodeExternals({
      // Bundle everything except native modules
      allowlist: [/.*/]
    }),
    // Explicitly externalize native modules
    /^sqlite3$/,
    /^puppeteer$/
  ],

  optimization: {
    minimize: true
  },

  node: {
    __dirname: false,
    __filename: false
  }
};
