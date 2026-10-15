import { ensure } from './errors.js';
// Small expression grammar, deliberately unrelated to JavaScript execution.
export function parseFormula(source) {
  const tokens=[]; let pos=0;
  const pattern=/\s*(\[[^\]]+\]|"(?:[^"\\]|\\.)*"|\d+(?:\.\d*)?(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z_0-9]*|>=|<=|==|!=|[+*/(),<>-])/y;
  while(pos<source.length){if(!source.slice(pos).trim())break;pattern.lastIndex=pos;const match=pattern.exec(source);ensure(match,'FORMULA_SYNTAX',{position:pos});tokens.push(match[1]);pos=pattern.lastIndex;}
  let cursor=0;
  const precedence={'==':1,'!=':1,'>':1,'<':1,'>=':1,'<=':1,'+':2,'-':2,'*':3,'/':3};
  function atom(){const token=tokens[cursor++];ensure(token,'FORMULA_SYNTAX');
    if(token==='('){const node=expression(0);ensure(tokens[cursor++]===')','FORMULA_SYNTAX');return node;}
    if(token==='-')return {type:'binary',op:'-',left:{type:'literal',value:0},right:atom()};
    if(token.startsWith('['))return {type:'field',field:token.slice(1,-1)};
    if(token.startsWith('"'))return {type:'literal',value:JSON.parse(token)};
    if(/^\d/.test(token))return {type:'literal',value:Number(token)};
    if(['true','false','null'].includes(token))return {type:'literal',value:token==='null'?null:token==='true'};
    if(tokens[cursor]==='('){ensure(['if','coalesce','abs','round'].includes(token),'INVALID_EXPRESSION');cursor++;const args=[];if(tokens[cursor]!==')')do{args.push(expression(0));if(tokens[cursor]!==',')break;cursor++;}while(true);ensure(tokens[cursor++]===')','FORMULA_SYNTAX');return {type:'call',fn:token,args};}
    return {type:'field',field:token};
  }
  function expression(min){let left=atom();while((precedence[tokens[cursor]]??-1)>=min){const op=tokens[cursor++];const right=expression(precedence[op]+1);left={type:'binary',op,left,right};}return left;}
  const ast=expression(0);ensure(cursor===tokens.length,'FORMULA_SYNTAX',{position:cursor});return ast;
}
