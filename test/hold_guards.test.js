// Run: node test/hold_guards.test.js
// No framework on purpose, so this does not prejudge the test suite choice.
// Simulates a creator whose approval list was loaded before a hold was applied,
// then clicking the now-held row. The example lookup returns no row and no
// error. Nothing further should be fetched or rendered.
const fs = require('fs'), vm = require('vm');
const target = process.argv[2] || __dirname + '/../js/linguisticsFrontEnd.js';
const code = fs.readFileSync(target, 'utf8');

function slice(name) {
  const start = code.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error('not found: ' + name);
  const next = code.indexOf('\nasync function ', start + 10);
  const next2 = code.indexOf('\nfunction ', start + 10);
  const end = Math.min(next < 0 ? 1e9 : next, next2 < 0 ? 1e9 : next2);
  return code.slice(start, end);
}

function run(name, call) {
  const queried = [];
  const el = () => ({ innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {} },
                      appendChild() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: el });
  const builder = (table) => {
    queried.push(table);
    const b = {
      select() { return b; }, eq() { return b; }, order() { return Promise.resolve({ data: [], error: null }); },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },   // held: no row, no error
      single() { return Promise.resolve({ data: null, error: null }); },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
    return b;
  };
  const ctx = {
    console, Number, Map, Math, Promise, Array, Object, String, Date, URL,
    document: { getElementById: el, querySelector: el, createElement: el },
    supabaseClient: { from: builder },
    clearRecordingApprovalPreview() {}, currentApprovalExampleId: null,
    recordingSessionOptionLabel: () => '', updateRecordingSessionActionUI() {},
    applyApprovalActionButtonStyle() {}, renderSubtab3Table() {},
  };
  vm.createContext(ctx);
  vm.runInContext(slice(name), ctx);
  return ctx[name](...call).then(() => queried);
}

(async () => {
  let failures = 0;
  for (const [name, args] of [['fetchAndRenderApprovalTable', ['held-id']],
                              ['renderRecordingApprovalPreview', ['held-id', 'sess-id']]]) {
    const tables = await run(name, args);
    const leaked = tables.filter(t => t !== 'example');
    if (leaked.length) { console.log(`FAIL ${name}: fetched ${leaked.join(', ')} for a held example`); failures++; }
    else console.log(`pass ${name}: stopped after the example lookup`);
  }
  process.exit(failures ? 1 : 0);
})();
