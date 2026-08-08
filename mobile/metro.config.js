// Metro inside an npm workspace.
//
// npm hoists most dependencies to the repo root, so a default Metro config — which only
// watches `mobile/` and only resolves `mobile/node_modules` — fails to find react-native
// and every hoisted Expo module. Two changes fix it:
//
//   watchFolders     so Metro watches (and can read) files above mobile/
//   nodeModulesPaths so resolution falls through mobile/node_modules -> root node_modules
//
// See mobile/README.md, "Monorepo note".
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Without this, a package hoisted to the root that also exists in mobile/node_modules can be
// loaded twice — two copies of React is the classic symptom ("invalid hook call").
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
