import { Session } from '../core/session.js';
import { importText, importFile, prepareImport } from '../data/loader.js';
import { exportCSV } from '../core/export.js';
import {chartQuery,analysisResult} from '../core/analytics.js';
import {profile,aggregate,valueCounts,quantile} from '../core/statistics.js';
import {execute} from '../core/operation-registry.js';
import {rows,createTable,visibleIds,columnValues} from '../core/dataset.js';
import {filter,duplicated} from '../core/operations/cleaning.js';
import {operationPreview} from '../core/operation-preview.js';
import {visualDiff} from '../core/visual-summary.js';
import {toPandas} from '../core/pandas-code.js';
const session = new Session();
async function handle({ data: { requestId, action, payload = {} } }) {
  try {
    let result;
    switch (action) {
      case 'prepare': result = prepareImport(payload.text, payload.options); break;
      case 'import': {
        const imported = payload.file ? await importFile(payload.file, payload.options) : await importText(payload.text, payload.options);
        session.add(imported.table); result = session.snapshot(); break;
      }
      case 'snapshot': result = session.snapshot(payload); break;
      case 'values': {const table=session.table(payload.id??session.activeId),column=table.columns.find(c=>c.id===payload.field||c.name===payload.field);result=column?valueCounts(table.index.map(i=>table.values[column.id][i])):[];break;}
      case 'quantile':result=quantile(columnValues(payload.selection?filter(session.activeTable,{predicate:payload.selection}):session.activeTable,payload.field),payload.q);break;
      case 'duplicates':{const table=session.activeTable,mask=duplicated(table,payload),records=rows(table);result={count:mask.filter(Boolean).length,records:records.filter((_,i)=>mask[i]).slice(0,30),columns:table.columns};break;}
      case 'nbaExampleOverview':{const table=session.table('source:example_nba_games');const all=rows(table),mini=[all[0],all[1],all.find(r=>r.team!==all[0].team)];result={rows:table.index.length,mini,charts:chartQuery(table,{x:'pts',y:'ast',date:'game_date',category:'team',metric:'pts',aggregate:'sum'})};break;}
      case 'overview': {
        const team=session.table('source:nba_team_game_stats'),player=session.table('source:nba_player_game_stats'),games=session.table('source:nba_games');
        const played=filter(player,{predicate:{op:'eq',field:'played',value:true}});
        const leaders=execute(played,{type:'group',params:{keys:['player_id','player_name'],metrics:[{field:'pts',fn:'mean',as:'PPG'},{field:'pts',fn:'size',as:'GP'}]}}).table;
        result={games:games.index.length,players:session.table('source:nba_players').index.length,teams:session.table('source:nba_teams').index.length,
          points:aggregate(rows(team).map(r=>r.pts),'mean'),fg:aggregate(rows(team).map(r=>r.fgm),'sum')/aggregate(rows(team).map(r=>r.fga),'sum'),
          leaders:rows(leaders).filter(r=>r.GP>=5).sort((a,b)=>b.PPG-a.PPG).slice(0,7),charts:chartQuery(team,{x:'pts',y:'ast',date:'game_date',category:'team_abbr',metric:'pts',aggregate:'mean'})};break;
      }
      case 'select': session.select(payload.id); result = session.snapshot(); break;
      case 'preview': { const inputs=(payload.inputs??[session.activeId]).map(id=>session.table(id));result=operationPreview(inputs,payload.spec,session.preview(payload.spec,payload.inputs));break; }
      case 'previewSequence': {
        const input=session.table(payload.id??session.activeId),steps=[];let current=input;
        for(const spec of payload.specs){const executed=execute(current,spec);steps.push({spec,report:executed.report,code:toPandas([current],spec,executed.table,{variables:['df'],output:'df'})});current=executed.table;}
        const viewed=payload.selection?filter(current,{predicate:payload.selection}):current;
        result={rows:current.index.length,columns:current.columns,profile:profile(current),beforeProfile:profile(input),records:rows(viewed,0,payload.limit??40),steps,
          diff:visualDiff(input,current,payload.specs[0])};
        break;
      }
      case 'commit': session.commit(payload.spec, payload.inputs); result = session.snapshot(); break;
      case 'edit': session.edit(payload.id, payload.spec); result = session.snapshot(); break;
      case 'undo': session.undo(); result = session.snapshot(); break;
      case 'redo': session.redo(); result = session.snapshot(); break;
      case 'csv': result = exportCSV(payload.selection?filter(session.activeTable,{predicate:payload.selection}):session.activeTable); break;
      case 'flow': result = session.exportFlow(); break;
      case 'pandas': result = session.pandasScript(); break;
      case 'analyze': {
        result=session.snapshot({offset:payload.offset??0,limit:payload.limit??50,selection:payload.selection});
        if(session.activeTable)result.charts=chartQuery(session.activeTable,payload.config,payload.selection);
        if(result.profile)result.profile.columns=result.profile.columns.map(c=>c.values?{...c,values:c.values.slice(0,30)}:c);
        break;
      }
      case 'restore': session.importFlow(payload.flow,session.sources());result=session.snapshot();break;
      case 'removeSource': session.removeSource(payload.id);result=session.snapshot();break;
      case 'removeNode':session.removeNode(payload.id);result=session.snapshot();break;
      case 'analysisExport':{const table=payload.id?session.table(payload.id):session.activeTable;result=analysisResult(payload.selection?filter(table,{predicate:payload.selection}):table,payload.kind,payload.fields);break;}
      case 'checkpoint':result={flow:session.exportFlow(),sources:session.sources().map(t=>({records:rows(t),options:{id:t.id,sourceHash:t.sourceHash,columns:t.columns,rowIds:visibleIds(t),provenance:t.provenance}}))};break;
      case 'recover':{const tables=payload.sources.map(s=>createTable(s.records,s.options));session.importFlow(payload.flow,tables);result=session.snapshot();break;}
      default: throw Object.assign(new Error('UNKNOWN_ACTION'), { code: 'UNKNOWN_ACTION' });
    }
    self.postMessage({ requestId, ok: true, result });
  } catch (error) { self.postMessage({ requestId, ok: false, error: { code: error.code ?? error.message, details: error.details ?? {} } }); }
}
let queue = Promise.resolve();
self.onmessage = event => { queue = queue.then(() => handle(event)); };
