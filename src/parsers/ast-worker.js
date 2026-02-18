/**
 * AST Worker — runs walkFile in a worker thread.
 *
 * Receives file paths via postMessage, returns parsed results.
 * rootDir is passed once via workerData at startup.
 */

import { parentPort, workerData } from 'worker_threads'
import { walkFile } from './ast-walker.js'

const { rootDir } = workerData

parentPort.on('message', (filePath) => {
  parentPort.postMessage({ filePath, ...walkFile(filePath, rootDir) })
})
