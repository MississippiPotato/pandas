import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {csvParse,csvFormat} from 'd3';
const base=new URL('../public/data/',import.meta.url),out=new URL('examples/',base);
const read=async name=>csvParse(await readFile(new URL(`nba/2025-26-nov/${name}.csv`,base),'utf8'));
const [raw,teams,teamGames]=await Promise.all(['player_game_stats','teams','team_game_stats'].map(read));
const teamById=new Map(teams.map(t=>[t.team_id,t])),gameTeams=new Map();
for(const g of teamGames){if(!gameTeams.has(g.game_id))gameTeams.set(g.game_id,[]);gameTeams.get(g.game_id).push(g);}
const played=raw.filter(r=>r.played==='true');
const records=played.map(r=>{const team=teamById.get(r.team_id),opponent=gameTeams.get(r.game_id).find(g=>g.team_id!==r.team_id),own=gameTeams.get(r.game_id).find(g=>g.team_id===r.team_id);return {
  player_name:r.player_name,team:team.team_abbr,pts:r.pts,ast:r.ast,reb:r.reb,game_date:r.game_date,minutes:r.minutes,fg_pct:r.fg_pct||null,
  opponent:teamById.get(opponent.team_id).team_abbr,position:r.position||null,stl:r.stl,blk:r.blk,fgm:r.fgm,fga:r.fga,won:+own.pts>+opponent.pts,game_id:r.game_id};});
// User-authorized missingness exercise: preserve rows and all original files.
// A stable row-identity hash makes the removed cells deterministic across ordering.
const removed=[],practice=records.map((r,index)=>{const output={...r};for(const [name,threshold]of [['fg_pct',5],['minutes',8],['pts',3]]){
  const token=createHash('sha256').update(`${r.game_id}|${played[index].player_id}|${name}`).digest().readUInt32BE();
  if(r[name]!==null&&token%100<threshold){output[name]=null;removed.push({row:index,game_id:r.game_id,player_name:r.player_name,field:name,original:r[name]});}
}return output;});
const manifest=JSON.parse(await readFile(new URL('manifest.json',out),'utf8'));
manifest.tables=manifest.tables.filter(t=>!['global_indicators','country_metadata','nba_games','nba_missing'].includes(t.id));
for(const [id,data]of [['nba_games',records],['nba_missing',practice]]){const text=csvFormat(data)+'\n';await writeFile(new URL(id+'.csv',out),text);manifest.tables.unshift({id,rows:data.length,columns:Object.keys(data[0]),sha256:createHash('sha256').update(text).digest('hex')});}
delete manifest.sources.global_indicators;delete manifest.sources.country_metadata;
manifest.sources.nba_games={source:'../nba/2025-26-nov/manifest.json',rule:'played=true; player names from source; team/opponent names prejoined via official IDs; won compares team game points. No numeric values invented.',rows:records.length,period:'2025-11-01/2025-11-30'};
manifest.sources.nba_missing={source:'nba_games.csv',purpose:'User-authorized, explicitly labelled practice copy. Fixed SHA256(game_id|player_id|field) mod 100 removes fg_pct at threshold5, minutes at8, pts at3. Existing missingness preserved. Not an official NBA completeness claim.',removedCells:removed.length,removedByField:Object.fromEntries(['fg_pct','minutes','pts'].map(k=>[k,removed.filter(r=>r.field===k).length])),auditFile:'nba-missing-audit.json'};
manifest.notes=manifest.notes.filter(n=>!n.startsWith('Primary analysis data:'));
manifest.notes.push('NBA game-level data is the primary theme. Original readable game records and a clearly labelled missing-value exercise copy are both available. Dates and repeated players support real within-player rolling; readable team keys join the team lookup.');
manifest.notes=[...new Set(manifest.notes)];const auditText=JSON.stringify({source:'nba_games.csv',method:manifest.sources.nba_missing.purpose,removed},null,2)+'\n';manifest.sources.nba_missing.auditSHA256=createHash('sha256').update(auditText).digest('hex');await writeFile(new URL('nba-missing-audit.json',out),auditText);
await writeFile(new URL('manifest.json',out),JSON.stringify(manifest,null,2)+'\n');
console.log({rows:records.length,columns:Object.keys(records[0]).length,removed:manifest.sources.nba_missing.removedByField});
