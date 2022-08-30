import path from 'path'
import fs from 'fs'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'
import * as artifact from '@actions/artifact'
import {getConfig} from './config'

async function run(): Promise<void> {
  try {
    const config = await getConfig()

    let args = ['test', '-c']

    if (config.tags && config.tags.length) {
      args = args.concat('-tags', config.tags.join(','))
    }

    core.debug(`args = ${args}`)

    for (const platform of config.platforms) {
      core.debug(`platform = ${platform}`)

      const [osPlatform, osArch] = platform.split('/')

      for (let pkg of config.paths) {
        if (path.basename(pkg) === '...') {
          pkg = path.dirname(pkg)
        }

        const stat = fs.statSync(pkg.toString())
        if (stat.isFile()) {
          pkg = path.dirname(pkg)
        } else if (!stat.isDirectory()) {
          core.error(`path ${pkg} does not exist`)
          return
        }

        core.debug(`pkg = ${pkg}`)
        const binary = path.basename(pkg)

        core.debug(`binary = ${binary}`)

        const env = process.env as {[key: string]: string}
        env['GOOS'] = osPlatform
        env['GOARCH'] = osArch

        core.info(`Compiling ${pkg} to ${binary}`)

        await exec.exec(
          'go',
          args.concat(
            '-o',
            `./.test/${osPlatform}-${osArch}/${binary}.test`,
            pkg
          ),
          {
            env
          }
        )
      }
    }

    for (const platform of config.platforms) {
      core.debug(`platform = ${platform}`)

      const [osPlatform, osArch] = platform.split('/')

      const artifactsGlobber = await glob.create(
        `./.test/${osPlatform}-${osArch}/*`,
        {
          matchDirectories: true,
          implicitDescendants: false
        }
      )
      const artifacts = await artifactsGlobber.glob()
      core.debug(`artifacts = ${artifacts}`)

      for (const artifactPath of artifacts) {
        const filename = path.basename(artifactPath)

        const result = await artifact
          .create()
          .uploadArtifact(
            `${filename}_${osPlatform}_${osArch}`,
            [artifactPath],
            `./.test/${osPlatform}-${osArch}`,
            {
              continueOnError: false,
              retentionDays: 1
            }
          )
        core.info(result.artifactItems.join('\n'))
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
