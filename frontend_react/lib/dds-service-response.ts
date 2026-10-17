import type {DDSSessionState} from './dds-cycle'

const decisions = new Set(['Принята', 'Не принята', 'Начало реагирования', 'Прибытие', 'Проведение работ',
  'Работы завершены', 'Отказ от выполнения работ', 'В пути', 'Прибыли', 'Завершена', 'Отказ', 'Завершение работ без бригады'])

/** The acceptance deadline belongs to a service, not to its later work stages. */
export function getDDSServiceResponse(state: DDSSessionState, name: string, now: number) {
  const service = state.incoming_card.services.find(item => item.name === name)
  const response = state.actions.find(action => action.service_name === name && action.kind === 'status' && decisions.has(action.status || ''))
  const responded = Boolean(response || decisions.has(service?.status || ''))
  const start = state.started_at ? Date.parse(state.started_at) : NaN
  const remaining = Number.isFinite(start) ? Math.max(0, Math.min(30, 30 - Math.floor((now - start) / 1000))) : null
  return {responded, remaining: responded ? null : remaining, overdue: !responded && remaining === 0}
}
