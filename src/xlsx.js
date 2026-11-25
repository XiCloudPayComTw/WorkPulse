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


/** Styled OOXML export for sensitive, local-only payroll calculations.
 * Existing buildXlsx reports keep their original lightweight appearance.
 */
const richXml=(s)=>xml(s);
const richFont=(body)=>'<font>'+body+'<name val="Aptos"/></font>';
const richFill=(hex)=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+hex+'"/><bgColor indexed="64"/></patternFill></fill>';
const xf=(font,fill,numFmt=0,border=0)=>'<xf numFmtId="'+numFmt+'" fontId="'+font+'" fillId="'+fill+'" borderId="'+border+'" xfId="0" applyFont="1" applyFill="1" applyBorder="1"'+(numFmt?' applyNumberFormat="1"':'')+'/>';
function richStyles(){
 const fonts=[
  richFont('<sz val="11"/><color rgb="FF344D60"/>'),
  richFont('<b/><sz val="19"/><color rgb="FFFFFFFF"/>'),
  richFont('<b/><sz val="11"/><color rgb="FFFFFFFF"/>'),
  richFont('<b/><sz val="11"/><color rgb="FF244D62"/>'),
  richFont('<b/><sz val="11"/><color rgb="FF147A77"/>'),
  richFont('<b/><sz val="11"/><color rgb="FF94561A"/>'),
  richFont('<sz val="10"/><color rgb="FF668090"/>'),
  richFont('<b/><sz val="16"/><color rgb="FF244D62"/>')
 ];
 const fills=['<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  richFill('203F57'),richFill('3E7587'),richFill('EAF2F7'),
  richFill('FFFFFF'),richFill('FFF2DC'),richFill('DAF3EF'),richFill('F2F6F9')];
 const styles=[
  xf(0,0),xf(1,2),xf(2,3),xf(2,3),xf(2,2,0,1),
  xf(0,4,0,1),xf(0,5,0,1),xf(0,4,164,1),xf(0,5,164,1),
  xf(3,4,165,1),xf(3,5,165,1),xf(5,6,0,1),
  xf(4,4),xf(7,4,164),xf(7,7,165),xf(6,4),
  xf(7,7,165,1),xf(3,7,165,1),xf(3,7,164,1),xf(6,5,0,1)
 ];
 return '<?xml version="1.0" encoding="UTF-8"?>'+
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/>'+
  '<numFmt numFmtId="165" formatCode="&quot;NT$ &quot;#,##0.00"/></numFmts>'+
  '<fonts count="'+fonts.length+'">'+fonts.join('')+'</fonts>'+
  '<fills count="'+fills.length+'">'+fills.join('')+'</fills>'+
  '<borders count="2"><border/><border><left/><right/><top/><bottom style="hair"><color rgb="FFD1E0E8"/></bottom><diagonal/></border></borders>'+
  '<cellStyleXfs count="1">'+xf(0,0)+'</cellStyleXfs>'+
  '<cellXfs count="'+styles.length+'">'+styles.join('')+'</cellXfs>'+
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
  '</styleSheet>';
}
function richWorksheet(sheet){
 const rows=sheet.rows||[];
 const width=sheet.widths||[],maxCols=Math.max(1,width.length,...rows.map(row=>row.length));
 const cols='<cols>'+Array.from({length:maxCols},(_,i)=>{
  const n=Number(width[i]||15);return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.max(8,Math.min(60,n))+'" customWidth="1"/>';
 }).join('')+'</cols>';
 const body=rows.map((row,i)=>{
  const ri=i+1,h=sheet.heights?.[ri];
  const cells=row.map((input,j)=>{
   if(input===undefined||input===null)return '';
   const ci=j+1,ref=colName(ci)+ri;
   const cell=typeof input==='object'&&!Array.isArray(input)?input:{v:input};
   const style=Number.isInteger(cell.s)&&cell.s>=0&&cell.s<=19?' s="'+cell.s+'"':'';
   if(Object.prototype.hasOwnProperty.call(cell,'f')){
    const formula=String(cell.f||'').replace(/^=/,'');
    if(!formula||/[<>]/.test(formula))throw Error('Excel 公式格式無效');
    const cached=Number(cell.cached);
    const v=Number.isFinite(cached)?'<v>'+cached+'</v>':'<v/>';
    return '<c r="'+ref+'"'+style+'><f>'+richXml(formula)+'</f>'+v+'</c>';
   }
   const v=cell.v;
   if(v===null||v===undefined)return '';
   if(typeof v==='number'&&Number.isFinite(v))
    return '<c r="'+ref+'"'+style+'><v>'+v+'</v></c>';
   return '<c r="'+ref+'" t="inlineStr"'+style+'><is><t xml:space="preserve">'+richXml(v)+'</t></is></c>';
  }).join('');
  return '<row r="'+ri+'"'+(h?' ht="'+Math.max(15,Math.min(80,Number(h)))+'" customHeight="1"':'')+'>'+cells+'</row>';
 }).join('');
 const freeze=Math.max(0,Number(sheet.freezeRows)||0);
 const views=freeze?'<pane ySplit="'+freeze+'" topLeftCell="A'+(freeze+1)+'" activePane="bottomLeft" state="frozen"/>':'';
 const merges=(sheet.merges||[]).map(ref=>{
  if(!/^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/.test(ref))throw Error('合併儲存格範圍無效');
  return '<mergeCell ref="'+ref+'"/>';
 });
 const mergeXml=merges.length?'<mergeCells count="'+merges.length+'">'+merges.join('')+'</mergeCells>':'';
 const autoFilter=sheet.autoFilter?'<autoFilter ref="'+richXml(sheet.autoFilter)+'"/>':'';
 const landscape=sheet.landscape?'<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>':'';
 const print='<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+print+
  '<sheetViews><sheetView workbookViewId="0" showGridLines="0">'+views+'</sheetView></sheetViews>'+
  '<sheetFormatPr defaultRowHeight="20"/>'+cols+'<sheetData>'+body+'</sheetData>'+
  mergeXml+autoFilter+'<printOptions horizontalCentered="1"/>'+landscape+'</worksheet>';
}
export function buildStyledXlsx(sheets){
 if(!Array.isArray(sheets)||sheets.length<1||sheets.length>8)
  throw Error('試算報表工作表數量不合法');
 const names=new Set();
 for(const sheet of sheets){
  if(!sheet.name||sheet.name.length>31||/[\\/?*\[\]:]/.test(sheet.name)||names.has(sheet.name))
   throw Error('試算報表工作表名稱不合法或重複');
  names.add(sheet.name);
 }
 const entries=[
  ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
  ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+richXml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1" calcOnSave="1"/></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
  ['xl/styles.xml',richStyles()],
  ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',richWorksheet(s)])
 ];
 return zip(entries);
}
