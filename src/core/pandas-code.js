import { field } from './dataset.js';
import { ensure } from './errors.js';
export function py(value) {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') { ensure(Number.isFinite(value), 'NONFINITE_VALUE'); return String(value); }
  if (Array.isArray(value)) return `[${value.map(py).join(', ')}]`;
  if (typeof value === 'object') return `{${Object.entries(value).map(([k, v]) => `${py(k)}: ${py(v)}`).join(', ')}}`;
  return JSON.stringify(value).replaceAll('\\u2028', '\\u2028');
}
const name = (table, ref) => field(table, ref).name;
function pred(table, a, df) {
  if (a.op === 'and' || a.op === 'or') return `(${a.args.map(s => pred(table, s, df)).join(a.op === 'and' ? ' & ' : ' | ')})`;
  if (a.op === 'not') return `(~${pred(table, a.arg, df)})`;
  const col = `${df}[${py(name(table, a.field))}]`;
  if (a.op === 'isMissing') return `${col}.isna()`;
  if (a.op === 'notMissing') return `${col}.notna()`;
  if (a.op === 'between') return `${col}.between(${py(a.min)}, ${py(a.max)}, inclusive=${py(a.inclusive ?? 'both')}).fillna(False)`;
  if (a.op === 'in') return `(${col}.isin(${py(a.values.filter(v => v !== null))})${a.values.includes(null) ? ` | ${col}.isna()` : ''})`;
  if (a.op === 'contains') return `${col}.str.contains(${py(a.value)}, regex=False, na=False)`;
  if (a.op === 'startsWith') return `${col}.str.startswith(${py(a.value)}, na=False)`;
  return `(${col} ${({ eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' })[a.op]} ${py(a.value)}).fillna(False)`;
}
function expr(table, a, df) {
  if (a.type === 'field') {const c=field(table,a.field),col=`${df}[${py(c.name)}]`;return c.type==='date'?`${col}.dt.strftime('%Y-%m-%d').astype('string')`:c.type==='datetime'?`${col}.map(lambda v: pd.NA if pd.isna(v) else v.isoformat(timespec='milliseconds').replace('+00:00', 'Z')).astype('string')`:col;}
  if (a.type === 'literal') return `_nd_series(${py(a.value)}, ${df}.index)`;
  if (a.type === 'binary') {
    const left = expr(table, a.left, df), right = expr(table, a.right, df);
    if (a.op === '/') return `(${left} / ${right}.mask(${right}.eq(0)))`;
    return `(${left} ${a.op} ${right})`;
  }
  const args = a.args.map(s => expr(table, s, df));
  if (a.fn === 'if') return `${args[1]}.astype(object).where(${args[0]}.fillna(False), ${args[2]}.astype(object))`;
  if (a.fn === 'coalesce') return args.slice(1).reduce((s, x) => `${s}.fillna(${x})`, args[0]);
  return `${args[0]}.${a.fn}()`;
}
export const PANDAS_PREAMBLE = `import pandas as pd
import numpy as np
import json
import re

def _nd_series(value, index):
    return pd.Series(value, index=index)

def _nd_input(records, schema):
    frame = pd.DataFrame(records, columns=[c['name'] for c in schema])
    for c in schema:
        typ = c['type']
        if typ in ('number', 'integer'):
            frame[c['name']] = frame[c['name']].astype('Float64' if typ == 'number' else 'Int64')
        elif typ == 'boolean':
            frame[c['name']] = frame[c['name']].astype('boolean')
        elif typ in ('date', 'datetime'):
            frame[c['name']] = pd.to_datetime(frame[c['name']], utc=True)
        else:
            frame[c['name']] = frame[c['name']].astype('string')
    return frame

def _nd_cast(series, typ, errors, source_type=None):
    # DataLab accepts strict decimal/ISO tokens, rather than locale guesses.
    def source_value(v):
        if pd.isna(v): return None
        if source_type == 'date': return v.strftime('%Y-%m-%d')
        if source_type == 'datetime': return v.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
        return v
    series = series.map(source_value)
    def invalid(mask):
        if errors == 'raise' and mask.any(): raise ValueError('invalid strict DataLab conversion')
        return series.mask(mask)
    if typ in ('number', 'integer'):
        grammar = r'[-+]?(?:[0-9]+(?:[.][0-9]*)?|[.][0-9]+)(?:[eE][-+]?[0-9]+)?'
        bad = series.map(lambda v: not pd.isna(v) and (isinstance(v, (bool, np.bool_)) or re.fullmatch(grammar, str(v)) is None))
        out = pd.to_numeric(invalid(bad), errors=errors).astype('Float64')
        bad = out.notna() & (~np.isfinite(out.astype(float)) | ((out % 1 == 0) & (out.abs() > 9007199254740991)))
        if typ == 'integer': bad |= out.notna() & (out % 1 != 0)
        if bad.any() and errors == 'raise': raise ValueError('invalid numeric conversion')
        return out.mask(bad).astype('Int64' if typ == 'integer' else 'Float64')
    if typ in ('date', 'datetime'):
        grammar = r'[0-9]{4}-[0-9]{2}-[0-9]{2}' + (r'T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})' if typ == 'datetime' else '')
        bad = series.map(lambda v: not pd.isna(v) and (not isinstance(v, str) or re.fullmatch(grammar, v) is None))
        return pd.to_datetime(invalid(bad), errors=errors, utc=True, format='ISO8601')
    if typ == 'boolean':
        out = series.map(lambda v: pd.NA if pd.isna(v) else v if isinstance(v, bool) else True if v == 'true' else False if v == 'false' else pd.NA)
        if errors == 'raise' and (series.notna() & out.isna()).any():
            raise ValueError('invalid boolean conversion')
        return out.astype('boolean')
    def text(v):
        if v is None or pd.isna(v): return pd.NA
        if isinstance(v, (bool, np.bool_)): return 'true' if v else 'false'
        if isinstance(v, (int, float, np.number)):
            if v == 0: return '0'
            return np.format_float_positional(float(v), unique=True, trim='-') if 0.000001 <= abs(v) < 1e21 else np.format_float_scientific(float(v), unique=True, trim='-', exp_digits=1)
        return str(v)
    return series.map(text).astype('string')

def _nd_flat_pivot(frame, index, columns, value, agg, dropna, sort, fill, column_keys):
    # DataLab uses observed input row/column keys, including all-null value rows.
    out = frame.groupby(index + columns, dropna=dropna, sort=sort, observed=True)[value].agg(agg)
    groups = frame.loc[:, index].drop_duplicates()
    if dropna:
        groups = groups.dropna()
    if sort:
        groups = groups.sort_values(index, na_position='last')
    result = groups.reset_index(drop=True)
    for key in column_keys:
        mask = pd.Series(True, index=frame.index)
        for col, val in zip(columns, key):
            mask &= frame[col].isna() if val is None else frame[col].eq(val).fillna(False)
        sub = frame.loc[mask].groupby(index, dropna=dropna, sort=False, observed=True)[value].agg(agg).reset_index()
        colname = 'pivot_' + json.dumps(key, ensure_ascii=False, separators=(',', ':'))
        sub = sub.rename(columns={value: colname})
        result = result.merge(sub, on=index, how='left', validate='one_to_one')
        if fill is not None:
            result[colname] = result[colname].fillna(fill)
    return result

def _nd_grouped_resample(frame, keys, date, value, rule, fn, out_name):
    outputs = []
    for key, group in frame.groupby(keys, sort=False, dropna=False, observed=True):
        key = key if isinstance(key, tuple) else (key,)
        part = group.dropna(subset=[date]).set_index(date)[value].resample(rule, closed='left', label='left').agg(fn).rename(out_name).reset_index()
        for name, val in zip(keys, key):
            part[name] = val
        outputs.append(part[[date] + keys + [out_name]])
    return pd.concat(outputs, ignore_index=True) if outputs else pd.DataFrame(columns=[date] + keys + [out_name])
`;
export function toPandas(inputs, spec, outputTable, { variables = ['df', 'right'], output = 'out' } = {}) {
  const table = inputs[0], p = spec.params ?? {}, df = variables[0], right = variables[1], n = ref => name(table, ref);
  const assign = expression => `${output} = ${expression}`;
  switch (spec.type) {
    case 'filter': return assign(`${df}.loc[${pred(table, p.predicate, df)}].copy()`);
    case 'sort': return assign(`${df}.sort_values(${py(p.by.map(n))}, ascending=${py(p.ascending ?? true)}, na_position=${py(p.naPosition ?? 'last')}, kind='stable')`);
    case 'dropna': return assign(`${df}.dropna(subset=${py((p.subset ?? table.columns.map(c => c.id)).map(n))}, how=${py(p.how ?? 'any')})`);
    case 'fillna': {
      const col = `${output}[${py(n(p.field))}]`, value = p.method === 'constant' || (p.method === 'mode' && p.value !== undefined) ? py(p.value)
        : p.method === 'mode' ? `${df}[${py(n(p.field))}].mode().iloc[0]` : `${df}[${py(n(p.field))}].${p.method}()`;
      const type = outputTable.columns.find(c => c.name === n(p.field)).type;
      if (['date','datetime'].includes(type)) {
        const fill = p.method === 'constant' || p.value !== undefined ? `pd.to_datetime(${py(p.value)}, utc=True)` : value;
        return `${output} = ${df}.copy()\n${col} = ${col}.fillna(${fill})`;
      }
      return `${output} = ${df}.copy()\n${col} = ${col}.astype(${py(type === 'number' ? 'Float64' : type === 'integer' ? 'Int64' : type === 'boolean' ? 'boolean' : 'string')}).fillna(${value})`;
    }
    case 'dedup': return assign(`${df}.drop_duplicates(subset=${py((p.subset ?? table.columns.map(c => c.id)).map(n))}, keep=${py(p.keep ?? 'first')})`);
    case 'cast': return `${output} = ${df}.copy()\n${output}[${py(n(p.field))}] = _nd_cast(${df}[${py(n(p.field))}], ${py(p.type)}, ${py(p.errors ?? 'raise')}, ${py(field(table,p.field).type)})`;
    case 'rename': return assign(`${df}.rename(columns={${py(n(p.field))}: ${py(p.name)}})`);
    case 'select': return assign(`${df}.loc[:, ${py(p.fields.map(n))}].copy()`);
    case 'derive': return `${output} = ${df}.copy()\n${output}[${py(p.name)}] = _nd_cast(${expr(table, p.expression, df)}, ${py(outputTable.columns.find(c=>c.name===p.name).type)}, 'raise')\n${output}[${py(p.name)}] = ${output}[${py(p.name)}].replace([np.inf, -np.inf], pd.NA)`;
    case 'group': {
      const grouped = `${df}.groupby(${py(p.keys.map(n))}, as_index=False, dropna=${py(p.dropna ?? false)}, sort=${py(p.sort ?? false)}, observed=True)`;
      const aggs = p.metrics.map(m => {
        const fn = m.fn === 'sum' && m.minCount !== undefined ? `lambda s: s.sum(min_count=${m.minCount})`
          : ['std', 'var'].includes(m.fn) && m.ddof !== undefined ? `lambda s: s.${m.fn}(ddof=${m.ddof})` : py(m.fn);
        return `${py(m.as)}: (${py(n(m.field))}, ${fn})`;
      });
      return assign(`${grouped}.agg(**{${aggs.join(', ')}})`);
    }
    case 'pivot_table': case 'pivot': {
      const refs = value => (Array.isArray(value) ? value : [value]).map(n);
      const colKeys = outputTable.lineage.columnKeys;
      // Native pivot_table is not equivalent for all-null cells; disclose the helper.
      return `# Flat DataLab pivot, observed keys preserved; pandas groupby + merge\n${output} = _nd_flat_pivot(${df}, ${py(refs(p.index))}, ${py(refs(p.columns))}, ${py(n(p.value))}, ${py(spec.type === 'pivot' ? 'first' : p.agg ?? 'mean')}, ${py(p.dropna ?? false)}, ${py(p.sort ?? false)}, ${py(p.fillValue ?? null)}, ${py(colKeys)})`;
    }
    case 'merge': {
      const refs = (t, value) => (Array.isArray(value) ? value : [value]).map(c => name(t, c));
      return assign(`pd.merge(${df}, ${right}, left_on=${py(refs(table, p.on ?? p.leftOn))}, right_on=${py(refs(inputs[1], p.on ?? p.rightOn))}, how=${py(p.how ?? 'inner')}, suffixes=${py(p.suffixes ?? ['_x', '_y'])}, validate=${py(p.validate ?? 'many_to_many')}, sort=False)`);
    }
    case 'concat': return assign(`pd.concat([${variables.join(', ')}], axis=0, join=${py(p.join ?? 'outer')}, ignore_index=True, sort=False)`);
    case 'rolling': {
      const keys = (p.by ?? []).map(n), sorted = `${output} = ${df}.sort_values(${py([...keys, n(p.order)])}, kind='stable', na_position='last').reset_index(drop=True)`;
      const col = `${output}[${py(n(p.field))}]`, rolling = `.rolling(${p.window}, min_periods=${p.minPeriods ?? p.window}).${p.fn ?? 'mean'}()`;
      return `${sorted}\n${output}[${py(p.as)}] = ${keys.length ? `${output}.groupby(${py(keys)}, dropna=False, sort=False, observed=True)[${py(n(p.field))}].transform(lambda s: s${rolling})` : `${col}${rolling}`}`;
    }
    case 'resample': {
      if ((p.by ?? []).length) return assign(`_nd_grouped_resample(${df}, ${py(p.by.map(n))}, ${py(n(p.date))}, ${py(n(p.field))}, ${py(p.rule)}, ${py(p.fn??'mean')}, ${py(p.as)})`);
      return `${output} = ${df}.dropna(subset=[${py(n(p.date))}]).set_index(${py(n(p.date))})[${py(n(p.field))}].resample(${py(p.rule)}, closed='left', label='left').${p.fn ?? 'mean'}().rename(${py(p.as)}).reset_index()`;
    }
    case 'cut': case 'qcut': {
      const col=outputTable.columns.at(-1),series=`${df}[${py(n(p.field))}]`;
      const value=spec.type==='cut'?`pd.cut(${series}, bins=${py(p.edges)}, right=${py(p.right??true)}, include_lowest=${py(p.includeLowest??false)}, labels=${py(col.binLabels)})`
        :col.binEdges.length<2?`pd.Series(pd.NA, index=${df}.index, dtype='string')`:`pd.cut(${series}, bins=${py(col.binEdges)}, right=True, include_lowest=True, labels=${py(col.binLabels)})`;
      return `${spec.type==='qcut'?'# Quantile bins: replay recorded linear-quantile edges, avoiding cross-runtime floating-boundary differences in pd.qcut.\n':''}${output} = ${df}.copy()\n${output}[${py(p.as)}] = ${value}`;
    }
    case 'rank': {
      const series=(p.by??[]).length?`${df}.groupby(${py(p.by.map(n))}, dropna=False, sort=False, observed=True)[${py(n(p.field))}]`:`${df}[${py(n(p.field))}]`;
      return `${output} = ${df}.copy()\n${output}[${py(p.as)}] = ${series}.rank(method=${py(p.method??'average')}, ascending=${py(p.ascending??true)}, pct=${py(p.pct??false)}, na_option='keep')`;
    }
    case 'cumsum': case 'transform': {
      const series=(p.by??[]).length?`${df}.groupby(${py(p.by.map(n))}, dropna=False, sort=False, observed=True)[${py(n(p.field))}]`:`${df}[${py(n(p.field))}]`;
      return `${output} = ${df}.copy()\n${output}[${py(p.as)}] = ${series}.${spec.type==='cumsum'?'cumsum()':(p.by??[]).length?`transform(${py(p.fn)})`:`${p.fn}()`}`;
    }
    case 'melt': return assign(`${df}.melt(id_vars=${py(p.ids.map(n))}, value_vars=${py(p.values.map(n))}, var_name=${py(p.variable)}, value_name=${py(p.value)})`);
    case 'date_part': {
      const col=`${df}[${py(n(p.field))}]`,value=p.part==='year'?`${col}.dt.year`:
        p.part==='month'?`${col}.dt.tz_localize(None).dt.to_period('M').dt.start_time`:`(${col}.dt.normalize() - pd.to_timedelta(${col}.dt.dayofweek, unit='D'))`;
      return `${output} = ${df}.copy()\n${output}[${py(p.as)}] = ${value}`;
    }
    default: return null;
  }
}
