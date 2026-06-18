module.exports = {
  verbose: true,
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // Some of date-holidays' transitive dependencies (e.g. astronomia) ship as
    // ESM. Compile those JS files to CommonJS for the test runner.
    '^.+\\.js$': ['babel-jest', { presets: ['@babel/preset-env'] }],
  },
  // By default Jest does not transform anything under node_modules. Allow the
  // date-holidays dependency chain through so its ESM modules are compiled.
  transformIgnorePatterns: [
    '/node_modules/(?!(date-holidays|date-holidays-parser|date-chinese|date-easter|astronomia)/)',
  ],
  moduleFileExtensions: ['js', 'ts'],
  modulePathIgnorePatterns: ['yarn-cache'],
};
