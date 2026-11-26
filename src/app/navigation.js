import { icon } from '../shared/icons.js';

/** Routes and feature visibility are defined in one place. */
export const NAV = Object.freeze([
  {id:'overview',label:'工作總覽',symbol:'dashboard'},
  {id:'attendance',label:'出勤表',symbol:'clock'},
  {id:'entry',label:'填寫日誌',symbol:'pen'},
  {id:'history',label:'歷史紀錄',symbol:'calendar'},
  {id:'insights',label:'統計分析',symbol:'chart'},
  {id:'settings',label:'系統設定',symbol:'settings'},
  {id:'team',label:'管理員控制台',symbol:'users'}
].map(item=>Object.freeze(item)));

export function viewFromHash(hash=''){
 const key=String(hash).replace(/^#\/?/,'');
 return NAV.some(item=>item.id===key)?key:'overview';
}
export function visibleNavigation(isCloud,role){
 return NAV.filter(item=>
   (item.id!=='team'||(isCloud&&role==='admin'))&&
   (item.id!=='settings'||!isCloud||role==='admin'));
}
export function renderNavigationButton(item,activeView,mobile=false){
 const selected=activeView===item.id;
 return `<button type="button" class="nav-link ${selected?'active':''}" data-action="navigate" data-view="${item.id}" aria-current="${selected?'page':'false'}">${icon(item.symbol,mobile?18:19)}<span>${item.label}</span></button>`;
}
