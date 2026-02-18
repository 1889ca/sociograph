/**
 * CI config loader — reads .sociograph.yml and merges with defaults.
 *
 * Schema:
 *   thresholds:
 *     max_stressed:        5     # fail if N+ newly stressed functions
 *     fail_on_new_bridge:  false # fail if any function gains The Bridge
 *   watch_archetypes:            # always highlighted in comments
 *     - The Bridge
 *     - The Boss
 *     - The Crisis Point
 *     - The Workhorse
 */

import { readFileSync, existsSync } from 'fs'
import { load } from 'js-yaml'

const DEFAULTS = {
  thresholds: {
    max_stressed:       5,
    fail_on_new_bridge: false,
  },
  watch_archetypes: [
    'The Bridge',
    'The Boss',
    'The Crisis Point',
    'The Workhorse',
  ],
}

/**
 * @param {string} configPath  Absolute or relative path to .sociograph.yml
 * @returns {typeof DEFAULTS}
 */
export function loadConfig(configPath) {
  if (!configPath || !existsSync(configPath)) return DEFAULTS

  try {
    const raw  = readFileSync(configPath, 'utf8')
    const yaml = load(raw) ?? {}

    return {
      thresholds: {
        ...DEFAULTS.thresholds,
        ...(yaml.thresholds ?? {}),
      },
      watch_archetypes: yaml.watch_archetypes ?? DEFAULTS.watch_archetypes,
    }
  } catch {
    return DEFAULTS
  }
}
