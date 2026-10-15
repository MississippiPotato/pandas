// One version fence for asynchronous consumers: late worker responses cannot overwrite new data.
export function createStore(initial = {}) {
  let state = Object.freeze({ locale: 'zh-CN', ...initial }), latest = 0;
  const listeners = new Set();
  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    request() { return ++latest; },
    publish(requestId, patch) { if (requestId !== latest) return false; state = Object.freeze({ ...state, ...patch }); listeners.forEach(fn => fn(state)); return true; },
    locale(locale) { state = Object.freeze({ ...state, locale }); listeners.forEach(fn => fn(state)); },
  };
}
