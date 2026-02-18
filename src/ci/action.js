#!/usr/bin/env node
/**
 * Sociograph GitHub Action entrypoint.
 *
 * Reads GitHub Action inputs from env vars, runs a diff between two refs,
 * evaluates thresholds, and posts (or updates) a PR comment.
 *
 * Expected env vars (set by action.yml):
 *   INPUT_TOKEN              - GitHub token
 *   INPUT_BASE_REF           - base git ref / SHA
 *   INPUT_HEAD_REF           - head git ref / SHA  (default: HEAD)
 *   INPUT_WORKING_DIRECTORY  - path to analyze     (default: .)
 *   INPUT_CONFIG_PATH        - path to .sociograph.yml
 *   INPUT_FAIL_ON_VIOLATIONS - "true"|"false"      (default: true)
 *
 * Standard GitHub Actions env vars (supplied automatically by the runner):
 *   GITHUB_REPOSITORY   - "owner/repo"
 *   GITHUB_EVENT_PATH   - path to the event JSON file
 *   GITHUB_OUTPUT       - path to the step-output file
 */

import { resolve }     from 'path'
import { readFileSync, appendFileSync } from 'fs'

// ── Inputs ────────────────────────────────────────────────────────────────────

const token          = process.env.INPUT_TOKEN || process.env.GITHUB_TOKEN || ''
const baseRef        = process.env.INPUT_BASE_REF        || ''
const headRef        = process.env.INPUT_HEAD_REF        || 'HEAD'
const workingDir     = process.env.INPUT_WORKING_DIRECTORY || '.'
const configPath     = process.env.INPUT_CONFIG_PATH     || '.sociograph.yml'
const failOnViolate  = process.env.INPUT_FAIL_ON_VIOLATIONS !== 'false'

if (!token)   die('INPUT_TOKEN or GITHUB_TOKEN is required')
if (!baseRef) die('INPUT_BASE_REF is required')

// ── GitHub context ────────────────────────────────────────────────────────────

const repository  = process.env.GITHUB_REPOSITORY ?? ''
const [owner, repo] = repository.split('/')
if (!owner || !repo) die(`GITHUB_REPOSITORY is not set or invalid: "${repository}"`)

const eventPath = process.env.GITHUB_EVENT_PATH
if (!eventPath) die('GITHUB_EVENT_PATH is not set')

const event    = JSON.parse(readFileSync(eventPath, 'utf8'))
const prNumber = event.pull_request?.number ?? event.number
if (!prNumber) die('Could not determine PR number from event payload')

// ── Run diff ──────────────────────────────────────────────────────────────────

const { runDiff }              = await import('../diff/diff-runner.js')
const { loadConfig }           = await import('./config.js')
const { evaluate }             = await import('./evaluator.js')
const { formatComment, SENTINEL } = await import('./comment.js')

const range   = `${baseRef}..${headRef}`
const rootDir = resolve(workingDir)

process.stderr.write(`\n🔬 Sociograph — analyzing ${range} in ${rootDir}\n\n`)

const diffResult = await runDiff(rootDir, range, { verbose: true })
const config     = loadConfig(resolve(configPath))
const evaluation = evaluate(diffResult, config)
const body       = formatComment(diffResult, evaluation)

// ── GitHub API ────────────────────────────────────────────────────────────────

const apiBase = `https://api.github.com`
const headers = {
  Authorization:          `Bearer ${token}`,
  'Content-Type':         'application/json',
  Accept:                 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

async function ghFetch(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, { ...options, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API ${options.method ?? 'GET'} ${path} → ${res.status}: ${text}`)
  }
  return res.status === 204 ? null : res.json()
}

// Paginate comments to find an existing sociograph comment
async function findExistingComment() {
  let page = 1
  while (true) {
    const batch = await ghFetch(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`
    )
    if (!batch.length) return null
    const hit = batch.find(c => c.body?.includes(SENTINEL))
    if (hit) return hit
    if (batch.length < 100) return null
    page++
  }
}

const existing = await findExistingComment()

if (existing) {
  await ghFetch(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
    method: 'PATCH',
    body:   JSON.stringify({ body }),
  })
  process.stderr.write(`Updated existing PR comment #${existing.id}\n`)
} else {
  await ghFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    body:   JSON.stringify({ body }),
  })
  process.stderr.write(`Posted new PR comment\n`)
}

// ── Step outputs ──────────────────────────────────────────────────────────────

const outputFile = process.env.GITHUB_OUTPUT
if (outputFile) {
  const { summary } = diffResult
  appendFileSync(outputFile, `passed=${evaluation.passed}\n`)
  appendFileSync(outputFile, `stressed=${summary.stressed}\n`)
  appendFileSync(outputFile, `violations=${evaluation.violations.join('; ')}\n`)
}

// ── Exit ──────────────────────────────────────────────────────────────────────

if (failOnViolate && !evaluation.passed) {
  process.stderr.write(`\n❌ Sociograph: threshold violations\n`)
  for (const v of evaluation.violations) {
    process.stderr.write(`   • ${v}\n`)
  }
  process.exit(1)
}

process.stderr.write(`\n✅ Sociograph: passed\n`)

// ── Utilities ─────────────────────────────────────────────────────────────────

function die(msg) {
  process.stderr.write(`::error::Sociograph: ${msg}\n`)
  process.exit(1)
}
