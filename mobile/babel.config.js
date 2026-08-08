module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    // babel-preset-expo already includes the Expo Router plugin on SDK 50+.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
  };
};
