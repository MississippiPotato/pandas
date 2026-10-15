import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {csvParse,csvFormat} from 'd3';
const root=new URL('../public/data/',import.meta.url), out=new URL('examples/',root);
await mkdir(out,{recursive:true});
const read=async name=>csvParse(await readFile(new URL(`nba/2025-26-nov/${name}.csv`,root),'utf8'));
const [teams,stats]=await Promise.all(['teams','player_game_stats'].map(read));
const east=new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NYK','ORL','PHI','TOR','WAS']);
const teamMap=new Map(teams.map(t=>[t.team_id,t]));
const buckets=new Map();
for(const r of stats.filter(r=>r.played==='true')){if(!buckets.has(r.player_id))buckets.set(r.player_id,[]);buckets.get(r.player_id).push(r);}
const sum=(rs,k)=>rs.reduce((n,r)=>n+Number(r[k]),0);
const playerRows=[...buckets.values()].map(rs=>{
  const last=rs.slice().sort((a,b)=>a.game_date.localeCompare(b.game_date)).at(-1),team=teamMap.get(last.team_id).team_abbr;
  return {player_name:last.player_name,team,conference:east.has(team)?'East':'West',position:last.position||null,gp:rs.length,
    min:sum(rs,'minutes')/rs.length,pts:sum(rs,'pts')/rs.length,reb:sum(rs,'reb')/rs.length,ast:sum(rs,'ast')/rs.length,
    fg_pct:sum(rs,'fga')?sum(rs,'fgm')/sum(rs,'fga'):null,first_game:rs.map(r=>r.game_date).sort()[0],last_game:last.game_date};
}).sort((a,b)=>a.player_name.localeCompare(b.player_name));
const teamRows=teams.map(t=>({team:t.team_abbr,team_full_name:`${t.team_city} ${t.team_name}`,city:t.team_city,conference:east.has(t.team_abbr)?'East':'West',games_played:new Set(stats.filter(r=>r.team_id===t.team_id).map(r=>r.game_id)).size}));
const commit='a29a0141d20e156043ec257a64c8de3b3a03fd6e',url=`https://raw.githubusercontent.com/mwaskom/seaborn-data/${commit}/titanic.csv`;
const raw=await (await fetch(url)).text();
const titanic=csvParse(raw).map((r,i)=>Object.fromEntries([['passenger_id',String(i+1)],...['pclass','sex','age','sibsp','parch','fare','embarked','survived'].map(k=>[k,r[k]||null])]));
const tables=[];
for(const [id,records]of [['nba_players',playerRows],['nba_teams',teamRows],['titanic',titanic]]){const text=csvFormat(records)+'\n';await writeFile(new URL(id+'.csv',out),text);tables.push({id,rows:records.length,columns:Object.keys(records[0]),sha256:createHash('sha256').update(text).digest('hex')});}
await writeFile(new URL('manifest.json',out),JSON.stringify({tables,sources:{nba:'../nba/2025-26-nov/manifest.json',titanic:{url,upstream:'https://www.kaggle.com/c/titanic/data',sha256:createHash('sha256').update(raw).digest('hex')}},notes:['NBA values describe November 2025, not a full season. Team is last observed team; all played appearances are included. FG% is sum(FGM)/sum(FGA). No salary, valuation or age is invented. This monthly table preserves observed values; the separate, explicitly labelled game-level missingness exercise is generated below.','Titanic uses the 891-row seaborn/Kaggle sample. passenger_id is a generated row identifier; names are absent upstream. Natural missingness retained.']},null,2)+'\n');
console.log(tables);
await import('./prepare-nba-workbench.mjs');
