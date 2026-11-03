// Saf hesaplamalar. Karar her zaman sunucudadır; bunlar yalnızca önizleme ve test içindir.
export type InputType = 'BOOLEAN' | 'TIME' | 'NUMBER' | 'DURATION' | 'CHECKLIST' | 'CHOICE3'
export type Status = 'PENDING' | 'PARTIAL' | 'COMPLETED' | 'MISSED_AUTO' | 'MISSED_SELF' | 'EXCUSED'

export function numericXP(maxXP: number, actual: number, target: number): number {
  if (!Number.isInteger(maxXP) || maxXP < 1 || maxXP > 20) throw new Error('INVALID_XP')
  if (!Number.isInteger(actual) || !Number.isInteger(target) || actual < 0 || target <= 0) throw new Error('INVALID_VALUE')
  if (actual > target * 10) throw new Error('VALUE_TOO_LARGE')
  return Math.floor((maxXP * Math.min(actual, target)) / target)
}

export function checklistXP(maxXP: number, done: number, total: number): number {
  if (total <= 0) throw new Error('EMPTY_LIST')
  return Math.floor((maxXP * Math.min(done, total)) / total)
}

export function choice3XP(maxXP: number, value: 0 | 1 | 2): number {
  return Math.floor((maxXP * value) / 2)
}

export function timeXP(maxXP: number, minutes: number, targetMinutes: number): number {
  return minutes <= targetMinutes ? maxXP : 0
}

export function levelThreshold(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 50) throw new Error('INVALID_LEVEL')
  return 100 * (level - 1) + (25 * (level - 1) * (level - 2)) / 2
}

export function currentLevel(totalXP: number): number {
  if (!Number.isSafeInteger(totalXP) || totalXP < 0) throw new Error('INVALID_TOTAL_XP')
  let level = 1
  while (level < 50 && totalXP >= levelThreshold(level + 1)) level += 1
  return level
}

export function meetsPercent(gross: number, planned: number, percent: number): boolean {
  return planned > 0 && gross * 100 >= planned * percent
}

/** Görev örneği için önizleme XP'si (sunucudaki bb_instance_xp ile aynı kurallar). */
export function previewXP(type: InputType, maxXP: number, target: number, status: Status, value: number | null, itemValues: boolean[], totalItems: number): number {
  if (status !== 'PARTIAL' && status !== 'COMPLETED') return 0
  switch (type) {
    case 'BOOLEAN': return status === 'COMPLETED' ? maxXP : 0
    case 'TIME': return value !== null && value <= target ? maxXP : 0
    case 'NUMBER':
    case 'DURATION': return value === null ? 0 : Math.floor((maxXP * Math.min(value, target)) / target)
    case 'CHECKLIST': return totalItems === 0 ? 0 : Math.floor((maxXP * itemValues.filter(Boolean).length) / totalItems)
    case 'CHOICE3': return value === null ? 0 : Math.floor((maxXP * Math.min(value, 2)) / 2)
  }
}

/** Sunucunun set_value için türeteceği durum. */
export function statusForValue(type: InputType, target: number, value: number, doneItems = 0, totalItems = 0): Status {
  switch (type) {
    case 'NUMBER':
    case 'DURATION': return value === 0 ? 'MISSED_SELF' : value >= target ? 'COMPLETED' : 'PARTIAL'
    case 'TIME': return value <= target ? 'COMPLETED' : 'PARTIAL'
    case 'CHOICE3': return value === 2 ? 'COMPLETED' : value === 1 ? 'PARTIAL' : 'MISSED_SELF'
    case 'BOOLEAN': return value >= 1 ? 'COMPLETED' : 'MISSED_SELF'
    case 'CHECKLIST': return doneItems === 0 ? 'MISSED_SELF' : doneItems === totalItems ? 'COMPLETED' : 'PARTIAL'
  }
}
