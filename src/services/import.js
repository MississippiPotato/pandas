import {LIMITS} from '../data/loader.js';
export async function readUpload(file){
  if(file.size>LIMITS.bytes)throw new Error('FILE_LIMIT');
  const format=file.name.split('.').at(-1).toLowerCase();
  if(format==='xlsx'){
    const {default:readExcel}=await import('read-excel-file/browser');
    const sheets=await readExcel(file);
    if(!sheets.some(s=>s.data.length))throw new Error('EMPTY_FILE');
    return {fileName:file.name,format:'json',sheets:sheets.filter(s=>s.data.length).map(s=>({name:s.sheet,get text(){return gridJSON(s.data);}}))};
  }
  if(!['csv','tsv','json'].includes(format))throw new Error('UNSUPPORTED_FORMAT');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('INVALID_ENCODING');}
  return {fileName:file.name,format,text};
}
function gridJSON(grid){if(!grid.length)throw new Error('EMPTY_FILE');const names=grid[0].map(v=>String(v??''));if(names.some(n=>!n.trim())||new Set(names).size!==names.length)throw new Error('INVALID_HEADER');if(grid.length>LIMITS.rows+1||names.length>LIMITS.columns||grid.length*names.length>LIMITS.cells)throw new Error('TABLE_LIMIT');return JSON.stringify(grid.slice(1).map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i] instanceof Date?row[i].toISOString():row[i]??null]))));}
