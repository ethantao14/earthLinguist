// Run: node test/recording_consent.test.js
// No framework on purpose. Runs the recording consent block of the front end in a
// vm with a fake DOM and a stubbed Supabase client that records every call.
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2] || __dirname + '/../js/linguisticsFrontEnd.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');

const START = '// ===== Recording consent';
const END = '// ===== End recording consent';
const VERSION = 'placeholder-v1';
const DECLINED = 'Sorry, we cannot let you record without consent.';
const PLACEHOLDER = "[PLACEHOLDER: paste Tom's Recording Consent Form text here. Do not edit this wording without IRB approval.]";
const USER_1 = 'u0000000-0000-0000-0000-000000000001';
const USER_2 = 'u0000000-0000-0000-0000-000000000002';
const ALL_TRUE = { box1: true, box2: true };
const MISSING_CONSENT = 'Consent for the person being recorded is missing. Please choose who you are recording again.';

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`pass  ${name}`);
  else { console.log(`FAIL  ${name}${detail ? ': ' + detail : ''}`); failures++; }
}

// Compares JSON values without caring about key order.
function sameJson(a, b) {
  const sorted = v => Array.isArray(v) ? v.map(sorted)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
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
  function thenable(chain) {
    let settled;
    return {
      then(yes, no) {
        settled ||= Promise.resolve(reply(chain));
        return settled.then(yes, no);
      },
    };
  }
  return {
    chains,
    from(table) {
      const chain = { table, steps: [] };
      chains.push(chain);
      const query = thenable(chain);
      for (const method of ['select', 'eq', 'is', 'limit', 'insert', 'maybeSingle', 'single', 'order', 'upsert', 'update', 'delete']) {
        query[method] = (...args) => {
          chain.steps.push({ method, args: JSON.parse(JSON.stringify(args)) });
          return query;
        };
      }
      return query;
    },
    rpc(name, args) {
      const chain = { table: null, rpc: name, steps: [{ method: 'rpc', args: JSON.parse(JSON.stringify([name, args])) }] };
      chains.push(chain);
      return thenable(chain);
    },
  };
}

