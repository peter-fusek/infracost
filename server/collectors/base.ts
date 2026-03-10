export interface CostRecord {
  platformId: number
  serviceId?: number
  recordDate: Date
  periodStart: Date
  periodEnd: Date
  amount: string
  currency: string
  costType: 'subscription' | 'usage' | 'overage' | 'one_time'
  collectionMethod: 'api' | 'hybrid' | 'manual' | 'csv_import'
  rawData?: Record<string, unknown>
  notes?: string
}

export interface CollectorResult {
  records: CostRecord[]
  errors: string[]
}

export interface BaseCollector {
  platformSlug: string
  collect(periodStart: Date, periodEnd: Date): Promise<CollectorResult>
}

/** Get start and end of current month */
export function getCurrentMonthRange(): { start: Date, end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return { start, end }
}

/** Get day-of-month fraction for EOM estimation */
export function getMonthProgress(): number {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return now.getDate() / daysInMonth
}
