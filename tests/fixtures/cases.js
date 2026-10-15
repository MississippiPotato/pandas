export const sales = [
  { Region: 'A', Revenue: 0, Units: 0, Date: '2025-01-01', Active: false },
  { Region: 'A', Revenue: 10, Units: 2, Date: '2025-01-02', Active: true },
  { Region: 'B', Revenue: 20, Units: 4, Date: '2025-01-04', Active: true },
  { Region: 'B', Revenue: null, Units: 4, Date: '2025-02-01', Active: false },
  { Region: null, Revenue: 40, Units: 8, Date: '2025-02-03', Active: true }
];
export const schema = ['Region', 'Revenue', 'Units', 'Date', 'Active'].map((name, i) => ({ name, id: `sales:c${i}`, type: ['string', 'number', 'integer', 'date', 'boolean'][i] }));
export const groupSpec = { type: 'group', params: { keys: ['Region'], metrics: [
  { field: 'Revenue', fn: 'mean', as: 'average' }, { field: 'Revenue', fn: 'count', as: 'valid' }, { field: 'Revenue', fn: 'size', as: 'size' }
] } };
export const predicateSpec = { type: 'filter', params: { predicate: { op: 'and', args: [{ field: 'Revenue', op: 'between', min: 0, max: 20 }, { field: 'Active', op: 'eq', value: true }] } } };
