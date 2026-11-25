export const pad = n => String(n).padStart(2, '0');
export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
export function shiftDate(dateString, delta) {
  const [year, month, day] = dateString.split('-').map(Number);
  return localISODate(new Date(year, month-1, day+delta));
}
export function currentMonth(date = new Date()) { return localISODate(date).slice(0,7); }
export function formatDate(value, weekday = true) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month-1, day);
  if (Number.isNaN(date.getTime())) return value;
  return `${month} 月 ${day} 日${weekday ? ` · ${['週日','週一','週二','週三','週四','週五','週六'][date.getDay()]}` : ''}`;
}
export function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
export function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export function formatHours(hours) { return `${Number(hours || 0).toLocaleString('zh-TW',{ maximumFractionDigits:1 })} h`; }
export function download(name, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvSafe(value) {
  let text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  if (/^[\s]*[=+@\-\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
