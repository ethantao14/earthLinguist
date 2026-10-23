// Shared by categories.test.js. Uses only the tab's public DOM and loader.
const vm = require('vm');

module.exports = async function tagExamplesTests(code, html, check) {
  const section = code.slice(code.indexOf('// ===== Categories tab'), code.indexOf('\nfunction applyRoleVisibility('));
  function element(tag = 'div') {
    const e = { tagName: tag.toUpperCase(), children: [], style: {}, className: '', disabled: false,
      attrs: {}, listeners: {}, value: '', ownText: '',
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      replaceChildren(...children) { this.children = children; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      addEventListener(k, f) { this.listeners[k] = f; },
      async click() { if (!this.disabled) return this.listeners.click?.({ target: this }); },
      querySelectorAll(selector) { return descendants(this).filter(c => selector === 'button' ? c.tagName === 'BUTTON' : c.className.split(' ').includes(selector.replace('.', ''))); },
    };
    Object.defineProperties(e, {
      textContent: { get() { return this.ownText + this.children.map(c => c.textContent).join(' '); }, set(v) { this.ownText = String(v); this.children = []; } },
      innerHTML: { set(v) { this.ownText = String(v).replace(/<[^>]*>/g, ' '); this.children = []; } },
    });
    e.classList = { contains: c => e.className.split(' ').includes(c),
      add(c) { if (!this.contains(c)) e.className += ' ' + c; },
      remove(c) { e.className = e.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, force) { const on = force ?? !this.contains(c); on ? this.add(c) : this.remove(c); return on; } };
    return e;
  }
  function descendants(e) { return e.children.flatMap(c => [c, ...descendants(c)]); }
  const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
  const examples = [
    { id: 'z', title: 'Zulu', user: 'Zoe', verification_status: true, irb_hold: false },
    { id: 'a', title: 'Alpha', user: 'Alice', verification_status: false, irb_hold: false },
    { id: 'h', title: 'Middle', user: 'Henry', verification_status: true, irb_hold: true },
  ];
  const categories = [{ id: 1, category_type: 'Nouns' }, { id: 2, category_type: 'Verbs' }];
  function harness({ demo = false, data = {}, response, rpc } = {}) {
    const elements = {}, body = element('tbody'), calls = [], reads = [], ranges = [];
    const get = id => elements[id] ||= element();
    const ctx = { console: { log() {}, error() {} }, DEMO_MODE: demo, currentRole: 'admin',
      document: { getElementById: get, querySelector: s => s === '#tag-examples-table tbody' ? body : null, createElement: element },
      window: {}, supabaseClient: {
        from(table) {
          reads.push(table);
          const result = response ? response(table) : { data: data[table] ?? ({ example: examples, categories, categories_example: [{ example_id: 'a', category_id: 1 }] })[table], error: null };
          let bounds;
          const orders = [];
          const query = {
            order(column) {
              orders.push(column);
              return query;
            },
            then(yes, no) {
              return Promise.resolve(result).then(value => {
                if (!bounds || !value.data) return value;
                return { ...value, data: value.data.slice(bounds[0], bounds[1] + 1) };
              }).then(yes, no);
            },
            range(from, to) {
              bounds = [from, to];
              ranges.push({ table, from, to, orders });
              return query;
            },
          };
          for (const method of ['select', 'eq', 'in', 'is', 'neq', 'limit']) query[method] = () => query;
          return query;
        },
        async rpc(name, args) { calls.push({ name, args: JSON.parse(JSON.stringify(args)) }); return rpc ? rpc(name, args) : { error: null }; },
      },
    };
    get('tag-examples-table').querySelector = () => body;
    vm.createContext(ctx); vm.runInContext(section, ctx);
    return { ctx, body, calls, reads, ranges, get, load: () => ctx.fetchAndRenderTagExamples() };
  }
  const rows = h => h.body.children.filter(r => descendants(r).some(c => c.tagName === 'BUTTON'));
  const chips = row => descendants(row).filter(c => c.tagName === 'BUTTON');
  const selected = row => chips(row).filter(c => c.classList.contains('selected')).map(c => c.textContent).join();
  const button = html.match(/<button\b[^>]*id=["']tab9-btn["'][^>]*>([\s\S]*?)<\/button>/);
  check('tag tab has its label directly after tab8', !!button && button[1].trim() === 'Tag Examples by Category' && /id=["']tab8-btn["'][^>]*>[\s\S]*?<\/button>\s*<button\b[^>]*id=["']tab9-btn["']/.test(html), 'missing or misplaced tab9 button');
  check('tag tab has heading, table and status', /id=["']tab9["'][^>]*>\s*<h2[^>]*>Tag Examples by Category<\/h2>/.test(html) && /id=["']tag-examples-table["']/.test(html) && /id=["']tag-examples-status["']/.test(html), 'missing tab9 content');
  const tabs = code.match(/const ALL_TABS\s*=\s*(\[[\s\S]*?\]);/);
  check('ALL_TABS includes tab9', !!tabs && vm.runInNewContext(tabs[1]).includes('tab9'), 'tab9 absent');
  for (const role of ['admin', 'creator', 'recorder', 'student', 'viewer']) {
    const h = harness();
    h.ctx.currentRole = role; h.ctx.ALL_TABS = tabs ? vm.runInNewContext(tabs[1]) : [];
    h.ctx.openTab = () => {}; h.ctx.openNestedTab = () => {};
    vm.runInContext(code.slice(code.indexOf('function applyRoleVisibility(')), h.ctx);
    h.ctx.applyRoleVisibility();
    check(`${role} tag tab visibility`, h.get('tab9-btn').style.display === (role === 'admin' ? 'inline-block' : 'none'), 'incorrect visibility');
  }
  for (const site of ['checkLoginStatus', 'bootDemo']) {
    const start = code.indexOf(`function ${site}(`);
    const nextFunction = code.indexOf('\nfunction ', start + 1);
    const source = code.slice(start, nextFunction === -1 ? code.length : nextFunction);
    const listener = source.match(/document\.getElementById\(["']tab9-btn["']\)\.addEventListener\([\s\S]*?\}\);/);
    let opened = '';
    let loaded = 0;
    const wiring = harness();
    wiring.ctx.openTab = id => { opened = id; };
    wiring.ctx.fetchAndRenderTagExamples = () => { loaded++; };
    if (listener) vm.runInContext(listener[0], wiring.ctx);
    await wiring.get('tab9-btn').click();
    check(`${site} tab9 listener opens tab9 and loads examples`,
      !!listener && opened === 'tab9' && loaded === 1, 'tab9 not wired at this site');
  }

  async function scenario(name, run) {
    try { await run(); } catch (e) { check(name, false, e.message); }
  }
  await scenario('tag loader renders every status and selected chips', async () => {
    const h = harness(); await h.load(); const r = rows(h);
    check('all examples render in title order with creator and status', r.length === 3 && ['Alpha Alice Awaiting approval', 'Middle Henry Held', 'Zulu Zoe Approved'].every((s, i) => s.split(' ').every(w => r[i].textContent.includes(w))), h.body.textContent);
    const heldRow = r.find(row => row.children[0]?.textContent === 'Middle');
    check('held example has exactly Held in its Status cell despite approval',
      heldRow?.children[2]?.textContent === 'Held', 'incorrect held Status cell');
    check('each row renders category chips with its own selected tags', r.every(x => chips(x).map(c => c.textContent).join() === 'Nouns,Verbs') && r.map(selected).join('|') === 'Nouns||', 'incorrect chips');
    check('loader reads examples, categories and category links', ['example', 'categories', 'categories_example'].every(t => h.reads.includes(t)), h.reads.join());
  });
  await scenario('tag chip saves, disables only its row and reverts errors', async () => {
    const pending = deferred(); let fail = false;
    const h = harness({ rpc: () => fail ? { error: { message: 'denied' } } : pending.promise }); await h.load();
    const r = rows(h), other = r[1], before = other.textContent;
    const saving = chips(r[0])[1].click(); await tick();
    check('saving disables only the changed row', chips(r[0]).every(c => c.disabled) && chips(other).every(c => !c.disabled), 'incorrect disabled chips');
    check('adding a tag sends the complete new set', h.calls[0]?.name === 'set_example_categories' && h.calls[0].args.p_example_id === 'a' && h.calls[0].args.p_category_ids.slice().sort().join() === '1,2', JSON.stringify(h.calls));
    pending.resolve({ error: null }); await saving; await tick();
    check('successful update stays selected and preserves other rows', selected(r[0]) === 'Nouns,Verbs' && rows(h)[1] === other && other.textContent === before && chips(r[0]).every(c => !c.disabled), 'row state changed incorrectly');
    await chips(r[0])[0].click(); await tick();
    check('successful removal leaves only remaining tag selected', selected(r[0]) === 'Verbs' && h.calls[1]?.args.p_category_ids.join() === '2', 'removal did not persist');
    fail = true; await chips(r[0])[1].click(); await tick();
    check('removing a tag sends remaining ids and error restores selection', h.calls[2]?.args.p_category_ids.length === 0 && selected(r[0]) === 'Verbs' && /fail/i.test(h.get('tag-examples-status').textContent) && other.textContent === before, 'removal or rollback incorrect');
  });
  await scenario('reopening waits for every pending save before reading tags', async () => {
    const pending = [deferred(), deferred()];
    const links = [{ example_id: 'a', category_id: 1 }];
    let saveIndex = 0;
    const h = harness({
      response: table => ({
        data: table === 'categories_example' ? links.slice() : { example: examples, categories }[table],
        error: null,
      }),
      rpc: async (name, args) => {
        await pending[saveIndex++].promise;
        links.push({ example_id: args.p_example_id, category_id: 2 });
        return { error: null };
      },
    });
    await h.load();
    const initialRows = rows(h);
    const saves = [chips(initialRows[0])[1].click(), chips(initialRows[1])[1].click()];
    await tick();
    const readsBeforeReopen = h.reads.length;
    const reopened = h.load();
    await tick();
    const waitedForBoth = h.reads.length === readsBeforeReopen;
    pending[0].resolve();
    await saves[0];
    await tick();
    const waitedForLast = h.reads.length === readsBeforeReopen;
    pending[1].resolve();
    await Promise.all([...saves, reopened]);
    const rendered = rows(h);
    check('reopening waits for all saves and renders their saved tags',
      waitedForBoth && waitedForLast && selected(rendered[0]) === 'Nouns,Verbs' &&
      selected(rendered[1]) === 'Verbs', 'load read before all saves settled or drew stale tags');
  });
  await scenario('examples and tag links page beyond the server cap', async () => {
    const manyExamples = Array.from({ length: 2500 }, (_, i) => ({
      id: `example-${i}`, title: `Example ${String(i).padStart(4, '0')}`,
      user: 'Alice', verification_status: true, irb_hold: false,
    }));
    const data = {
      example: manyExamples,
      categories,
      categories_example: manyExamples.map(example => ({ example_id: example.id, category_id: 1 })),
    };
    const h = harness({ response: table => ({ data: data[table], error: null }) });
    // Unranged requests receive only the first server page.
    const originalFrom = h.ctx.supabaseClient.from;
    h.ctx.supabaseClient.from = table => {
      const query = originalFrom(table);
      const originalThen = query.then;
      let ranged = false;
      const originalRange = query.range;
      query.range = (from, to) => {
        ranged = true;
        return originalRange(from, to);
      };
      query.then = (yes, no) => originalThen(value => yes({
        ...value, data: ranged ? value.data : value.data.slice(0, 1000),
      }), no);
      return query;
    };
    await h.load();
    const allPages = ['example', 'categories_example'].every(table =>
      JSON.stringify(h.ranges.filter(call => call.table === table).map(({ from, to }) => [from, to])) ===
      JSON.stringify([[0, 999], [1000, 1999], [2000, 2999]]));
    check('loader pages examples and links by 1000 and shows all 2500 tags',
      allPages && rows(h).length === 2500 && rows(h).every(row => selected(row) === 'Nouns'),
      `${rows(h).length} rows rendered; ranges: ${JSON.stringify(h.ranges)}`);
  });
  await scenario('every paged tag query ends its order with id', async () => {
    const manyExamples = Array.from({ length: 1001 }, (_, i) => ({
      ...examples[0], id: `example-${i}`, title: 'Same title',
    }));
    const h = harness({ data: {
      example: manyExamples,
      categories_example: manyExamples.map((example, id) => ({
        id, example_id: example.id, category_id: 1,
      })),
    } });
    await h.load();
    const pagedBothTables = ['example', 'categories_example'].every(table =>
      h.ranges.filter(query => query.table === table).length >= 2);
    check('every paged tag query ends its order with id',
      pagedBothTables && h.ranges.every(query => query.orders.at(-1) === 'id'),
      `paged queries: ${JSON.stringify(h.ranges)}`);
  });
  await scenario('another row success preserves a visible save failure', async () => {
    const pending = [deferred(), deferred()];
    let saveIndex = 0;
    const h = harness({ rpc: () => pending[saveIndex++].promise });
    await h.load();
    const rendered = rows(h);
    const status = h.get('tag-examples-status');
    status.textContent = 'Previous message';
    const failedSave = chips(rendered[0])[1].click();
    const clearedOnClick = status.textContent === '';
    const successfulSave = chips(rendered[1])[1].click();
    pending[0].resolve({ error: { message: 'denied' } });
    await failedSave;
    const failure = status.textContent;
    pending[1].resolve({ error: null });
    await successfulSave;
    check('click clears status and later success preserves Failed with example title',
      clearedOnClick && failure.includes('Failed') && failure.includes('Alpha') &&
      status.textContent === failure, `failure: ${failure}; final: ${status.textContent}`);
  });
  await scenario('demo tag click never writes', async () => {
    const h = harness({ demo: true }); await h.load(); await chips(rows(h)[0])[1].click(); await tick();
    check('demo click reports restriction without RPC', !h.calls.length && h.get('tag-examples-status').textContent.includes('Changes Not Allowed In Demo Version.'), 'demo write or missing message');
  });
  for (const order of [[0, 1], [1, 0]]) await scenario(`overlapping tag loads resolved ${order}`, async () => {
    const pending = [deferred(), deferred()]; let n = 0;
    const h = harness({ response: table => table === 'example' ? pending[n++].promise : { data: [], error: null } });
    const loads = [h.load(), h.load()]; await tick();
    for (const i of order) { pending[i].resolve({ data: [{ ...examples[0], title: i ? 'Latest' : 'Stale' }], error: null }); await loads[i];
      if (i === 0 && order[0] === 0) check('superseded load cannot draw while latest is pending', !h.body.textContent.includes('Stale'), h.body.textContent);
    }
    check(`latest load alone draws rows (${order})`, h.body.children.length === 1 && h.body.textContent.includes('Latest') && !h.body.textContent.includes('Stale'), h.body.textContent);
  });
  for (const table of ['example', 'categories', 'categories_example']) await scenario(`${table} load failure clears rows`, async () => {
    let failing = false;
    const h = harness({ response: t => ({ data: failing && t === table ? null : ({ example: examples, categories, categories_example: [] })[t], error: failing && t === table ? { message: 'offline' } : null }) });
    await h.load(); failing = true; await h.load();
    check(`${table} failure reports error with no example rows`, !rows(h).length && !h.body.textContent.includes('Alpha') && /fail|error|unable/i.test(h.get('tag-examples-status').textContent), 'stale rows or missing failure status');
  });
  await scenario('empty categories retain every example', async () => {
    const h = harness({ data: { categories: [], categories_example: [] } }); await h.load();
    check('each example shows existing empty chips message', h.body.children.length === 3 && h.body.children.every(r => r.textContent.includes('No categories yet. An admin can add them on the Create Categories tab.')), h.body.textContent);
  });
  await scenario('empty examples show table message', async () => {
    const h = harness({ data: { example: [], categories_example: [] } }); await h.load();
    check('empty table says No examples yet.', h.body.textContent.includes('No examples yet.'), h.body.textContent);
  });
};
