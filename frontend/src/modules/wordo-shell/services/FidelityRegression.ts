import type { FidelitySnapshot } from '../types/document'

export interface FidelityRegressionBaseline {
  fixtureId: string
  expectedGrade: FidelitySnapshot['grade']
  minScore: number
  maxWarnings: number
  pageCount: number
  sourceBlockCount: number
  renderedObjectCount: number
  sourceImageCount: number
  renderedImageCount: number
  sourceTableCount: number
  renderedTableCount: number
  sourceTextLength: number
  renderedTextLength: number
}

export interface FidelityRegressionDelta {
  metric: keyof FidelityRegressionBaseline | 'overallScore'
  baseline: number | string
  actual: number | string
}

export interface FidelityRegressionResult {
  fixtureId: string
  status: 'pass' | 'warn' | 'fail'
  deltas: FidelityRegressionDelta[]
  summary: string[]
}

export interface FidelityRegressionTrend {
  averageScore: number
  minScore: number
  passCount: number
  warnCount: number
  failCount: number
}

const GRADE_ORDER: Record<FidelitySnapshot['grade'], number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function approxEqual(actual: number, expected: number, tolerance = 0): boolean {
  return Math.abs(actual - expected) <= tolerance
}

export function compareFidelityToBaseline(
  fixtureId: string,
  snapshot: FidelitySnapshot,
  baseline: FidelityRegressionBaseline,
): FidelityRegressionResult {
  const deltas: FidelityRegressionDelta[] = []
  const summary: string[] = []
  let status: FidelityRegressionResult['status'] = 'pass'

  if (snapshot.overallScore < baseline.minScore) {
    status = 'fail'
    deltas.push({ metric: 'overallScore', baseline: baseline.minScore, actual: snapshot.overallScore })
    summary.push(`score ${snapshot.overallScore.toFixed(3)} < ${baseline.minScore.toFixed(3)}`)
  }

  if (GRADE_ORDER[snapshot.grade] < GRADE_ORDER[baseline.expectedGrade]) {
    status = 'fail'
    deltas.push({ metric: 'expectedGrade', baseline: baseline.expectedGrade, actual: snapshot.grade })
    summary.push(`grade ${snapshot.grade} < ${baseline.expectedGrade}`)
  }

  if (snapshot.warningCount > baseline.maxWarnings) {
    status = status === 'fail' ? 'fail' : 'warn'
    deltas.push({ metric: 'maxWarnings', baseline: baseline.maxWarnings, actual: snapshot.warningCount })
    summary.push(`warnings ${snapshot.warningCount} > ${baseline.maxWarnings}`)
  }

  ;([
    'pageCount',
    'sourceBlockCount',
    'renderedObjectCount',
    'sourceImageCount',
    'renderedImageCount',
    'sourceTableCount',
    'renderedTableCount',
    'sourceTextLength',
    'renderedTextLength',
  ] as const).forEach(metric => {
    const baselineValue = baseline[metric]
    const actualValue = snapshot[metric]
    if (!approxEqual(actualValue, baselineValue)) {
      status = status === 'fail' ? 'fail' : 'warn'
      deltas.push({ metric, baseline: baselineValue, actual: actualValue })
      summary.push(`${metric} ${actualValue} != ${baselineValue}`)
    }
  })

  return {
    fixtureId,
    status,
    deltas,
    summary,
  }
}

export function summarizeFidelityRegression(
  snapshots: Array<{ fixtureId: string; snapshot: FidelitySnapshot }>,
  baselines: Record<string, FidelityRegressionBaseline>,
): FidelityRegressionTrend {
  let totalScore = 0
  let minScore = 1
  let passCount = 0
  let warnCount = 0
  let failCount = 0

  snapshots.forEach(({ fixtureId, snapshot }) => {
    totalScore += snapshot.overallScore
    minScore = Math.min(minScore, snapshot.overallScore)
    const comparison = compareFidelityToBaseline(fixtureId, snapshot, baselines[fixtureId])
    if (comparison.status === 'pass') passCount += 1
    if (comparison.status === 'warn') warnCount += 1
    if (comparison.status === 'fail') failCount += 1
  })

  return {
    averageScore: snapshots.length > 0 ? totalScore / snapshots.length : 0,
    minScore: snapshots.length > 0 ? minScore : 0,
    passCount,
    warnCount,
    failCount,
  }
}
