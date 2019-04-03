/**
 * @module versioning
 */
const Ajv = require('ajv')
const fsDefault = require('fs')
const pathDefault = require('path')
const yamlDefault = require('js-yaml')
const rimrafDefault = require('rimraf')
const npm = require('../npm')

const ajv = new Ajv()

class UpdatePreconditionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UpdatePreconditionError'
  }
}

class UpdateConflictError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UpdateConflictError'
  }
}

const impl = (
  fs = fsDefault,
  path = pathDefault,
  yaml = yamlDefault,
  rimraf = rimrafDefault // eslint-disable-line comma-dangle
) => (localAssetsPath) => {
  const inst = {
    readAssetsVersionFromInfoFile: (slsArtInfoFilePath) => {
      const slsArtInfoYaml = fs.readFileSync(slsArtInfoFilePath)
      const slsArtInfo = yaml.safeLoad(slsArtInfoYaml)
      return slsArtInfo.version
    },

    readAssetsVersion: () => {
      const slsArtInfoFilePath = path.join(localAssetsPath, '.slsart')
      const infoFileExists = fs.existsSync(slsArtInfoFilePath)
      return infoFileExists
        ? inst.readAssetsVersionFromInfoFile(slsArtInfoFilePath)
        : '0.0.0'
    },

    checkForAnyMissingServiceFiles: listOfFiles =>
      listOfFiles.reduce((missingFiles, assetFile) => {
        const assetFilePath = path.join(localAssetsPath, assetFile)
        const assetFileIsMissing = !fs.existsSync(assetFilePath)
        if (assetFileIsMissing) {
          missingFiles.push(assetFilePath)
        }
        return missingFiles
      }, []),

    throwForAnyMissingFiles: (missingFiles) => {
      const anyServiceFilesMissing = missingFiles.length > 0
      if (anyServiceFilesMissing) {
        const missingFileList = missingFiles.join(', ')
        throw new UpdatePreconditionError(`Missing asset files: ${missingFileList}`)
      }
    },

    checkForServiceFiles: (listOfFiles) => {
      const missingFiles = inst.checkForAnyMissingServiceFiles(listOfFiles)
      inst.throwForAnyMissingFiles(missingFiles)
    },

    checkAllProjectDependencies: (necessaryDependencies, dependencies) =>
      Object.keys(necessaryDependencies).reduce((missingDependencies, packageName) => {
        const packageIsMissing = dependencies[packageName] === undefined
        if (packageIsMissing) {
          missingDependencies.push(packageName)
        }
        return missingDependencies
      }, []),

    checkAllProjectDependencyVersions: (necessaryDependencies, dependencies) =>
      Object.keys(necessaryDependencies).reduce((mismatchedDependencies, packageName) => {
        const invalidPackageVersion = dependencies[packageName] !== necessaryDependencies[packageName]
        if (invalidPackageVersion) {
          mismatchedDependencies.push({
            package: packageName,
            actual: dependencies[packageName],
            expected: necessaryDependencies[packageName],
          })
        }
        return mismatchedDependencies
      }, []),

    throwIfAnyDependencyMissing: (missingDependency) => {
      const anyPackagesAreMissing = missingDependency.length > 0
      if (anyPackagesAreMissing) {
        const missingPackageList = missingDependency.join(', ')
        throw new UpdatePreconditionError(`Missing package.json dependency: ${missingPackageList}`)
      }
    },

    throwIfAnyDependencyVersionsMismatch: (invalidDependencyVersion) => {
      const anyPackagesAreIncorrectVersion = invalidDependencyVersion.length > 0

      if (anyPackagesAreIncorrectVersion) {
        const formatPackageVersionError = invalidPackageInfo =>
          `${invalidPackageInfo.package} expected ${invalidPackageInfo.expected} found ${invalidPackageInfo.actual}`

        const reducePackageVersionError = (errors, invalidVersionMessage) => `${errors}\t${invalidVersionMessage}\n`

        const specificVersionErrors =
          invalidDependencyVersion
            .map(formatPackageVersionError)
            .reduce(reducePackageVersionError, '')

        throw new UpdatePreconditionError(`Invalid package.json dependency package version found:\n${specificVersionErrors}`)
      }
    },

    loadLocalAssetsProjectDependencies: () => {
      const packagePath = path.join(localAssetsPath, 'package.json')
      const packageJSON = fs.readFileSync(packagePath, 'utf8')
      const packageObj = JSON.parse(packageJSON)
      return packageObj.dependencies
    },

    checkForProjectDependencies: (necessaryDependencies) => {
      // Check the package.json dependencies for upgrade
      const dependencies = inst.loadLocalAssetsProjectDependencies()

      const missingDependenciesList = inst.checkAllProjectDependencies(necessaryDependencies, dependencies)
      inst.throwIfAnyDependencyMissing(missingDependenciesList)

      const versionMismatchDependenciesList = inst.checkAllProjectDependencyVersions(necessaryDependencies, dependencies)
      inst.throwIfAnyDependencyVersionsMismatch(versionMismatchDependenciesList)
    },

    loadServiceDefinitionYaml: () => {
      const serverlessPath = path.join(localAssetsPath, 'serverless.yml')
      const serverlessYAML = fs.readFileSync(serverlessPath, 'utf8')
      return serverlessYAML
    },

    loadServiceDefinition: () => {
      const serverlessYAML = inst.loadServiceDefinitionYaml()
      const serverlessObj = yaml.safeLoad(serverlessYAML)
      return serverlessObj
    },

    checkForMinimumRequirements: (minimumServiceSchema, config) => {
      const valid = ajv.validate(minimumServiceSchema, config)
      if (!valid) throw new UpdatePreconditionError(ajv.errorsText())
    },

    checkForConflicts: (conflictingServiceSchema, config) => {
      const valid = ajv.validate(conflictingServiceSchema, config)
      if (!valid) throw new UpdateConflictError(ajv.errorsText())
    },

    validateServiceForUpgrade: (serviceConfig, currentVersion, nextVersion) => {
      inst.checkForServiceFiles(currentVersion.fileManifest())
      inst.checkForProjectDependencies(currentVersion.projectDependencies())
      inst.checkForMinimumRequirements(currentVersion.serviceDefinitionSchema(), serviceConfig)
      inst.checkForConflicts(nextVersion.serviceDefinitionConflictSchema(), serviceConfig)
    },

    cleanProjectFiles: () => {
      process.stdout.write('Cleaning project by deleting node_modules and package-lock.json ...')

      try {
        fs.unlinkSync(path.join(localAssetsPath, 'package-lock.json'))
      } catch (ex) { /* Okay if file does not exist. */ }

      try {
        rimraf.sync(path.join(localAssetsPath, 'node_modules'))
      } catch (ex) { /* Okay if directory does not exist. */ }

      console.log('done.')
    },

    createDirectory: (directory) => {
      try {
        fs.mkdirSync(directory)
      } catch (ex) {
        throw new Error(`Unable to create directory:${directory}. Please remove and try again.`)
      }
    },

    copyOriginalAssetFiles: (currentVersionPlugin) => {
      // Copy the original assets for this version into `original-assets.X.X.X`.
      const originalAssetsDir = `original-assets.${currentVersionPlugin.version}`
      inst.createDirectory(originalAssetsDir)

      currentVersionPlugin
        .fileManifest()
        .forEach(filename =>
          fs.writeFileSync(
            path.join(originalAssetsDir, filename),
            currentVersionPlugin.fileContents(filename)
          )
        )
    },

    copyFileSync: (source, dest) => {
      const data = fs.readFileSync(source)
      fs.writeFileSync(dest, data)
    },

    backupProjectFiles: () => {
      // Copy the current project files into `backup`.
      console.log()
      console.log('Backing up existing project files to `backup` directory ...')

      const backupDir = 'backup'
      inst.createDirectory(backupDir)

      fs.readdirSync('.')
        .forEach((filename) => {
          const stats = fs.statSync(filename)
          const isDirectory = stats.isDirectory()
          if (isDirectory) return

          try {
            const backupFilePath = path.join(backupDir, filename)
            process.stdout.write(`${filename} -> ${backupFilePath}`)
            inst.copyFileSync(filename, backupFilePath)
            console.log(' ✔')
          } catch (ex) {
            console.error('ERROR BACKING UP PROJECT FILES', JSON.stringify(ex, null, 2))
          }
        })

      console.log('Backup complete.')
      console.log()
    },

    upgradeProjectDependencies: (currentVersionPlugin, nextVersionPlugin) => {
      const packagePath = path.join(localAssetsPath, 'package.json')
      const packageJSON = fs.readFileSync(packagePath, 'utf8')
      const packageObj = JSON.parse(packageJSON)
      const { dependencies } = packageObj
      const currentDependencies = currentVersionPlugin.projectDependencies()
      const updatedDependencies = nextVersionPlugin.projectDependencies()

      // Remove current dependencies
      Object.keys(dependencies).forEach((dependency) => {
        if (currentDependencies[dependency]) {
          delete dependencies[dependency]
        }
      })

      // Add updated dependencies
      Object.keys(updatedDependencies).forEach((dependency) => {
        dependencies[dependency] = updatedDependencies[dependency]
      })

      packageObj.dependencies = dependencies
      packageObj.version = currentVersionPlugin.nextVersion

      fs.writeFileSync(packagePath, JSON.stringify(packageObj, null, 2))
    },

    upgradeServiceDefinition: (currentVersionPlugin) => {
      const localServiceDefinition = inst.loadServiceDefinitionYaml()
      const upgradedServiceDefinition = currentVersionPlugin.upgradeServiceDefinition(localServiceDefinition)
      const serverlessPath = path.join(localAssetsPath, 'serverless.yml')
      fs.writeFileSync(serverlessPath, upgradedServiceDefinition)
    },

    upgradeServiceImplementation: (nextVersionPlugin) => {
      // Copy new implementation files *.js into local assets directory.
      nextVersionPlugin
        .fileManifest()
        .filter(name => name.match(/^.*\.js$/))
        .forEach((filename) => {
          const localFilePath = path.join(localAssetsPath, filename)
          fs.writeFileSync(localFilePath, nextVersionPlugin.fileContents(filename))
        })
    },

    loadUpgradePlugin: (version) => {
      const upgradePath = path.join(__dirname, version, 'upgrade.js')
      const upgradeModule = require(upgradePath) // eslint-disable-line global-require, import/no-dynamic-require
      upgradeModule.version = version

      return upgradeModule
    },

    updateInfoFileVersion: (newVersion) => {
      const slsArtInfoFilePath = path.join(localAssetsPath, '.slsart')
      let slsArtInfoYaml
      try {
        slsArtInfoYaml = fs.readFileSync(slsArtInfoFilePath)
      } catch (ex) {
        // Okay if file is not there. Will be soon.
        slsArtInfoYaml = 'version: none'
      }
      const slsArtInfo = yaml.safeLoad(slsArtInfoYaml)
      slsArtInfo.version = newVersion
      const slsArtInfoYamlUpdated = yaml.safeDump(slsArtInfo)
      fs.writeFileSync(slsArtInfoFilePath, slsArtInfoYamlUpdated)
    },

    upgradeServiceOneVersion: (currentVersionPlugin, nextVersionPlugin) => {
      process.stdout.write(`upgrading to version ${currentVersionPlugin.nextVersion} ...`)

      const serviceConfig = inst.loadServiceDefinition()
      inst.validateServiceForUpgrade(serviceConfig, currentVersionPlugin, nextVersionPlugin)
      inst.copyOriginalAssetFiles(currentVersionPlugin)
      inst.upgradeProjectDependencies(currentVersionPlugin, nextVersionPlugin)
      inst.upgradeServiceDefinition(currentVersionPlugin)
      inst.upgradeServiceImplementation(nextVersionPlugin)
      inst.updateInfoFileVersion(currentVersionPlugin.nextVersion)

      console.log('done.')
    },

    installProjectDependencies: () => {
      console.log('Executing `npm install` to provide dependencies to the upgraded project ...')
      npm.install(localAssetsPath)
      console.log('done.')
    },

    loadPluginForCurrentVersion: () => {
      const localVersion = inst.readAssetsVersion()
      const pluginLoader = inst.loadUpgradePlugin(localVersion)
      const currentVersionPlugin = pluginLoader()
      currentVersionPlugin.version = pluginLoader.version
      return currentVersionPlugin
    },

    upgradeAvailable: () => {
      const currentVersionPlugin = inst.loadPluginForCurrentVersion()
      const anUpgradeIsAvailable = currentVersionPlugin.nextVersion !== null
      return anUpgradeIsAvailable
    },

    upgradeService: () => {
      let currentVersionPlugin = inst.loadPluginForCurrentVersion()
      const originalVersion = currentVersionPlugin.version
      let nextVersionPlugin = null

      inst.cleanProjectFiles()
      inst.backupProjectFiles()

      const aValidNextVersionExists = () => currentVersionPlugin.nextVersion !== null
      while (aValidNextVersionExists()) {
        nextVersionPlugin = inst.loadUpgradePlugin(currentVersionPlugin.nextVersion)()
        inst.upgradeServiceOneVersion(currentVersionPlugin, nextVersionPlugin)
        currentVersionPlugin = nextVersionPlugin
      }

      inst.installProjectDependencies()

      return originalVersion
    },
  }

  return inst
}

module.exports = impl
