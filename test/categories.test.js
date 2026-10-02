// Run: node test/categories.test.js
// No framework on purpose, so this does not prejudge the test suite choice.
// Checks the Categories tab against a stubbed Supabase client: demo mode must
// never write, and only the latest of overlapping fetches may draw the table.
const fs = require('fs'), vm = require('vm');
const target = process.argv[2] || __dirname + '/../js/linguisticsFrontEnd.js';
const code = fs.readFileSync(target, 'utf8');
const section = code.slice(code.indexOf('// ===== Categories tab'), code.indexOf('\nfunction applyRoleVisibility('));

function load(demoMode, client) {
  const tbody = { rows: [], set innerHTML(v) { this.rows = []; }, appendChild(row) { this.rows.push(row); } };
  const el = () => ({ value: 'Verbs', textContent: '', style: {}, classList: { add() {} },
                      appendChild() {}, addEventListener() {}, focus() {} });
  const ctx = {
    console: { error() {} }, DEMO_MODE: demoMode, window: { confirm: () => true },
    supabaseClient: client,
    document: { querySelector: () => tbody, getElementById: el, createElement: el },
  };
  vm.createContext(ctx);
  vm.runInContext(section, ctx);
  return { ctx, tbody };
}

// A fetch whose responses are released by hand, in any order.
function slowClient() {
  const pending = [];
  const client = { from: () => ({ select() { return this; }, order: () => new Promise(r => pending.push(r)) }) };
  return { client, release: (i, names) => pending[i]({ data: names.map((n, id) => ({ id, category_type: n })), error: null }) };
}

(async () => {
  let failures = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? 'pass' : 'FAIL'} ${name}${ok ? '' : ': ' + detail}`);
    if (!ok) failures++;
  };

  let writes = 0;
  const writer = { insert: async () => { writes++; return { error: null }; },
                   update() { writes++; return this; }, delete() { writes++; return this; },
                   eq() { return this; }, select: async () => ({ data: [{ id: 1 }], error: null }) };
  const demo = load(true, { from: () => writer }).ctx;
  await demo.addCategory();
  await demo.renameCategory({ id: 1, category_type: 'Verbs' }, 'Nouns');
  await demo.deleteCategory({ id: 1, category_type: 'Verbs' });
  check('demo mode never writes categories', writes === 0, `${writes} write(s) attempted`);

  const twice = slowClient();
  const a = load(false, twice.client);
  const first = a.ctx.fetchAndRenderCategories(), second = a.ctx.fetchAndRenderCategories();
  twice.release(0, ['Verbs']); await first;
  twice.release(1, ['Verbs']); await second;
  check('overlapping fetches show each category once', a.tbody.rows.length === 1, `${a.tbody.rows.length} rows shown`);

  const stale = slowClient();
  const b = load(false, stale.client);
  const older = b.ctx.fetchAndRenderCategories(), newer = b.ctx.fetchAndRenderCategories();
  stale.release(1, ['Nouns']); await newer;
  stale.release(0, ['Deleted', 'Nouns']); await older;
  check('a slower, older fetch cannot overwrite a newer one', b.tbody.rows.length === 1, `${b.tbody.rows.length} rows shown`);

  // Approval chips: an admin clicks example A, then B, and A's load is the
  // one that starts late. The chips must stay B's, and a click must tag B.
  const chips = { innerHTML: '', items: [], appendChild(c) { this.items.push(c); },
                  set textContent(v) { this.items = []; } };
  Object.defineProperty(chips, 'innerHTML', { set() { this.items = []; } });
  const tagCalls = [];
  const tagsFor = { A: [1], B: [2] };
  const approval = {
    console: { error() {} }, DEMO_MODE: false, currentApprovalExampleId: 'B',
    document: { getElementById: (id) => (id === 'approval-categories' ? chips : { textContent: '' }),
                createElement: () => ({ setAttribute() {}, addEventListener(e, f) { this.click = f; } }) },
    supabaseClient: {
      from: (table) => ({
        select() { return this; },
        order: async () => ({ data: [{ id: 1, category_type: 'Nouns' }, { id: 2, category_type: 'Verbs' }], error: null }),
        eq: async (col, ex) => ({ data: tagsFor[ex].map((id) => ({ category_id: id })), error: null }),
      }),
      rpc: async (name, args) => { tagCalls.push(args.p_example_id); return { error: null }; },
    },
  };
  vm.createContext(approval);
  vm.runInContext(section, approval);
  await approval.renderApprovalCategories('B');
  await approval.renderApprovalCategories('A'); // the stale, late load for A
  const shown = chips.items.filter((c) => c.className.includes('selected')).map((c) => c.textContent);
  check('a late load for another example cannot replace the chips', shown.join() === 'Verbs', `showing ${shown.join() || 'nothing'} selected`);
  chips.items[0]?.click();
  await new Promise((r) => setTimeout(r, 0));
  check('clicking a chip tags the selected example', tagCalls.join() === 'B', `tagged ${tagCalls.join() || 'nothing'}`);

  // Listen and Record lists: labels are capped, and the filter keeps only
  // examples that have every picked category.
  const fakeEl = () => ({ style: {}, children: [], className: '', textContent: '', title: '',
                          set innerHTML(v) { this.children = []; },
                          appendChild(c) { this.children.push(c); },
                          setAttribute() {}, addEventListener(e, f) { this.click = f; } });
  const page = { 'f-wrap': fakeEl(), 'f-chips': fakeEl() };
  const lists = { console: { error() {} }, DEMO_MODE: false,
                  document: { getElementById: (id) => page[id], createElement: fakeEl } };
  vm.createContext(lists);
  vm.runInContext(section, lists);

  const cats = ['Nouns', 'Places', 'Plural', 'Tense', 'Verbs'].map((n, i) => ({ id: i + 1, category_type: n }));
  const cell = fakeEl();
  lists.renderCategoryLabels(cell, cats, new Set([1, 2, 3, 4, 5]));
  const labels = cell.children[0]?.children.map((l) => l.textContent).join() || '';
  check('labels stop at three and count the rest', labels === 'Nouns,Places,Plural,+2', `showed ${labels}`);

  const row = (tags) => ({ tr: { style: {} }, tagIds: new Set(tags) });
  const both = row([1, 5]), nounsOnly = row([1]), untagged = row([]);
  const noMatch = { style: {} };
  const picked = new Set([1, 99]); // 99 was deleted by an admin
  lists.setUpCategoryFilter('f-wrap', 'f-chips', cats, picked, [both, nounsOnly, untagged], noMatch);
  check('picks of deleted categories are dropped', !picked.has(99), 'deleted category still picked');

  page['f-chips'].children.find((c) => c.textContent === 'Verbs').click(); // now Nouns + Verbs
  const visible = [both, nounsOnly, untagged].map((r) => r.tr.style.display !== 'none');
  check('the filter shows only examples with every picked category', visible.join() === 'true,false,false',
        `visible: ${visible.join()}`);
  check('the no-match message stays hidden while something matches', noMatch.style.display === 'none',
        'message shown');

  page['f-chips'].children.find((c) => c.textContent === 'Tense').click(); // nothing has all three
  check('the no-match message shows when nothing matches', noMatch.style.display === '', 'message hidden');

  ['Nouns', 'Verbs', 'Tense'].forEach((n) => page['f-chips'].children.find((c) => c.textContent === n).click());
  const allBack = [both, nounsOnly, untagged].every((r) => r.tr.style.display === '');
  check('clearing every pick shows every example again', allBack && picked.size === 0, `${picked.size} still picked`);

  process.exit(failures ? 1 : 0);
})();
