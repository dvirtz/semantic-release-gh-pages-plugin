/** @module semantic-release-gh-pages-plugin */

import gitParse from 'git-url-parse'
import { castArray, get, omit } from 'lodash'
import readPkg from 'read-pkg'
import request from 'sync-request'
import { IGhpagesPluginConfig, TAnyMap, TContext } from './interface'
import { catchToSmth } from './util'
import {
  DEFAULT_BRANCH,
  DEFAULT_DST,
  DEFAULT_MSG,
  DEFAULT_SRC,
  PLUGIN_PATH,
  DEFAULT_ENTERPRISE
} from './defaults'

export {
  DEFAULT_BRANCH,
  DEFAULT_SRC,
  DEFAULT_MSG,
  DEFAULT_DST,
  DEFAULT_ENTERPRISE,
  PLUGIN_PATH
}

const gitUrlParse = catchToSmth(gitParse, {})

export const GITIO_REPO_PATTERN = /^https:\/\/git\.io\/[A-Za-z0-9-]+$/

/**
 * @private
 */
export const extractRepoName = (repoUrl: string): string => {
  return gitUrlParse(repoUrl).full_name
}

/**
 * @private
 */
export const extractRepoDomain = (repoUrl: string): string => {
  return gitUrlParse(repoUrl).resource
}

/**
 * @private
 */
export const extractRepoToken = (repoUrl: string): string => {
  const repo = gitUrlParse(repoUrl)
  return repo.token || repo.user
}

/**
 * @private
 */
export const getRepoUrl = (pluginConfig: TAnyMap, context: TContext): string => {
  const { env } = context
  const urlFromEnv = env.GH_URL || env.GITHUB_URL || env.REPO_URL
  const urlFromStepOpts = pluginConfig.repositoryUrl
  const urlFromOpts = get(context, 'options.repositoryUrl')
  const urlFromPackage = getUrlFromPackage()

  const url = urlFromEnv || urlFromStepOpts || urlFromOpts || urlFromPackage

  if (GITIO_REPO_PATTERN.test(url)) {
    const res: any = request('GET', urlFromOpts, { followRedirects: false, timeout: 5000 })
    return res.headers.location
  }

  return url
}

/**
 * @private
 */
export const getUrlFromPackage = () => {
  const pkg = readPkg.sync()
  return get(pkg, 'repository.url') || get(pkg, 'repository', '')
}

/**
 * @private
 */
export const getToken = (env: TAnyMap, repoUrl: string) => env.GH_TOKEN || env.GITHUB_TOKEN || extractRepoToken(repoUrl)

/**
 * @private
 */
export const getRepo = (pluginConfig: TAnyMap, context: TContext, enterprise?: boolean): string | undefined => {
  const { env, logger } = context
  const repoUrl = getRepoUrl(pluginConfig, context)
  const repoName = extractRepoName(repoUrl)
  const repoDomain = extractRepoDomain(repoUrl)
  const token = getToken(env, repoUrl)

  if (process.env.DEBUG) {
    logger.log('getRepo:')
    logger.log('repoUrl=', repoUrl)
    logger.log('repoName=', repoName)
    logger.log('repoDomain=', repoDomain)
    logger.log('has token=', !!token)
    logger.log('enterprise=', enterprise)
  }

  if (repoDomain !== 'github.com' && !enterprise) {
    return
  }

  return repoName && `https://${token}@${repoDomain}/${repoName}.git`
}

/**
 * @private
 */
export const resolveConfig = (pluginConfig: TAnyMap, context: TContext, path = PLUGIN_PATH, step?: string): IGhpagesPluginConfig => {
  const { env, logger } = context
  const opts = resolveOptions(pluginConfig, context, path, step)
  const enterprise = Boolean(opts.enterprise || pluginConfig.enterprise || DEFAULT_ENTERPRISE)
  const repo = getRepo(pluginConfig, context, enterprise)
  const repoUrl = getRepoUrl(pluginConfig, context)
  const token = getToken(env, repoUrl)

  if (process.env.DEBUG) {
    logger.log('resolveConfig args:')
    logger.log('context=', JSON.stringify(omit(context, 'env.GH_TOKEN', 'env.GITHUB_TOKEN'), null, 2))
    logger.log('pluginConfig=', JSON.stringify(pluginConfig, null, 2))
    logger.log('path=', path)
    logger.log('step=', step)
  }

  return {
    src: opts.src || DEFAULT_SRC,
    dst: opts.dst || DEFAULT_DST,
    msg: opts.msg || DEFAULT_MSG,
    branch: opts.branch || DEFAULT_BRANCH,
    enterprise,
    token,
    repo
  }
}

/**
 * @private
 */
export const resolveOptions = (pluginConfig: TAnyMap, context: TContext, path = PLUGIN_PATH, step?: string): TAnyMap => {
  const { options } = context
  const base = omit(pluginConfig, 'branch')
  const extra = step && options[step] && castArray(options[step])
    .map(config => {
      if (Array.isArray(config)) {
        const [path, opts] = config

        return { ...opts, path }
      }

      return config
    })
    .find(config => get(config, 'path') === path) || {}

  return { ...base, ...extra }
}
