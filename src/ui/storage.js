// Safe localStorage wrapper (private mode / blocked storage must not break the app).
export function load(key, fallback) {
  try {
    const v = localStorage.getItem('domn:' + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem('domn:' + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
