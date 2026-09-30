// Lets Metro bundle the dependency-free shared contracts in ../shared.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const sharedRoot = path.resolve(projectRoot, '../shared')
const config = getDefaultConfig(projectRoot)

config.watchFolders = [sharedRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]

module.exports = config
