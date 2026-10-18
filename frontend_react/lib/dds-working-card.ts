import type {DispatcherData} from './dispatcher-data'
import type {DDSSessionState} from './dds-cycle'

/** Project saved trainee actions onto service tiles without changing the incoming 112 card. */
export function getDDSWorkingCard(state: DDSSessionState): DispatcherData {
  return {
    ...state.incoming_card,
    services: state.incoming_card.services.map((service, index) => {
      const working = {
        ...service,
        id: `service-${index}`,
        history: (service.history || []).map(entry => ({...entry, op: entry.op || ''})),
      }
      for (const action of state.actions) {
        if (action.service_name !== service.name) continue
        const time = action.at ? new Date(action.at).toLocaleString('ru-RU') : ''
        if (action.kind === 'status' && action.status) {
          working.status = action.status
          working.time = action.at
            ? new Date(action.at).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})
            : ''
          working.isRejected = ['Не принята', 'Отказ от выполнения работ'].includes(action.status)
        }
        working.history.push({
          op: action.actor_name || '',
          time,
          status: action.kind === 'dispatch' ? 'Направление' : action.status || '',
          orderNumber: action.order_number || undefined,
          comment: action.kind === 'dispatch'
            ? [action.who_accepted, action.summary].filter(Boolean).join(': ')
            : action.comment || undefined,
        })
      }
      return working
    }),
  }
}
