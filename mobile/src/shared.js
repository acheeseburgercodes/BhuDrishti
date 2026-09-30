// Single import point for shared contracts so screens don't depend on relative depth.
export { OfflineQueue, computeBackoff, isPermanentStatus } from '../../shared/src/queue.js'
export { validateTelemetry, makeClientEventId, describeSource, LANGUAGES } from '../../shared/src/contracts.js'
export { freshnessState, formatAge } from '../../shared/src/freshness.js'
export { computeCoverage } from '../../shared/src/coverage.js'
export { makeT, translate } from '../../shared/src/i18n.js'
export const coverageModel = require('../../shared/fixtures/coverage-model.json')
