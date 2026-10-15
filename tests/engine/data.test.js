import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importText, parseDelimited, prepareImport, importFile } from '../../src/data/loader.js';
import { convert, inferType } from '../../src/data/schema.js';
import { rows, createTable, visibleIds } from '../../src/core/dataset.js';
import { exportCSV } from '../../src/core/export.js';
const code = expected => error => error.code === expected;
test('JSON rejects numeric identity loss and overflow before coercing fields to text',()=>{
  for(const token of ['9007199254740993','1e400'])assert.throws(()=>prepareImport(`[{"ID":${token}}]`,{format:'json'}),error=>error.code==='JSON_NUMBER'&&error.details.row===1&&error.details.field==='ID');
  assert.equal(prepareImport('[{"ID":"9007199254740993"}]',{format:'json'}).records[0].ID,'9007199254740993');
});
test('strict CSV preserves BOM, escaped quotes, embedded newline and leading-zero ID', async () => {
  const { table } = await importText('\uFEFFid,Message,Amount,Flag\r\n001,"a,b\n""c""",0,false\r\n002,,10,true\r\n');
  assert.deepEqual(rows(table), [{ id: '001', Message: 'a,b\n"c"', Amount: 0, Flag: false }, { id: '002', Message: null, Amount: 10, Flag: true }]);
  assert.equal(table.columns[0].type, 'string'); assert.ok(Object.isFrozen(table.values[table.columns[0].id]));
});
test('TSV and JSON use different explicit empty-string missing rules', async () => {
  assert.deepEqual(rows((await importText('key\tvalue\na\t0', { format: 'tsv' })).table), [{ key: 'a', value: 0 }]);
  const { table } = await importText('[{"x":"","a":false},{"x":null,"other":2}]', { format: 'json' });
  assert.deepEqual(rows(table), [{ x: '', a: false, other: null }, { x: null, a: null, other: 2 }]);
});
test('NA is literal unless chosen as a missing token', async () => {
  assert.equal(rows((await importText('x\nNA')).table)[0].x, 'NA');
  assert.equal(rows((await importText('x\nNA', { nullTokens: ['NA'] })).table)[0].x, null);
});
test('malformed CSV/header/width is rejected rather than silently repaired', () => {
  for (const [text, expected] of [['a,a\n1,2','INVALID_HEADER'], ['a,\n1,2','INVALID_HEADER'], ['a,b\n1','CSV_WIDTH'], ['a\n"unfinished','CSV_UNCLOSED_QUOTE'], ['a\n"x"wrong','CSV_AFTER_QUOTE'], ['a\nbo"gus','CSV_QUOTE']]) assert.throws(() => parseDelimited(text), code(expected));
});
test('limits and nested JSON fail before creating a table', async () => {
  assert.throws(() => parseDelimited('a\n1\n2', ',', { rows: 1, columns: 1, cells: 1 }), code('ROW_LIMIT'));
  await assert.rejects(importText('[{"x":{"n":1}}]', { format:'json' }), code('NESTED_VALUE'));
  await assert.rejects(importText('[]', { format:'json' }), code('EMPTY_SCHEMA'));
  await assert.rejects(importFile(new File([new Uint8Array([0xff])], 'bad.csv')), code('INVALID_ENCODING'));
});
test('schema protects unsafe integer/ID; dates and boolean conversion are strict', () => {
  assert.equal(inferType('Postal code', ['12345']), 'string');
  assert.equal(inferType('x', ['9007199254740993']), 'string');
  assert.throws(() => convert('1.2', 'integer'), code('INVALID_VALUE'));
  assert.throws(() => convert('2025-02-29', 'date'), code('INVALID_VALUE'));
  assert.throws(() => convert('2024-02-30T12:00:00Z', 'datetime'), code('INVALID_VALUE'));
  assert.throws(() => convert('2024-02-29T25:00:00Z', 'datetime'), code('INVALID_VALUE'));
  assert.equal(convert('2024-02-29','date'), '2024-02-29');
  assert.equal(convert('false','boolean'), false); assert.throws(() => convert('0','boolean'));
});
test('import preview exposes conversion failures; coerce must be explicit', async () => {
  const p = prepareImport('n\n1\nx', { types:{ n:'integer' } }); assert.equal(p.errors.length,1);
  await assert.rejects(importText('n\n1\nx', { types:{ n:'integer' } }), code('IMPORT_CONVERSION'));
  assert.deepEqual(rows((await importText('n\n1\nx', { types:{ n:'integer' }, errors:'coerce' })).table), [{ n:1 },{ n:null }]);
});
test('hostile column names are inert strings and CSV export roundtrips actual values', async () => {
  const t = createTable([JSON.parse('{"__proto__":"safe","a,b":"line\\nquote\\\"","零":0}')]);
  const back = (await importText(exportCSV(t, { bom:true }))).table;
  assert.deepEqual(rows(back), rows(t)); assert.equal({}.safe, undefined);
  assert.equal(new Set(visibleIds(back)).size, 1);
});
test('empty CSV with a schema remains an analyzable empty table', async () => {
  const t = (await importText('a,b\n')).table; assert.equal(t.index.length,0); assert.equal(t.columns.length,2);
});
