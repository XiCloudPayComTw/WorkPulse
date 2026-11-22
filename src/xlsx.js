/** Tiny XLSX writer: OOXML worksheets + uncompressed ZIP; no network or runtime dependencies. */
const utf8 = text => new TextEncoder().encode(text);
const xml = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const colName = n => {let s='';for(let i=n;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
function worksheet(sheet) {
 const rows=sheet.rows;
 const header=sheet.name!=='統計總覽';
 const widthHints=sheet.name==='工作明細'?[14,18,18,24,16,35,48,38,14,12,36,36]:sheet.name==='統計總覽'?[24,68]:[28,13,14,13,14,14];
 const columns=`<cols>${widthHints.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
 const body=rows.map((row,ri)=>`<row r="${ri+1}"${header&&ri===0?' ht="26" customHeight="1"':''}>${row.map((value,ci)=>{
  const ref=`${colName(ci+1)}${ri+1}`;
  const style=header&&ri===0?' s="1"':'';
  if(typeof value==='number' && Number.isFinite(value))return `<c r="${ref}"${style}><v>${value}</v></c>`;
  // Force inlineStr so user-entered =/+/-/@ text never becomes an Excel formula.
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
 }).join('')}</row>`).join('');
 const freeze=header?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':'';
 const autoFilter=header&&rows.length?`<autoFilter ref="A1:${colName(Math.max(...rows.map(r=>r.length)))}${rows.length}"/>`:'';
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${freeze}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/>${columns}<sheetData>${body}</sheetData>${autoFilter}</worksheet>`;
}

const crcTable = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);return c>>>0;});
function crc32(data){let c=0xFFFFFFFF;for(const b of data)c=(crcTable[(c^b)&255]^(c>>>8))>>>0;return (c^0xFFFFFFFF)>>>0;}
function zip(entries){
 const parts=[];const central=[];let offset=0;
 for(const [name,text] of entries){
  const filename=utf8(name),data=utf8(text),crc=crc32(data);
  const local=new Uint8Array(30+filename.length);const h=new DataView(local.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);
  h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,filename.length,true);local.set(filename,30);
  parts.push(local,data);
  const c=new Uint8Array(46+filename.length);const v=new DataView(c.buffer);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);
  v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);
  v.setUint16(28,filename.length,true);v.setUint32(42,offset,true);c.set(filename,46);central.push(c);
  offset+=local.length+data.length;
 }
 const centralLen=central.reduce((n,x)=>n+x.length,0);
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);
 e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralLen,true);e.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function buildXlsx(sheets){
 if(!Array.isArray(sheets)||!sheets.length||sheets.length>24)throw Error('工作表數量不合法');
 const names=new Set();
 for(const sh of sheets){if(!sh.name||String(sh.name).length>31||/[\\/?*\[\]:]/.test(sh.name)||names.has(sh.name))throw Error('工作表名稱無效或重複');names.add(sh.name);}
 const entries=[
  ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF344D60"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheet(s)])
 ];
 return zip(entries);
}
