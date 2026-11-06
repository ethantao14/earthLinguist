// Run: node test/creator_consent.test.js
// No framework on purpose. Runs the creator consent block of the front end in a
// vm with a fake DOM and a stubbed Supabase client that records every call.
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2] || __dirname + '/../js/linguisticsFrontEnd.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

const START = '// ===== Creator consent';
const END = '// ===== End creator consent';
const VERSION = 'placeholder-v1';
const DECLINED = 'Sorry, we cannot let you create without consent.';
const PLACEHOLDER = "[PLACEHOLDER: paste Tom's Creator Consent Form text here. Do not edit this wording without IRB approval.]";
const USER_1 = 'u0000000-0000-0000-0000-000000000001';
const USER_2 = 'u0000000-0000-0000-0000-000000000002';

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`pass  ${name}`);
  else { console.log(`FAIL  ${name}${detail ? ': ' + detail : ''}`); failures++; }
}

// ---------- fake DOM ----------
function makeDocument() {
  const byId = {};
  function descendants(e) { return e.children.flatMap(c => [c, ...descendants(c)]); }

  // Supports the simple selectors a checkbox list needs: tag, #id, .class, [attr=value], :checked.
  function matchesOne(e, selector) {
    const parts = selector.match(/^([a-zA-Z0-9]*)((?:#[\w-]+|\.[\w-]+|\[[^\]]+\]|:checked)*)$/);
    if (!parts) return false;
    if (parts[1] && e.tagName !== parts[1].toUpperCase()) return false;
    for (const piece of parts[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:checked/g) || []) {
      if (piece[0] === '#' && e.id !== piece.slice(1)) return false;
      if (piece[0] === '.' && !e.className.split(' ').includes(piece.slice(1))) return false;
      if (piece === ':checked' && !e.checked) return false;
      if (piece[0] === '[') {
        const [attr, raw] = piece.slice(1, -1).split('=');
        const actual = attr === 'type' ? e.type : e.getAttribute(attr);
        if (raw === undefined ? actual === undefined : actual !== raw.replace(/["']/g, '')) return false;
      }
    }
    return true;
  }
  function queryAll(roots, selector) {
    return selector.split(',').map(s => s.trim()).flatMap(single => {
      const steps = single.split(/\s+/);
      let scope = roots;
      steps.forEach((step, i) => {
        const pool = scope.flatMap(r => descendants(r));
        scope = pool.filter(e => matchesOne(e, step));
        if (i < steps.length - 1) scope = [...new Set(scope)];
      });
      return scope;
    });
  }

  function element(tag = 'div') {
    let id = '';
    const e = {
      tagName: tag.toUpperCase(), children: [], style: {}, className: '', disabled: false, hidden: false,
      attrs: {}, listeners: {}, dataset: {}, value: '', checked: false, type: '', ownText: '', parentNode: null,
      get id() { return id; },
      set id(v) { id = String(v); byId[id] = e; },
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      append(...items) { for (const c of items) this.appendChild(typeof c === 'string' ? textNode(c) : c); },
      replaceChildren(...items) { this.children = []; this.ownText = ''; this.append(...items); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === 'id') this.id = v;
        if (k === 'type') this.type = String(v);
        if (k === 'class') this.className = String(v);
        if (k === 'checked') this.checked = true;
        if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v);
      },
      getAttribute(k) { return k === 'id' ? (id || undefined) : this.attrs[k]; },
      removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(k, f) { (this.listeners[k] ||= []).push(f); },
      // Like a browser, a disabled button ignores clicks.
      async click() {
        if (this.disabled) return;
        if (this.type === 'checkbox') this.checked = !this.checked;
        const handlers = [...(this.listeners.click || []), ...(this.onclick ? [this.onclick] : [])];
        for (const h of handlers) await h.call(this, { target: this, preventDefault() {} });
      },
      querySelectorAll(selector) { return queryAll([this], selector); },
      querySelector(selector) { return queryAll([this], selector)[0] || null; },
    };
    Object.defineProperties(e, {
      textContent: {
        get() { return [this.ownText, ...this.children.map(c => c.textContent)].filter(Boolean).join(' '); },
        set(v) { this.ownText = String(v ?? ''); this.children = []; },
      },
      innerText: { get() { return this.textContent; }, set(v) { this.textContent = v; } },
      innerHTML: {
        get() { return this.ownText; },
        set(v) { setMarkup(this, String(v ?? '')); },
      },
    });
    e.classList = {
      contains: c => e.className.split(' ').includes(c),
      add(c) { if (!this.contains(c)) e.className += ' ' + c; },
      remove(c) { e.className = e.className.split(' ').filter(x => x !== c).join(' '); },
      toggle(c, force) { const on = force ?? !this.contains(c); on ? this.add(c) : this.remove(c); return on; },
    };
    return e;
  }
  function textNode(text) { const t = element('#text'); t.ownText = text; return t; }

  // Markup is turned into flat children: one per input tag, plus the visible text.
  function setMarkup(target, markup) {
    target.children = [];
    target.ownText = markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    for (const tag of markup.match(/<input\b[^>]*>/gi) || []) {
      const input = element('input');
      for (const [, k, , v] of tag.matchAll(/([\w-]+)(?:=(["'])(.*?)\2)?/g)) {
        if (k.toLowerCase() !== 'input') input.setAttribute(k, v ?? '');
      }
      target.appendChild(input);
    }
  }

  const document = {
    getElementById(wanted) {
      if (!byId[wanted]) { const e = element(); e.id = wanted; }
      return byId[wanted];
    },
    createElement: element,
    createTextNode: textNode,
    querySelectorAll(selector) {
      const roots = Object.values(byId).filter(e => !e.parentNode);
      const pseudoRoot = { children: roots };
      return queryAll([pseudoRoot], selector);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
  };
  return { document, descendants };
}

// ---------- stubbed Supabase client ----------
// `reply(chain)` decides each response; it may return a promise to hold it open.
function makeClient(reply) {
  const chains = [];
  return {
    chains,
    from(table) {
      const chain = { table, steps: [] };
      chains.push(chain);
      let settled;
      const query = {
        then(yes, no) {
          settled ||= Promise.resolve(reply(chain));
          return settled.then(yes, no);
        },
      };
      for (const method of ['select', 'eq', 'limit', 'insert', 'maybeSingle', 'single', 'order', 'upsert', 'update', 'delete']) {
        query[method] = (...args) => {
          chain.steps.push({ method, args: JSON.parse(JSON.stringify(args)) });
          return query;
        };
      }
      return query;
    },
  };
}

// Finds the consent page's matching </div>, then expects the message paragraph next.
function messageFollowsPage(markup) {
  const open = markup.search(/<div\b[^>]*\bid=["']creator-consent-page["']/);
  if (open < 0) return false;
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = open;
  let depth = 0, tag;
  while ((tag = tags.exec(markup))) {
    depth += tag[0][1] === '/' ? -1 : 1;
    if (depth === 0) break;
  }
  if (!tag) return false;
  const rest = markup.slice(tags.lastIndex).replace(/^(\s|<!--[\s\S]*?-->)*/, '');
  return /^<p\b[^>]*\bid=["']creator-consent-message["']/.test(rest);
}

const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

let block = null;
const startAt = code.indexOf(START), endAt = code.indexOf(END);
if (startAt >= 0 && endAt > startAt) block = code.slice(startAt, endAt);

function harness({ demo = false, role = 'creator', user = USER_1, reply } = {}) {
  const dom = makeDocument();
  const ids = ['a-wizard', 'creator-consent-page', 'creator-consent-text', 'creator-consent-boxes',
    'creator-consent-submit', 'creator-consent-decline', 'creator-consent-message'];
  const el = {};
  for (const id of ids) el[id] = dom.document.getElementById(id);
  el['a-wizard'].style.display = 'none';
  el['creator-consent-page'].style.display = 'none';
  // The message sits beside the page, not inside it, so it shows while the page is hidden.
  for (const id of ['creator-consent-text', 'creator-consent-boxes', 'creator-consent-submit', 'creator-consent-decline']) {
    el['creator-consent-page'].appendChild(el[id]);
  }
  el['creator-consent-submit'].tagName = 'BUTTON';
  el['creator-consent-decline'].tagName = 'BUTTON';
  const client = makeClient(reply || (chain => ({ data: [], error: null })));
  const ctx = {
    console: { log() {}, error() {}, warn() {} }, Promise, JSON, Object, Array, String, Set, Map,
    DEMO_MODE: demo, currentRole: role, currentUserId: user,
    document: dom.document, window: {}, supabaseClient: client,
    alert() {}, confirm: () => true,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const visible = e => e.style.display !== 'none' && !e.hidden;
  const boxes = () => dom.descendants(el['creator-consent-boxes']).filter(c => c.tagName === 'INPUT' && c.type === 'checkbox');
  const reads = () => client.chains.filter(c => c.table === 'creator_consent' && !c.steps.some(s => s.method === 'insert'));
  const inserts = () => client.chains.filter(c => c.steps.some(s => s.method === 'insert'));
  return {
    ctx, el, client, visible, boxes, reads, inserts,
    open: () => ctx.openCreateExampleTab(),
    message: () => el['creator-consent-message'].textContent.trim(),
    wizardShown: () => visible(el['a-wizard']),
    formShown: () => visible(el['creator-consent-page']),
    constant: name => vm.runInContext(name, ctx),
  };
}

async function scenario(name, run) {
  try { await run(); } catch (e) { check(name, false, 'threw ' + (e && e.message)); }
}

const noRow = () => ({ data: [], error: null });
const hasRow = () => ({ data: [{ id: 'c1' }], error: null });
// Reads get `read`, inserts get `write`.
const route = (read, write) => chain => chain.steps.some(s => s.method === 'insert') ? write(chain) : read(chain);

(async () => {
  // ---------- index.html ----------
  const tab4Start = html.indexOf('id="tab4"');
  const tab5Start = html.indexOf('id="tab5"');
  const tab4 = tab4Start >= 0 ? html.slice(tab4Start, tab5Start > tab4Start ? tab5Start : undefined) : '';
  check('index.html has tab4', tab4.length > 0);
  check('wizard has id a-wizard, class wizard, and starts hidden',
    /<div\b(?=[^>]*\bid=["']a-wizard["'])(?=[^>]*\bclass=["'][^"']*\bwizard\b)(?=[^>]*\bstyle=["'][^"']*display\s*:\s*none)[^>]*>/.test(tab4));
  check('consent page starts hidden inside tab4',
    /<div\b(?=[^>]*\bid=["']creator-consent-page["'])(?=[^>]*\bstyle=["'][^"']*display\s*:\s*none)[^>]*>/.test(tab4));
  for (const id of ['creator-consent-text', 'creator-consent-boxes', 'creator-consent-submit', 'creator-consent-decline', 'creator-consent-message']) {
    check(`tab4 has #${id}`, new RegExp(`id=["']${id}["']`).test(tab4));
  }
  check('consent page heading', /<h3[^>]*>\s*Creator Consent Form\s*<\/h3>/.test(tab4));
  check('consent page comes after the Create Example heading',
    tab4.indexOf('Create Example</h2>') >= 0 && tab4.indexOf('creator-consent-page') > tab4.indexOf('Create Example</h2>'));
  const textBlock = tab4.match(/id=["']creator-consent-text["'][^>]*>([\s\S]*?)<\/div>/);
  check('consent text holds the exact placeholder', !!textBlock && textBlock[1].trim() === PLACEHOLDER, textBlock ? textBlock[1].trim() : 'missing');
  check('submit button reads I consent', /<button\b[^>]*id=["']creator-consent-submit["'][^>]*>\s*I consent\s*<\/button>/.test(tab4));
  check('decline button reads I do not consent', /<button\b[^>]*id=["']creator-consent-decline["'][^>]*>\s*I do not consent\s*<\/button>/.test(tab4));
  check('message paragraph exists', /<p\b[^>]*id=["']creator-consent-message["'][^>]*>\s*<\/p>/.test(tab4));
  check('message paragraph sits directly after the consent page, outside it', messageFollowsPage(tab4), 'message is inside the page or not next to it');

  // ---------- tab4 click handlers ----------
  for (const site of ['checkLoginStatus', 'bootDemo']) {
    const start = code.search(new RegExp(`(async )?function ${site}\\(`));
    const next = code.indexOf('\nfunction ', start + 10);
    const nextAsync = code.indexOf('\nasync function ', start + 10);
    const end = Math.min(next < 0 ? code.length : next, nextAsync < 0 ? code.length : nextAsync);
    const source = start >= 0 ? code.slice(start, end) : '';
    const listener = source.match(/document\.getElementById\(["']tab4-btn["']\)\.addEventListener\([\s\S]*?\}\);/);
    const calls = [];
    const dom = makeDocument();
    const ctx = {
      document: dom.document,
      openTab: id => calls.push('openTab:' + id),
      a_wireWizardOnce: () => calls.push('wire'),
      openCreateExampleTab: () => { calls.push('consent'); return Promise.resolve(); },
    };
    vm.createContext(ctx);
    try {
      if (listener) vm.runInContext(listener[0], ctx);
      await dom.document.getElementById('tab4-btn').click();
    } catch (e) { calls.push('threw ' + e.message); }
    check(`${site} tab4 click opens tab4 then calls openCreateExampleTab once`,
      !!listener && calls[0] === 'openTab:tab4' && calls.filter(c => c === 'consent').length === 1, calls.join(', ') || 'no listener');
  }

  // ---------- the consent block ----------
  check('creator consent markers present in js/linguisticsFrontEnd.js', block !== null,
    `need "${START}" followed by "${END}"`);
  if (block === null) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }

  await scenario('constants', async () => {
    const h = harness();
    check('form version constant', h.constant('CREATOR_CONSENT_FORM_VERSION') === VERSION);
    check('declined message constant', h.constant('CREATOR_CONSENT_DECLINED_MESSAGE') === DECLINED);
    const boxes = h.constant('CREATOR_CONSENT_BOXES');
    check('two placeholder boxes keyed box1 and box2',
      Array.isArray(boxes) && boxes.length === 2 && boxes[0].key === 'box1' && boxes[1].key === 'box2'
      && boxes.every(b => typeof b.label === 'string' && b.label.includes('PLACEHOLDER')), JSON.stringify(boxes));
  });

  await scenario('demo skips the gate', async () => {
    const h = harness({ demo: true });
    await h.open(); await tick();
    check('demo shows the wizard, hides the form, makes no db call',
      h.wizardShown() && !h.formShown() && h.client.chains.length === 0, `calls ${h.client.chains.length}`);
    await h.ctx.submitCreatorConsent(); await tick();
    check('demo submit never writes', h.inserts().length === 0 && h.client.chains.length === 0);
  });

  await scenario('admin skips the gate', async () => {
    const h = harness({ role: 'admin' });
    await h.open(); await tick();
    check('admin shows the wizard, hides the form, makes no db call',
      h.wizardShown() && !h.formShown() && h.client.chains.length === 0, `calls ${h.client.chains.length}`);
  });

  await scenario('no consent row shows the form', async () => {
    const h = harness({ reply: route(noRow, noRow) });
    await h.open(); await tick();
    const read = h.reads()[0];
    const eqs = read ? read.steps.filter(s => s.method === 'eq').map(s => s.args.join('=')) : [];
    check('check reads creator_consent for this user and version',
      !!read && read.steps.some(s => s.method === 'select') && eqs.includes(`user_id=${USER_1}`) && eqs.includes(`form_version=${VERSION}`),
      JSON.stringify(read));
    check('form shown, wizard hidden', h.formShown() && !h.wizardShown());
    check('one unticked checkbox per box', h.boxes().length === 2 && h.boxes().every(b => !b.checked), `${h.boxes().length} boxes`);
    const boxText = h.el['creator-consent-boxes'].textContent;
    check('box labels are rendered', h.constant('CREATOR_CONSENT_BOXES').every(b => boxText.includes(b.label)), boxText);
    check('both buttons enabled and visible, message empty',
      !h.el['creator-consent-submit'].disabled && !h.el['creator-consent-decline'].disabled
      && h.visible(h.el['creator-consent-submit']) && h.visible(h.el['creator-consent-decline']) && h.message() === '');
  });

  await scenario('existing consent row shows the wizard', async () => {
    const h = harness({ reply: route(hasRow, noRow) });
    await h.open(); await tick();
    check('row found: wizard shown, form hidden', h.wizardShown() && !h.formShown());
    const before = h.client.chains.length;
    await h.open(); await tick();
    check('second click makes no db call', h.client.chains.length === before && h.wizardShown(), `calls ${h.client.chains.length - before}`);
  });

  await scenario('check error fails closed', async () => {
    const h = harness({ reply: route(() => ({ data: null, error: { message: 'boom', code: '500' } }), noRow) });
    await h.open(); await tick();
    check('check error keeps wizard and form hidden, shows a visible message',
      !h.wizardShown() && !h.formShown() && h.message().length > 0 && h.visible(h.el['creator-consent-message']), h.message());
  });

  await scenario('submit with an unticked box', async () => {
    const h = harness({ reply: route(noRow, noRow) });
    await h.open(); await tick();
    await h.el['creator-consent-submit'].click(); await tick();
    check('no box ticked: no insert, message shown', h.inserts().length === 0 && h.message().length > 0, h.message());
    h.boxes()[0].checked = true;
    await h.el['creator-consent-submit'].click(); await tick();
    check('one box ticked: no insert, wizard hidden', h.inserts().length === 0 && !h.wizardShown() && h.message().length > 0);
  });

  await scenario('submit inserts the exact row once', async () => {
    const pending = deferred();
    const h = harness({ reply: route(noRow, () => pending.promise) });
    await h.open(); await tick();
    h.boxes().forEach(b => { b.checked = true; });
    const first = h.el['creator-consent-submit'].click();
    await tick();
    check('submit is disabled while saving', h.el['creator-consent-submit'].disabled === true);
    const second = h.el['creator-consent-submit'].click();
    await tick();
    pending.resolve({ data: null, error: null });
    await first; await second; await tick();
    const writes = h.inserts();
    check('double click inserts once', writes.length === 1, `${writes.length} inserts`);
    const insert = writes[0] && writes[0].steps.find(s => s.method === 'insert');
    const expected = { user_id: USER_1, form_version: VERSION, answers: { box1: true, box2: true } };
    const sent = insert && (Array.isArray(insert.args[0]) ? insert.args[0][0] : insert.args[0]);
    check('insert goes to creator_consent with the exact row',
      !!writes[0] && writes[0].table === 'creator_consent' && JSON.stringify(sent) === JSON.stringify(expected), JSON.stringify(sent));
    check('insert has no select chained', !!writes[0] && !writes[0].steps.some(s => s.method === 'select'),
      writes[0] ? writes[0].steps.map(s => s.method).join('.') : '');
    check('success shows the wizard and hides the form', h.wizardShown() && !h.formShown());
    const before = h.client.chains.length;
    await h.open(); await tick();
    check('after consenting, the next click makes no db call', h.client.chains.length === before && h.wizardShown());
  });

  await scenario('duplicate consent counts as consented', async () => {
    const h = harness({ reply: route(noRow, () => ({ data: null, error: { code: '23505', message: 'duplicate key' } })) });
    await h.open(); await tick();
    h.boxes().forEach(b => { b.checked = true; });
    await h.el['creator-consent-submit'].click(); await tick();
    check('23505 shows the wizard and hides the form', h.wizardShown() && !h.formShown());
  });

  await scenario('other insert error stays on the form', async () => {
    const h = harness({ reply: route(noRow, () => ({ data: null, error: { code: '42501', message: 'denied' } })) });
    await h.open(); await tick();
    h.boxes().forEach(b => { b.checked = true; });
    await h.el['creator-consent-submit'].click(); await tick();
    check('insert error keeps the form, hides the wizard, shows a message, re-enables submit',
      h.formShown() && !h.wizardShown() && h.message().length > 0 && !h.el['creator-consent-submit'].disabled, h.message());
  });

  await scenario('decline saves nothing', async () => {
    const h = harness({ reply: route(noRow, noRow) });
    await h.open(); await tick();
    const before = h.client.chains.length;
    await h.el['creator-consent-decline'].click(); await tick();
    check('decline makes no db call', h.client.chains.length === before && h.inserts().length === 0);
    check('decline shows the exact message', h.message() === DECLINED, h.message());
    const boxesGone = !h.visible(h.el['creator-consent-boxes']) || h.boxes().length === 0;
    check('decline hides the boxes and both buttons, wizard stays hidden',
      boxesGone && !h.visible(h.el['creator-consent-submit']) && !h.visible(h.el['creator-consent-decline']) && !h.wizardShown());
    await h.open(); await tick();
    check('a later click checks again and shows the form again',
      h.reads().length === 2 && h.formShown() && h.visible(h.el['creator-consent-boxes']) && h.boxes().length === 2
      && h.boxes().every(b => !b.checked) && h.visible(h.el['creator-consent-submit'])
      && h.visible(h.el['creator-consent-decline']) && h.message() === '', `reads ${h.reads().length}, message "${h.message()}"`);
  });

  await scenario('stale check cannot override a newer one', async () => {
    const answers = [];
    const h = harness({ reply: route(() => { const d = deferred(); answers.push(d); return d.promise; }, noRow) });
    const older = h.open(); await tick();
    const newer = h.open(); await tick();
    answers[1].resolve(noRow()); await newer; await tick();
    answers[0].resolve(hasRow()); await older; await tick();
    check('older row answer does not replace the newer form', answers.length === 2 && h.formShown() && !h.wizardShown());

    const answers2 = [];
    const h2 = harness({ reply: route(() => { const d = deferred(); answers2.push(d); return d.promise; }, noRow) });
    const older2 = h2.open(); await tick();
    const newer2 = h2.open(); await tick();
    answers2[1].resolve(hasRow()); await newer2; await tick();
    answers2[0].resolve({ data: null, error: { message: 'late failure' } }); await older2; await tick();
    check('older error does not hide the newer wizard', answers2.length === 2 && h2.wizardShown() && h2.message() === '', h2.message());
  });

  await scenario('successful submit outranks an older in-flight check', async () => {
    const save = deferred(), lateCheck = deferred();
    let readCount = 0;
    const read = () => { readCount++; return readCount === 1 ? noRow() : lateCheck.promise; };
    const h = harness({ reply: route(read, () => save.promise) });
    await h.open(); await tick();
    h.boxes().forEach(b => { b.checked = true; });
    const submitting = h.el['creator-consent-submit'].click(); await tick();
    const reopening = h.open(); await tick();
    save.resolve({ data: null, error: null }); await submitting; await tick();
    lateCheck.resolve(noRow()); await reopening; await tick();
    check('older check answering no row does not re-show the form after consent',
      readCount === 2 && h.wizardShown() && !h.formShown(), `reads ${readCount}`);
  });

  await scenario('cached consent is per user', async () => {
    const h = harness({ reply: route(hasRow, noRow) });
    await h.open(); await tick();
    h.ctx.currentUserId = USER_2;
    const second = makeClient(route(noRow, noRow));
    h.ctx.supabaseClient = second;
    await h.open(); await tick();
    const read = second.chains[0];
    const eqs = read ? read.steps.filter(s => s.method === 'eq').map(s => s.args.join('=')) : [];
    check('another user is checked again by their own id', eqs.includes(`user_id=${USER_2}`), JSON.stringify(read));
    check('another user without consent sees the form', h.formShown() && !h.wizardShown());
  });

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
