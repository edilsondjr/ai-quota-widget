// Ensures every language covers the same keys as English and uses the same {placeholders},
// and that every code returned by the providers has text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'locales');
const locales = Object.fromEntries(
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))])
);
const en = locales['en-US'];
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('english exists and every locale names itself', () => {
  assert.ok(en);
  for (const [code, l] of Object.entries(locales)) assert.ok(l._name, `${code} is missing _name`);
});

for (const [code, l] of Object.entries(locales)) {
  if (code === 'en-US') continue;
  test(`${code}: has exactly the keys of en-US.json`, () => {
    assert.deepEqual(Object.keys(l).sort(), Object.keys(en).sort());
  });
  test(`${code}: uses the same {placeholders} as en-US.json`, () => {
    for (const k of Object.keys(en)) assert.deepEqual(params(l[k]), params(en[k]), k);
  });
}

test('every error/note code a provider can return has a translation', () => {
  const codes = new Set();
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'providers'))) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'providers', f), 'utf8');
    for (const m of src.matchAll(/\berror: '(\w+)'/g)) codes.add(`err.${m[1]}`);
    for (const m of src.matchAll(/\bnote: '(\w+)'/g)) codes.add(`note.${m[1]}`);
  }
  assert.ok(codes.size > 5);
  for (const c of codes) assert.ok(en[c], `missing ${c} in en-US.json`);
});

test('every window key a provider can return has a label', () => {
  const keys = ['five_hour', 'weekly', 'seven_day', 'seven_day_sonnet', 'seven_day_opus', 'seven_day_omelette', 'extra_usage', 'session', 'month', 'window'];
  for (const k of keys) assert.ok(en[`win.${k}`], `missing win.${k}`);
});
