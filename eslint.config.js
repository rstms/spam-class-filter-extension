import js from "/usr/local/lib/node_modules/@eslint/js/src/index.js";

export default [
	js.configs.recommended,
	{
		languageOptions: {
			globals: {
				browser: true,
				console: true,
				messenger: true,
				setTimeout: true,
				clearTimeout: true,
			}
		},
		rules: {
			semi: "error",
		}
	}
];
