/** Independent strict contract checks owned by GPT lead. */
import {describe,expect,it} from 'vitest'
import {validateDDSSessionState,getStoredToken} from '@/lib/dds-cycle'
const incoming={connection:'Установлено',phones:{aon:'000',provided:'000',onSite:''},incident:{number:'1',savedAt:'now',operator:'112'},caller:{name:'Учебный',role:'очевидец',address:'Адрес'},description:'Авария',statuses:{injured:'нет',ambulanceRefusal:'нет',blocked:'нет'},emergency:{cs:false,cp:false},classification:{section:'ЖКХ',title:'Вода',class:'Авария',visClass:''},services:[{id:'water',name:'Аварийная служба',time:'10:00',status:'Получена службой',isRejected:false,history:[]}]}
const state=()=>({session_id:'s1',lesson_id:'l1',card_id:'c1',ticket_id:'t1',session_status:'ACTIVE',lesson_status:'ACTIVE',incoming_card:incoming,actions:[],submitted_at:null,score:null})
describe('DDS server payload validation',()=>{
 it.each([false,true,'70',-1,101,Infinity,NaN,{}])('rejects invalid score %s',score=>{
  expect(()=>validateDDSSessionState({...state(),score},'s1','t1')).toThrow()
 })
 it('preserves zero and fractional scores',()=>{
  for(const score of [0,71.5])expect(validateDDSSessionState({...state(),score},'s1','t1').score).toBe(score)
 })
 it.each(['phones','incident','caller','statuses','emergency','classification'])('rejects missing panel %s',panel=>{
  expect(()=>validateDDSSessionState({...state(),incoming_card:{...incoming,[panel]:null}},'s1','t1')).toThrow()
 })
 it('does not accept missing ticket identity when one was selected',()=>{
  expect(()=>validateDDSSessionState({...state(),ticket_id:null},'s1','t1')).toThrow()
 })
 it('rejects malformed action collection',()=>{
  expect(()=>validateDDSSessionState({...state(),actions:{}},'s1','t1')).toThrow()
 })
 it('uses the existing jwt_token alias',()=>{
  localStorage.clear();localStorage.setItem('jwt_token','a06-jwt-alias')
  expect(getStoredToken()).toBe('a06-jwt-alias');localStorage.clear()
 })
})
