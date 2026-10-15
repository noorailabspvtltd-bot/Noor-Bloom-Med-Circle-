const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
module.exports = defineConfig([expoConfig, { ignores: ['build-auth-native/**', 'build-login-fixed/**', 'build-preview/**', 'build-refined/**', '**/backend-build/**', 'dist/**', 'dist-android/**'] }]);
