module.exports = {

  env: {
    node: true,
    mocha: true,
    es6: true,
  },

  parser: '@typescript-eslint/parser',

  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'module',
  },
	
	plugins: [
    "@typescript-eslint"
  ],

  // The Rules (Keep them sorted)
	extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],

  rules: {
    'comma-spacing': 'error',
    'indent': ['error', 2],
    'no-console': 'off',
    'no-multi-spaces': 'error',
    'no-trailing-spaces': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'semi': 'error',
    'space-before-function-paren': ['error', {
      'anonymous': 'never',
      'asyncArrow': 'always',
      'named': 'never',
    }],
  },

};
