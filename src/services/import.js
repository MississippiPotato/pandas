import {LIMITS} from '../data/loader.js';
export async function readUpload(file){
  if(file.size>LIMITS.bytes)throw new Error('FILE_LIMIT');
  const format=file.name.split('.').at(-1).toLowerCase();
  if(format==='xlsx'){
    const {default:readExcel}=await import('read-excel-file/browser');
    const sheets=await readExcel(file);
    if(!sheets.some(s=>s.data.length))throw new Error('EMPTY_FILE');
    return {fileName:file.name,format:'json',sheets:sheets.filter(s=>s.data.length).map(s=>({name:s.sheet,data:s.data}))};
  }
  if(!['csv','tsv','json'].includes(format))throw new Error('UNSUPPORTED_FORMAT');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('INVALID_ENCODING');}
  return {fileName:file.name,format,text,options:format==='json'?{}:{delimiter:detectDelimiter(text,format)}};
}
export function detectDelimiter(text,format='csv'){
  // Count delimiters outside quoted fields; quoted commas never win detection.
  let quoted=false,counts=[0,0,0,0],rows=[],candidates=[',','\t',';','|'];
  for(let i=0;i<Math.min(text.length,65536)&&rows.length<20;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted){const k=candidates.indexOf(ch);if(k>=0)counts[k]++;if(ch==='\n'){rows.push(counts);counts=[0,0,0,0];}}}
  rows.push(counts);let best=format==='tsv'?1:0,score=0;
  candidates.forEach((_,k)=>{const frequencies=new Map();rows.forEach(row=>{if(row[k])frequencies.set(row[k],(frequencies.get(row[k])??0)+1);});for(const [width,n]of frequencies){const next=n*100+Math.min(width,99);if(next>score){score=next;best=k;}}});return candidates[best];
}
export function importSource(data){return data.sheets?gridJSON(data.sheets[data.sheetIndex??0].data,data.options):data.text;}
function gridJSON(grid,options={}){
  const start=Number(options.headerRow??1)-1;if(!Number.isInteger(start)||start<0||start>=grid.length)throw new Error('INVALID_HEADER');
  const header=grid[start],names=header.map((v,i)=>options.hasHeader===false?`column_${i+1}`:String(v??''));
  if(names.some(n=>!n.trim())||new Set(names).size!==names.length)throw new Error('INVALID_HEADER');
  const content=grid.slice(start+(options.hasHeader===false?0:1));
  if(content.length>LIMITS.rows||names.length>LIMITS.columns||content.length*names.length>LIMITS.cells)throw new Error('TABLE_LIMIT');
  if(content.some(row=>row.length>names.length))throw new Error('CSV_WIDTH');
  return JSON.stringify(content.map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i] instanceof Date?row[i].toISOString():row[i]??null]))));
}