// Finds the consent page's matching </div>, then expects the message paragraph next.
function messageFollowsPage(markup) {
  const open = markup.search(/<div\b[^>]*\bid=["']recording-consent-page["']/);
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
  return /^<p\b[^>]*\bid=["']recording-consent-message["']/.test(rest);
}

// The opening tag of the element with this id, or ''.
function openingTag(markup, id) {
  const found = markup.match(new RegExp(`<[a-z0-9]+\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
  return found ? found[0] : '';
}
const startsHidden = tag => /\bstyle=["'][^"']*display\s*:\s*none/i.test(tag);

const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

let block = null;
const startAt = code.indexOf(START), endAt = code.indexOf(END);
if (startAt >= 0 && endAt > startAt) block = code.slice(startAt, endAt);

const IDS = ['record-wizard', 'recording-mode-page', 'recording-mode-self', 'recording-mode-other',
  'recording-consent-page', 'recording-consent-text', 'recording-subject-wrap', 'recording-subject-name',
  'recording-consent-boxes', 'recording-consent-submit', 'recording-consent-decline', 'recording-consent-message',
  'recording-mode-change'];

function harness({ demo = false, role = 'recorder', user = USER_1, reply } = {}) {
  const dom = makeDocument();
  const el = {};
  for (const id of IDS) el[id] = dom.document.getElementById(id);
  for (const id of ['record-wizard', 'recording-mode-page', 'recording-consent-page', 'recording-subject-wrap', 'recording-mode-change']) {
    el[id].style.display = 'none';
  }
  el['recording-mode-page'].append(el['recording-mode-self'], el['recording-mode-other']);
  el['recording-subject-wrap'].appendChild(el['recording-subject-name']);
  // The message sits beside the page, not inside it, so it shows while the page is hidden.
  el['recording-consent-page'].append(el['recording-consent-text'], el['recording-subject-wrap'],
    el['recording-consent-boxes'], el['recording-consent-submit'], el['recording-consent-decline']);
  for (const id of ['recording-mode-self', 'recording-mode-other', 'recording-consent-submit', 'recording-consent-decline', 'recording-mode-change']) {
    el[id].tagName = 'BUTTON';
  }
  el['recording-subject-name'].tagName = 'INPUT';
  el['recording-subject-name'].type = 'text';
  const client = makeClient(reply || (() => ({ data: [], error: null })));
  let idCount = 0;
  const ctx = {
    console: { log() {}, error() {}, warn() {} }, Promise, JSON, Object, Array, String, Set, Map,
    DEMO_MODE: demo, currentRole: role, currentUserId: user,
    document: dom.document, window: {}, supabaseClient: client,
    newId: () => `id-${++idCount}`,
    alert() {}, confirm: () => true,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  // Shown means neither the element nor any ancestor is hidden.
  const visible = e => { for (let n = e; n; n = n.parentNode) if (n.style.display === 'none' || n.hidden) return false; return true; };
  const boxes = () => dom.descendants(el['recording-consent-boxes']).filter(c => c.tagName === 'INPUT' && c.type === 'checkbox');
  const reads = () => client.chains.filter(c => c.table === 'recording_consent' && !c.steps.some(s => s.method === 'insert'));
  const inserts = () => client.chains.filter(c => c.steps.some(s => s.method === 'insert'));
  const rpcs = () => client.chains.filter(c => c.rpc);
  const h = {
    ctx, el, client, visible, boxes, reads, inserts, rpcs,
    open: () => ctx.openRecordTab(),
    pickSelf: () => el['recording-mode-self'].click(),
    pickOther: () => el['recording-mode-other'].click(),
    submit: () => el['recording-consent-submit'].click(),
    decline: () => el['recording-consent-decline'].click(),
    tickAll: () => h.boxes().forEach(b => { b.checked = true; }),
    message: () => el['recording-consent-message'].textContent.trim(),
    wizardShown: () => visible(el['record-wizard']),
    modeShown: () => visible(el['recording-mode-page']),
    formShown: () => visible(el['recording-consent-page']),
    nameShown: () => visible(el['recording-subject-wrap']) && visible(el['recording-subject-name']),
    value: name => vm.runInContext(name, ctx),
    // Wizard only: no mode page, no consent page.
    changeShown: () => visible(el['recording-mode-change']),
    change: () => el['recording-mode-change'].click(),
    // The change button shows exactly when the wizard does (outside demo mode).
    onlyWizard: () => h.wizardShown() && h.changeShown() && !h.modeShown() && !h.formShown(),
    onlyMode: () => h.modeShown() && !h.wizardShown() && !h.formShown() && !h.changeShown(),
    onlyForm: () => h.formShown() && !h.wizardShown() && !h.modeShown() && !h.changeShown(),
  };
  return h;
}

async function scenario(name, run) {
  try { await run(); } catch (e) { check(name, false, 'threw ' + (e && e.message)); }
}

const noRow = () => ({ data: [], error: null });
const hasRow = () => ({ data: [{ id: 'c1' }], error: null });
const ok = () => ({ data: null, error: null });
// Reads get `read`, inserts and rpc calls get `write`.
const route = (read, write) => chain => chain.rpc || chain.steps.some(s => s.method === 'insert') ? write(chain) : read(chain);
const SESSION = { id: 's-1', example_id: 'e-1', language: 'Miyako', user: 'Rita', verification_status: false };

// Picks "someone else", fills the name and ticks every box, then submits.
async function consentForOther(h, name = '  Ana Lopez  ') {
  await h.open(); await tick();
  await h.pickOther(); await tick();
  h.el['recording-subject-name'].value = name;
  h.tickAll();
  await h.submit(); await tick();
}

(async () => {
  // ---------- index.html ----------
  const tab3Start = html.indexOf('id="tab3"');
  const tab4Start = html.indexOf('id="tab4"');
  const tab3 = tab3Start >= 0 ? html.slice(tab3Start, tab4Start > tab3Start ? tab4Start : undefined) : '';
  check('index.html has tab3', tab3.length > 0);
  const wizardTag = openingTag(tab3, 'record-wizard');
  // A class token of exactly "wizard", so "wizard-buttons" does not count.
  const wizardClass = /\bclass=["'](?:[^"']*\s)?wizard(?:\s[^"']*)?["']/g;
  check('tab3 wizard has id record-wizard, class wizard, and starts hidden',
    new RegExp(wizardClass.source).test(wizardTag) && startsHidden(wizardTag), wizardTag || 'missing');
  check('tab3 has no other wizard', (tab3.match(wizardClass) || []).length === 1);
  for (const id of ['recording-mode-page', 'recording-consent-page', 'recording-subject-wrap']) {
    const tag = openingTag(tab3, id);
    check(`#${id} is a div that starts hidden inside tab3`, /^<div\b/i.test(tag) && startsHidden(tag), tag || 'missing');
  }
  for (const id of IDS) check(`tab3 has #${id}`, openingTag(tab3, id) !== '');
  const heading = tab3.indexOf('Record Clips</h2>');
  check('wizard, mode page and consent page come after the Record Clips heading',
    heading >= 0 && ['record-wizard', 'recording-mode-page', 'recording-consent-page'].every(id => tab3.indexOf(openingTag(tab3, id)) > heading));
  check('mode page asks who is being recorded', /id=["']recording-mode-page["'][^>]*>\s*<p[^>]*>\s*Who are you recording\?\s*<\/p>/.test(tab3));
  check('self button reads Recording myself', /<button\b[^>]*id=["']recording-mode-self["'][^>]*>\s*Recording myself\s*<\/button>/.test(tab3));
  check('other button reads Recording for someone else', /<button\b[^>]*id=["']recording-mode-other["'][^>]*>\s*Recording for someone else\s*<\/button>/.test(tab3));
  check('consent page heading', /<h3[^>]*>\s*Recording Consent Form\s*<\/h3>/.test(tab3));
  const textBlock = tab3.match(/id=["']recording-consent-text["'][^>]*>([\s\S]*?)<\/div>/);
  check('consent text holds the exact placeholder', !!textBlock && textBlock[1].trim() === PLACEHOLDER, textBlock ? textBlock[1].trim() : 'missing');
  check('name label points at the name input',
    /<label\b[^>]*for=["']recording-subject-name["'][^>]*>\s*Name of the person being recorded\s*<\/label>/.test(tab3));
  const nameTag = openingTag(tab3, 'recording-subject-name');
  check('name input is a text input capped at 100',
    /^<input\b/i.test(nameTag) && /\btype=["']text["']/.test(nameTag) && /\bmaxlength=["']100["']/.test(nameTag), nameTag || 'missing');
  const changeTag = openingTag(tab3, 'recording-mode-change');
  check('change button is a button that starts hidden', /^<button\b/i.test(changeTag) && startsHidden(changeTag), changeTag || 'missing');
  check('change button reads Change who I\'m recording',
    /<button\b[^>]*id=["']recording-mode-change["'][^>]*>\s*Change who I'm recording\s*<\/button>/.test(tab3));
  const afterChange = changeTag ? tab3.slice(tab3.indexOf(changeTag)).replace(/^<button\b[^>]*>[\s\S]*?<\/button>/i, '').replace(/^(\s|<!--[\s\S]*?-->)*/, '') : '';
  check('change button sits directly before record-wizard, outside it', afterChange.startsWith(wizardTag) && wizardTag !== '');
  check('submit button reads I consent', /<button\b[^>]*id=["']recording-consent-submit["'][^>]*>\s*I consent\s*<\/button>/.test(tab3));
  check('decline button reads I do not consent', /<button\b[^>]*id=["']recording-consent-decline["'][^>]*>\s*I do not consent\s*<\/button>/.test(tab3));
  check('message paragraph exists and is empty', /<p\b[^>]*id=["']recording-consent-message["'][^>]*>\s*<\/p>/.test(tab3));
  check('message paragraph sits directly after the consent page, outside it', messageFollowsPage(tab3), 'message is inside the page or not next to it');

  // ---------- tab3 click handlers ----------
  for (const site of ['checkLoginStatus', 'bootDemo']) {
    const start = code.search(new RegExp(`(async )?function ${site}\\(`));
    const next = code.indexOf('\nfunction ', start + 10);
    const nextAsync = code.indexOf('\nasync function ', start + 10);
    const end = Math.min(next < 0 ? code.length : next, nextAsync < 0 ? code.length : nextAsync);
    const source = start >= 0 ? code.slice(start, end) : '';
    const listener = source.match(/document\.getElementById\(["']tab3-btn["']\)\.addEventListener\([\s\S]*?\}\);/);
    const calls = [];
    const dom = makeDocument();
    const ctx = {
      document: dom.document,
      openTab: id => calls.push('openTab:' + id),
      openRecordTab: () => { calls.push('consent'); return Promise.resolve(); },
    };
    vm.createContext(ctx);
    try {
      if (listener) vm.runInContext(listener[0], ctx);
      await dom.document.getElementById('tab3-btn').click();
    } catch (e) { calls.push('threw ' + e.message); }
    check(`${site} tab3 click opens tab3 then calls openRecordTab once`,
      !!listener && calls[0] === 'openTab:tab3' && calls.filter(c => c === 'consent').length === 1, calls.join(', ') || 'no listener');
  }

  // ---------- Step 3 submit handler ----------
  const submitStart = code.search(/document\.getElementById\(["']submit-recordings-btn["']\)\.addEventListener\(["']click["']/);
  const submitEnd = submitStart >= 0 ? code.indexOf('\n});', submitStart) : -1;
  const submitSource = submitStart >= 0 && submitEnd > submitStart ? code.slice(submitStart, submitEnd) : '';
  check('Step 3 submit handler found', submitSource.length > 0);
  const insertCall = submitSource.match(/await\s+insertRecordingSession\(\s*\{([\s\S]*?)\}\s*\)/);
  check('Step 3 submit awaits insertRecordingSession with the session fields',
    !!insertCall && ['id', 'example_id', 'language', 'user', 'verification_status'].every(f => new RegExp(`(^|[\\s,{])${f}\\s*(:|,|$)`).test(insertCall[1].trim())),
    insertCall ? insertCall[0] : 'no call');
  check('Step 3 submit no longer inserts into recording_session directly',
    !/from\(\s*["']recording_session["']\s*\)\s*\.insert/.test(submitSource));
  const savedAt = submitSource.indexOf('All recordings saved');
  const finishAt = submitSource.indexOf('finishRecordingSubmission()', savedAt);
  check('Step 3 submit calls finishRecordingSubmission after All recordings saved', savedAt >= 0 && finishAt > savedAt);
  check('Step 3 submit calls finishRecordingSubmission once', (submitSource.match(/finishRecordingSubmission\(/g) || []).length === 1);

  // ---------- the consent block ----------
  check('recording consent markers present in js/linguisticsFrontEnd.js', block !== null,
    `need "${START}" followed by "${END}"`);
  if (block === null) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }

  await scenario('constants', async () => {
    const h = harness();
    check('form version constant', h.value('RECORDING_CONSENT_FORM_VERSION') === VERSION);
    check('declined message constant', h.value('RECORDING_CONSENT_DECLINED_MESSAGE') === DECLINED);
    const boxes = h.value('RECORDING_CONSENT_BOXES');
    check('two placeholder boxes keyed box1 and box2',
      Array.isArray(boxes) && boxes.length === 2 && boxes[0].key === 'box1' && boxes[1].key === 'box2'
      && boxes.every(b => typeof b.label === 'string' && b.label.includes('PLACEHOLDER')), JSON.stringify(boxes));
    check('starts with no mode and no pending consent', h.value('recordingMode') === null && h.value('pendingOtherConsent') === null);
  });

  await scenario('demo skips everything', async () => {
    const h = harness({ demo: true });
    await h.open(); await tick();
    check('demo shows the wizard, hides mode page, consent page and change button, no db call',
      h.wizardShown() && !h.modeShown() && !h.formShown() && !h.changeShown() && h.client.chains.length === 0, `calls ${h.client.chains.length}`);
    await h.ctx.chooseRecordingMode('self'); await tick();
    await h.ctx.submitRecordingConsent(); await tick();
    check('demo never calls the db', h.client.chains.length === 0, `calls ${h.client.chains.length}`);
  });

  await scenario('first open asks who is being recorded', async () => {
    const h = harness();
    await h.open(); await tick();
    check('mode choice shown, wizard and form hidden, no db call', h.onlyMode() && h.client.chains.length === 0);
    const admin = harness({ role: 'admin' });
    await admin.open(); await tick();
    check('admins also see the mode choice first', admin.onlyMode() && admin.client.chains.length === 0);
  });

  await scenario('self without a consent row shows the form', async () => {
    const h = harness({ reply: route(noRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    const read = h.reads()[0];
    const steps = read ? read.steps : [];
    const eqs = steps.filter(s => s.method === 'eq').map(s => s.args.join('='));
    check('check reads recording_consent for this user, version and self rows only',
      h.reads().length === 1 && steps.some(s => s.method === 'select' && s.args[0] === 'id')
      && eqs.includes(`user_id=${USER_1}`) && eqs.includes(`form_version=${VERSION}`)
      && steps.some(s => s.method === 'is' && s.args[0] === 'subject_name' && s.args[1] === null)
      && steps.some(s => s.method === 'limit' && s.args[0] === 1), JSON.stringify(read));
    check('form shown alone', h.onlyForm());
    check('name field hidden for self', !h.nameShown());
    check('one unticked checkbox per box', h.boxes().length === 2 && h.boxes().every(b => !b.checked), `${h.boxes().length} boxes`);
    const boxText = h.el['recording-consent-boxes'].textContent;
    check('box labels are rendered', h.value('RECORDING_CONSENT_BOXES').every(b => boxText.includes(b.label)), boxText);
    check('both buttons enabled and visible, message empty',
      !h.el['recording-consent-submit'].disabled && !h.el['recording-consent-decline'].disabled
      && h.visible(h.el['recording-consent-submit']) && h.visible(h.el['recording-consent-decline']) && h.message() === '');
  });

  await scenario('self with a consent row shows the wizard', async () => {
    const h = harness({ reply: route(hasRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    check('row found: only the wizard shows', h.onlyWizard() && h.value('recordingMode') === 'self');
    const before = h.client.chains.length;
    await h.open(); await tick();
    check('second open makes no db call and goes straight to the wizard',
      h.client.chains.length === before && h.onlyWizard(), `calls ${h.client.chains.length - before}`);
  });

  await scenario('cached self consent is per user', async () => {
    const h = harness({ reply: route(hasRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    h.ctx.currentUserId = USER_2;
    const second = makeClient(route(noRow, ok));
    h.ctx.supabaseClient = second;
    await h.open(); await tick();
    check('another user is asked for the mode again', h.onlyMode() && second.chains.length === 0);
    await h.pickSelf(); await tick();
    const read = second.chains[0];
    const eqs = read ? read.steps.filter(s => s.method === 'eq').map(s => s.args.join('=')) : [];
    check('another user is checked by their own id', eqs.includes(`user_id=${USER_2}`), JSON.stringify(read));
    check('another user without consent sees the form', h.onlyForm());
  });

  await scenario('self check error fails closed', async () => {
    const h = harness({ reply: route(() => ({ data: null, error: { message: 'boom', code: '500' } }), ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    check('check error keeps wizard and form hidden and shows a visible message',
      !h.wizardShown() && !h.formShown() && h.message().length > 0 && h.visible(h.el['recording-consent-message']), h.message());
    check('check error does not set self mode', h.value('recordingMode') !== 'self');
  });

  await scenario('stale self check cannot override newer state', async () => {
    const answers = [];
    const held = () => { const d = deferred(); answers.push(d); return d.promise; };
    const h = harness({ reply: route(held, ok) });
    await h.open(); await tick();
    const older = h.pickSelf(); await tick();
    const newer = h.ctx.chooseRecordingMode('self'); await tick();
    answers[1].resolve(noRow()); await newer; await tick();
    answers[0].resolve(hasRow()); await older; await tick();
    check('older row answer does not replace the newer form', answers.length === 2 && h.onlyForm() && h.value('recordingMode') !== 'self');

    const answers2 = [];
    const h2 = harness({ reply: route(() => { const d = deferred(); answers2.push(d); return d.promise; }, ok) });
    await h2.open(); await tick();
    const older2 = h2.pickSelf(); await tick();
    const newer2 = h2.ctx.chooseRecordingMode('self'); await tick();
    answers2[1].resolve(hasRow()); await newer2; await tick();
    answers2[0].resolve({ data: null, error: { message: 'late failure' } }); await older2; await tick();
    check('older error does not hide the newer wizard', answers2.length === 2 && h2.onlyWizard() && h2.message() === '', h2.message());

    // Choosing someone else is newer than a pending self check.
    const late = deferred();
    const h3 = harness({ reply: route(() => late.promise, ok) });
    await h3.open(); await tick();
    const pending = h3.pickSelf(); await tick();
    await h3.open(); await tick();
    await h3.pickOther(); await tick();
    late.resolve(hasRow()); await pending; await tick();
    check('late self answer does not replace the someone-else form',
      h3.onlyForm() && h3.nameShown() && h3.value('recordingMode') !== 'self', `mode ${h3.value('recordingMode')}`);
  });

  await scenario('self submit inserts the exact row once', async () => {
    const pending = deferred();
    const h = harness({ reply: route(noRow, () => pending.promise) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    h.tickAll();
    const first = h.submit(); await tick();
    check('submit is disabled while saving', h.el['recording-consent-submit'].disabled === true);
    const second = h.submit(); await tick();
    pending.resolve(ok());
    await first; await second; await tick();
    const writes = h.inserts();
    check('double click inserts once', writes.length === 1 && h.rpcs().length === 0, `${writes.length} inserts`);
    const insert = writes[0] && writes[0].steps.find(s => s.method === 'insert');
    const sent = insert && (Array.isArray(insert.args[0]) ? insert.args[0][0] : insert.args[0]);
    const expected = { user_id: USER_1, form_version: VERSION, answers: ALL_TRUE };
    check('insert goes to recording_consent with the exact row',
      !!writes[0] && writes[0].table === 'recording_consent' && sameJson(sent, expected)
      && (!Array.isArray(insert.args[0]) || insert.args[0].length === 1), JSON.stringify(sent));
    check('insert has no select chained', !!writes[0] && !writes[0].steps.some(s => s.method === 'select'),
      writes[0] ? writes[0].steps.map(s => s.method).join('.') : '');
    check('success shows only the wizard in self mode', h.onlyWizard() && h.value('recordingMode') === 'self');
    const before = h.client.chains.length;
    await h.open(); await tick();
    check('after consenting, the next open makes no db call', h.client.chains.length === before && h.onlyWizard());
  });

  await scenario('duplicate self consent counts as consented', async () => {
    const h = harness({ reply: route(noRow, () => ({ data: null, error: { code: '23505', message: 'duplicate key' } })) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    h.tickAll();
    await h.submit(); await tick();
    check('23505 shows only the wizard in self mode', h.onlyWizard() && h.value('recordingMode') === 'self');
  });

  await scenario('other self insert error stays on the form', async () => {
    const h = harness({ reply: route(noRow, () => ({ data: null, error: { code: '42501', message: 'denied' } })) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    h.tickAll();
    await h.submit(); await tick();
    check('insert error keeps the form, shows a message, re-enables submit',
      h.onlyForm() && h.message().length > 0 && !h.el['recording-consent-submit'].disabled, h.message());
    check('insert error does not set self mode', h.value('recordingMode') !== 'self');
  });

  await scenario('successful self submit outranks an older in-flight check', async () => {
    const save = deferred(), lateCheck = deferred();
    let readCount = 0;
    const read = () => { readCount++; return readCount === 1 ? noRow() : lateCheck.promise; };
    const h = harness({ reply: route(read, () => save.promise) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    h.tickAll();
    const submitting = h.submit(); await tick();
    const rechecking = h.ctx.chooseRecordingMode('self'); await tick();
    save.resolve(ok()); await submitting; await tick();
    lateCheck.resolve(noRow()); await rechecking; await tick();
    check('older check answering no row does not re-show the form after consent',
      readCount === 2 && h.onlyWizard(), `reads ${readCount}`);
  });

  await scenario('self submit with an unticked box', async () => {
    const h = harness({ reply: route(noRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    await h.submit(); await tick();
    check('no box ticked: no insert, message shown', h.inserts().length === 0 && h.message().length > 0, h.message());
    h.boxes()[0].checked = true;
    await h.submit(); await tick();
    check('one box ticked: no insert, wizard hidden', h.inserts().length === 0 && !h.wizardShown() && h.message().length > 0);
  });

  await scenario('admin self skips the db', async () => {
    const h = harness({ role: 'admin' });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    check('admin self shows only the wizard with no db call',
      h.onlyWizard() && h.client.chains.length === 0 && h.value('recordingMode') === 'self', `calls ${h.client.chains.length}`);
  });

  await scenario('someone else always shows the form', async () => {
    for (const role of ['recorder', 'creator', 'admin']) {
      const h = harness({ role, reply: route(hasRow, ok) });
      await h.open(); await tick();
      await h.pickOther(); await tick();
      check(`${role}: other shows the form with an empty name field and no db call`,
        h.onlyForm() && h.nameShown() && h.el['recording-subject-name'].value === '' && h.client.chains.length === 0,
        `calls ${h.client.chains.length}`);
      check(`${role}: boxes unticked, buttons ready, message empty`,
        h.boxes().length === 2 && h.boxes().every(b => !b.checked) && !h.el['recording-consent-submit'].disabled
        && h.visible(h.el['recording-consent-submit']) && h.visible(h.el['recording-consent-decline']) && h.message() === '');
    }
    const h = harness({ reply: route(hasRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    const before = h.client.chains.length;
    await h.ctx.chooseRecordingMode('other'); await tick();
    check('after a self consent, other still shows the form with an empty name',
      h.onlyForm() && h.nameShown() && h.el['recording-subject-name'].value === '' && h.client.chains.length === before);
  });

  await scenario('someone else submit is blocked without a name or a box', async () => {
    const h = harness();
    await h.open(); await tick();
    await h.pickOther(); await tick();
    h.tickAll();
    h.el['recording-subject-name'].value = '   ';
    await h.submit(); await tick();
    check('blank name: no db call, message shown, wizard hidden',
      h.client.chains.length === 0 && h.message().length > 0 && !h.wizardShown() && h.value('pendingOtherConsent') === null, h.message());
    h.el['recording-subject-name'].value = 'Ana';
    h.boxes()[1].checked = false;
    await h.submit(); await tick();
    check('unticked box: no db call, message shown, wizard hidden',
      h.client.chains.length === 0 && h.message().length > 0 && !h.wizardShown() && h.value('pendingOtherConsent') === null, h.message());
  });

  await scenario('someone else submit saves nothing yet and shows the wizard', async () => {
    const h = harness();
    await consentForOther(h);
    check('other submit makes no db call', h.client.chains.length === 0, `calls ${h.client.chains.length}`);
    check('other submit shows only the wizard in other mode', h.onlyWizard() && h.value('recordingMode') === 'other');
    check('pending consent holds the trimmed name and all answers',
      sameJson(h.value('pendingOtherConsent'), { subjectName: 'Ana Lopez', answers: ALL_TRUE }), JSON.stringify(h.value('pendingOtherConsent')));
    await h.open(); await tick();
    check('reopening with a pending consent goes straight to the wizard', h.onlyWizard() && h.client.chains.length === 0);
  });

  await scenario('insertRecordingSession', async () => {
    const h = harness({ reply: route(noRow, ok) });
    await consentForOther(h);
    const result = await h.ctx.insertRecordingSession({ ...SESSION });
    const call = h.rpcs()[0];
    const expected = {
      p_session_id: SESSION.id, p_example_id: SESSION.example_id, p_language: SESSION.language, p_user: SESSION.user,
      p_subject_name: 'Ana Lopez', p_form_version: VERSION, p_answers: ALL_TRUE,
    };
    check('other mode calls the rpc once with the exact arguments',
      h.rpcs().length === 1 && call.rpc === 'submit_recording_session_for_other' && sameJson(call.steps[0].args[1], expected),
      call ? JSON.stringify(call.steps[0].args) : 'no rpc');
    check('other mode does not insert directly', h.inserts().length === 0);
    check('other mode returns an object with error null', !!result && result.error === null, JSON.stringify(result));

    const failing = harness({ reply: route(noRow, () => ({ data: null, error: { code: '42501', message: 'denied' } })) });
    await consentForOther(failing);
    const failed = await failing.ctx.insertRecordingSession({ ...SESSION });
    check('rpc error is returned to the caller', !!failed && !!failed.error && failed.error.code === '42501', JSON.stringify(failed));
    check('rpc error keeps the pending consent for a retry', failing.value('pendingOtherConsent') !== null && failing.value('recordingMode') === 'other');

    const self = harness({ reply: route(hasRow, ok) });
    await self.open(); await tick();
    await self.pickSelf(); await tick();
    const selfResult = await self.ctx.insertRecordingSession({ ...SESSION });
    const writes = self.inserts();
    const insert = writes[0] && writes[0].steps.find(s => s.method === 'insert');
    check('self mode inserts [row] into recording_session, no rpc',
      writes.length === 1 && writes[0].table === 'recording_session' && self.rpcs().length === 0
      && Array.isArray(insert.args[0]) && insert.args[0].length === 1 && sameJson(insert.args[0][0], SESSION),
      insert ? JSON.stringify(insert.args) : 'no insert');
    check('self mode insert has no select chained', !!writes[0] && !writes[0].steps.some(s => s.method === 'select'));
    check('self mode returns an object with error null', !!selfResult && selfResult.error === null, JSON.stringify(selfResult));

    const none = harness();
    await none.ctx.insertRecordingSession({ ...SESSION });
    const missing = harness();
    vm.runInContext("recordingMode = 'other'; pendingOtherConsent = null;", missing.ctx);
    const refused = await missing.ctx.insertRecordingSession({ ...SESSION });
    check('other mode without pending consent fails closed with the exact message and no db call',
      !!refused && !!refused.error && refused.error.message === MISSING_CONSENT && missing.client.chains.length === 0,
      JSON.stringify(refused) + ` calls ${missing.client.chains.length}`);

    check('no mode chosen: plain insert, no rpc',
      none.inserts().length === 1 && none.inserts()[0].table === 'recording_session' && none.rpcs().length === 0);
  });

  await scenario('finishRecordingSubmission', async () => {
    const h = harness();
    await consentForOther(h);
    await h.ctx.insertRecordingSession({ ...SESSION });
    h.ctx.finishRecordingSubmission();
    check('other mode: pending consent and mode cleared', h.value('pendingOtherConsent') === null && h.value('recordingMode') === null);
    await h.open(); await tick();
    check('next open asks for the mode again', h.onlyMode());
    await h.pickOther(); await tick();
    check('next someone-else form starts empty and unticked',
      h.onlyForm() && h.el['recording-subject-name'].value === '' && h.boxes().length === 2 && h.boxes().every(b => !b.checked));

    const self = harness({ reply: route(hasRow, ok) });
    await self.open(); await tick();
    await self.pickSelf(); await tick();
    self.ctx.finishRecordingSubmission();
    const before = self.client.chains.length;
    await self.open(); await tick();
    check('self mode: finishing leaves self mode alone', self.value('recordingMode') === 'self'
      && self.onlyWizard() && self.client.chains.length === before);
  });

  await scenario('decline saves nothing', async () => {
    for (const flow of ['self', 'other']) {
      const h = harness({ reply: route(noRow, ok) });
      await h.open(); await tick();
      await (flow === 'self' ? h.pickSelf() : h.pickOther()); await tick();
      h.el['recording-subject-name'].value = 'Ana';
      h.tickAll();
      const before = h.client.chains.length;
      await h.decline(); await tick();
      check(`${flow}: decline makes no db call`, h.client.chains.length === before && h.inserts().length === 0 && h.rpcs().length === 0);
      check(`${flow}: decline shows the exact message`, h.message() === DECLINED && h.visible(h.el['recording-consent-message']), h.message());
      const boxesGone = !h.visible(h.el['recording-consent-boxes']) || h.boxes().length === 0;
      check(`${flow}: decline hides boxes, name field and both buttons, wizard stays hidden`,
        boxesGone && !h.nameShown() && !h.visible(h.el['recording-consent-submit'])
        && !h.visible(h.el['recording-consent-decline']) && !h.wizardShown());
      check(`${flow}: decline clears mode and pending consent`, h.value('recordingMode') === null && h.value('pendingOtherConsent') === null);
      await h.open(); await tick();
      check(`${flow}: next open shows the mode choice again with the message cleared`, h.onlyMode() && h.message() === '', h.message());
      await (flow === 'self' ? h.pickSelf() : h.pickOther()); await tick();
      check(`${flow}: choosing again shows a fresh form`,
        h.onlyForm() && h.boxes().length === 2 && h.boxes().every(b => !b.checked) && h.visible(h.el['recording-consent-boxes'])
        && h.visible(h.el['recording-consent-submit']) && h.visible(h.el['recording-consent-decline']) && h.message() === '');
    }
  });

  await scenario('change who is being recorded', async () => {
    const h = harness({ reply: route(hasRow, ok) });
    await h.open(); await tick();
    await h.pickSelf(); await tick();
    const before = h.client.chains.length;
    await h.change(); await tick();
    check('change from self shows only the mode choice, clears mode and message',
      h.onlyMode() && h.value('recordingMode') === null && h.message() === '' && h.client.chains.length === before);
    await h.pickSelf(); await tick();
    check('choosing myself again uses the cached consent with no db call', h.onlyWizard() && h.client.chains.length === before);
    await h.change(); await tick();
    await h.pickOther(); await tick();
    check('after a change, someone else gets the form with an empty name', h.onlyForm() && h.nameShown() && h.el['recording-subject-name'].value === '');

    const other = harness();
    await consentForOther(other);
    check('the change button shows with the wizard in other mode', other.onlyWizard());
    await other.change(); await tick();
    check('change from other clears the pending consent and mode', other.onlyMode()
      && other.value('pendingOtherConsent') === null && other.value('recordingMode') === null && other.client.chains.length === 0);
    await other.open(); await tick();
    check('after a change, the next open asks for the mode again', other.onlyMode());

    const admin = harness({ role: 'admin' });
    await admin.open(); await tick();
    await admin.pickSelf(); await tick();
    check('admin self shows the change button with the wizard', admin.onlyWizard());
  });

  await scenario('other, change and decline cancel a pending self check', async () => {
    const actions = {
      'choosing someone else': h => h.ctx.chooseRecordingMode('other'),
      'changing who is recorded': h => h.ctx.changeRecordingMode(),
      'declining': h => h.ctx.declineRecordingConsent(),
    };
    for (const [label, act] of Object.entries(actions)) {
      const late = deferred();
      const h = harness({ reply: route(() => late.promise, ok) });
      await h.open(); await tick();
      const pending = h.pickSelf(); await tick();
      await act(h); await tick();
      late.resolve(hasRow()); await pending; await tick();
      check(`late self answer after ${label} does not show the wizard or set self mode`,
        !h.wizardShown() && !h.changeShown() && h.value('recordingMode') !== 'self', `mode ${h.value('recordingMode')}`);
    }
  });

  await scenario('decline clears a pending someone-else consent', async () => {
    const h = harness();
    await consentForOther(h);
    await h.ctx.chooseRecordingMode('other'); await tick();
    await h.decline(); await tick();
    check('decline clears a pending consent and its mode',
      h.value('pendingOtherConsent') === null && h.value('recordingMode') === null && h.client.chains.length === 0);
    await h.open(); await tick();
    check('after that decline the next open asks for the mode again', h.onlyMode());
  });

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
