// TODO: keep your own values:
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// after: const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, /* ... */);
window.sb = sb;
window.debugSession = async () => {
  const { data } = await sb.auth.getSession();
  console.log('session?', !!data?.session, data?.session?.user?.id, data?.session?.user?.email);
};


// Use the two fixed buckets that have policies
const IMAGE_BUCKET = 'image';
const AUDIO_BUCKET = 'audio';


// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const authWrapper = document.querySelector('.auth-wrapper');
const appSection  = $('app-section');
const welcomeName = $('welcome-name');
const authMsg     = $('auth-message');
const loginBtn    = $('login-btn');
const logoutBtn   = $('logout-btn');

let currentUserId = null;
let currentFirstName = null;
let currentUsername  = null;

// ---------- Login (username or email) ----------
async function handleLogin() {
  authMsg.textContent = '';
  loginBtn.disabled = true;

  const identifier = $('identifier').value.trim();
  const password   = $('password').value;

  if (!identifier || !password) {
    authMsg.textContent = 'Please enter your username/email and password.';
    loginBtn.disabled = false;
    return;
  }

  let emailToUse = identifier;

  // If not an email, look up by username in profiles
  if (!identifier.includes('@')) {
    const { data: prof, error: profErr } = await sb
      .from('profiles')
      .select('email')
      .ilike('username', identifier)
      .maybeSingle();

    if (profErr || !prof?.email) {
      authMsg.textContent = 'Invalid login credentials.';
      loginBtn.disabled = false;
      return;
    }
    emailToUse = prof.email;
  }

  const { error } = await sb.auth.signInWithPassword({ email: emailToUse, password });
  if (error) {
    console.error('Login failed:', error);
    authMsg.textContent = 'Invalid login credentials.';
    loginBtn.disabled = false;
    return;
  }

  // success
  $('password').value = '';
  await revealAppForSession();
  loginBtn.disabled = false;
}

// ---------- Show app if logged in (ADMIN-GATED) ----------
async function revealAppForSession() {
  const { data: sessionData } = await sb.auth.getSession();
  const session = sessionData?.session;
  if (!session) return;

  currentUserId = session.user.id;

  // Load profile WITH admin_status
  const { data: profileData, error: profileErr } = await sb
    .from('profiles')
    .select('first_name,last_name,username,admin_status')
    .eq('id', currentUserId)
    .maybeSingle();

  // If profile can’t be read or missing, or not admin → deny
  if (profileErr || !profileData || !profileData.admin_status) {
    authMsg.textContent = 'You are not an admin. Access denied.';
    await sb.auth.signOut();
    return;
  }

  // Passed admin check → show app
  currentFirstName = profileData.first_name || null;
  currentUsername  = profileData.username   || (session.user.email || '').split('@')[0];

if (!currentFirstName) {
    currentFirstName = (session.user.email || '').split('@')[0] || null;
  }

  let fullName = session.user.email;
  if (profileData.first_name || profileData.last_name) {
    fullName = [profileData.first_name, profileData.last_name]
      .filter(Boolean).join(' ') || fullName;
  }

  if (authWrapper) authWrapper.style.display = 'none';
  appSection.style.display = 'block';
  welcomeName.textContent = fullName;

  // Wire tabs (only once)
  wireTabs();
}


// ---------- Logout ----------
async function handleLogout() {
  await sb.auth.signOut();
  // reset UI
  if (authWrapper) authWrapper.style.display = 'flex';
  appSection.style.display = 'none';
  welcomeName.textContent = '';
  authMsg.textContent = '';
  $('identifier').value = '';
  $('password').value = '';
}

// ---------- Tabs ----------
function wireTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  tabButtons.forEach(btn => {
    btn.onclick = () => {
      // remove active from all
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // activate clicked + target
      btn.classList.add('active');
      const targetId = btn.id === 'tab1-btn' ? 'tab1' : 'tab2';
      document.getElementById(targetId).classList.add('active');
    };
  });
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', async () => {
  // session reveal if already logged in
  await revealAppForSession();

  // attach handlers
  loginBtn?.addEventListener('click', handleLogin);
  logoutBtn?.addEventListener('click', handleLogout);

  // Enter key to submit
  $('password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});




// =============== CREATE EXAMPLE WIZARD (admin, 3 steps, dynamic grid) ===============
const a = {
  exampleId: null,
  recordingSessionId: null,
  totalSteps: 3,
  currentStep: 1,
  state: {
    language: '',
    title: '',
    rows: 0,
    cols: 0,
    gridRows: 0,   // rows + 1
    gridCols: 0,   // cols + 1
    // Uploads
    images: {},    // { [r:number>=1]: { file: File, url: string } }   (left column)
    audios: {},    // { [c:number>=1]: { file: File, url: string } }   (top row)
    // Check toggles for inner cells
    checks: new Set(), // Set of "r,c" for r>=1 && c>=1
    // in a.state
    transcriptions: {} // { [c:number>=1]: string }
  }
};

// --- Step 1 helpers ---
function a_collectStep1() {
  const language = document.getElementById('a-language')?.value.trim() || '';
  const title    = document.getElementById('a-title')?.value.trim() || '';
  const rows     = parseInt(document.getElementById('a-rows')?.value, 10) || 0;
  const cols     = parseInt(document.getElementById('a-cols')?.value, 10) || 0;
  return { language, title, rows, cols };
}

function a_applyStep1ToState() {
  const { language, title, rows, cols } = a_collectStep1();
  a.state.language = language;
  a.state.title    = title;
  a.state.rows     = rows;
  a.state.cols     = cols;

  // ALWAYS +1 row and +1 column
  a.state.gridRows = Math.max(1, rows) + 1;
  a.state.gridCols = Math.max(1, cols) + 1;

  // reset grid state when dimensions change
  a.state.images = {};
  a.state.audios = {};
  a.state.checks.clear();
  a.state.transcriptions = {};
}

// --- Grid rendering ---
function a_renderCheckmark(td, key) {
  td.innerHTML = '';
  if (a.state.checks.has(key)) {
    const span = document.createElement('span');
    span.textContent = '✔';
    span.style.fontSize = '18px';
    span.style.display = 'inline-block';
    td.appendChild(span);
  }
}

function a_buildGrid() {
  const table = document.getElementById('a-grid-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Header row (r = 0): top-left blank; c>=1 = audio upload + Play button
  const hr = document.createElement('tr');
  for (let c = 0; c < a.state.gridCols; c++) {
    const th = document.createElement('th');

    if (c > 0) {
      // container
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.flexDirection = 'column';
      wrap.style.gap = '6px';

      // audio upload
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';

      // play button (like your first project)
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.className = 'custom-button';
      playBtn.disabled = !a.state.audios[c]?.url;

      // show existing audio state if any
      let audioUrl = a.state.audios[c]?.url || null;
      input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch {} }
        audioUrl = URL.createObjectURL(file);
        a.state.audios[c] = { file, url: audioUrl };
        playBtn.disabled = false;
      });

      playBtn.addEventListener('click', () => {
        if (!a.state.audios[c]?.url) return;
        new Audio(a.state.audios[c].url).play();
      });

      // label (optional)
      const lbl = document.createElement('div');
      lbl.textContent = `Col ${c}`;

      wrap.appendChild(lbl);
      wrap.appendChild(input);
      wrap.appendChild(playBtn);
      th.appendChild(wrap);
    }

    hr.appendChild(th);
  }
  thead.appendChild(hr);

  // Body rows (r >= 1)
  for (let r = 1; r < a.state.gridRows; r++) {
    const tr = document.createElement('tr');

    for (let c = 0; c < a.state.gridCols; c++) {
      const td = document.createElement('td');

      if (c === 0) {
        // Left column image upload (except we never render the top-left here)
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '6px';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.width = '100%';

        const preview = document.createElement('img');
        preview.style.width = '100px';
        preview.style.height = 'auto';
        preview.style.display = 'none';
        preview.style.borderRadius = '6px';

        // show existing state if any
        if (a.state.images[r]?.url) {
          preview.src = a.state.images[r].url;
          preview.style.display = 'block';
        }

        input.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (a.state.images[r]?.url) {
            try { URL.revokeObjectURL(a.state.images[r].url); } catch {}
          }
          const url = URL.createObjectURL(file);
          a.state.images[r] = { file, url };
          preview.src = url;
          preview.style.display = 'block';
        });

        const lbl = document.createElement('div');
        lbl.textContent = `Row ${r}`;

        wrap.appendChild(lbl);
        wrap.appendChild(input);
        wrap.appendChild(preview);
        td.appendChild(wrap);
      } else {
        // Inner cells: toggle checkmark
        const key = `${r},${c}`;
        td.style.cursor = 'pointer';
        td.style.textAlign = 'center';
        td.style.verticalAlign = 'middle';
        a_renderCheckmark(td, key);

        td.addEventListener('click', () => {
          if (a.state.checks.has(key)) {
            a.state.checks.delete(key);
          } else {
            a.state.checks.add(key);
          }
          a_renderCheckmark(td, key);
        });
      }

      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

// --- Step 3 (optional review text) ---
function a_renderReview() {
  const el = document.getElementById('a-review');
  if (!el) return;
  el.innerHTML = `
    <strong>Language:</strong> ${a.state.language || '—'}<br/>
    <strong>Title:</strong> ${a.state.title || '—'}<br/>
    <strong>Grid Size:</strong> ${a.state.gridRows} × ${a.state.gridCols}<br/>
    <strong>Images uploaded:</strong> ${Object.keys(a.state.images).length}<br/>
    <strong>Audios uploaded:</strong> ${Object.keys(a.state.audios).length}<br/>
    <strong>Checks set:</strong> ${a.state.checks.size}
  `;
}



function a_renderTranscriptions() {
  const wrap = document.getElementById('a-transcriptions');
  if (!wrap) return;

  // fresh table
  wrap.innerHTML = '';
  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';

  const thead = tbl.createTHead();
  const headerRow = thead.insertRow();

  const thAudio = document.createElement('th');
  thAudio.textContent = 'Audio';
  thAudio.style.padding = '8px';
  thAudio.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thAudio);

  const thInput = document.createElement('th');
  thInput.textContent = 'Your Transcription';
  thInput.style.padding = '8px';
  thInput.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thInput);

  const tbody = document.createElement('tbody');

  // One row per audio column (c = 1 .. gridCols-1)
  for (let c = 1; c < a.state.gridCols; c++) {
    // Only render if an audio exists (user may not upload all)
    if (!a.state.audios[c]?.url) continue;

    const tr = tbody.insertRow();

    // left cell: Play button
    const tdBtn = tr.insertCell();
    tdBtn.style.border = '1px solid #A7A1C2';
    tdBtn.style.padding = '8px';

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.className = 'custom-button';
    playBtn.addEventListener('click', () => {
      const url = a.state.audios[c]?.url;
      if (url) new Audio(url).play();
    });
    tdBtn.appendChild(playBtn);

    // right cell: transcription input
    const tdInp = tr.insertCell();
    tdInp.style.border = '1px solid #A7A1C2';
    tdInp.style.padding = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type sentence…';
    input.style.width = '100%';

    // restore if present
    input.value = a.state.transcriptions[c] || '';
    input.addEventListener('input', (e) => {
      a.state.transcriptions[c] = e.target.value;
    });

    tdInp.appendChild(input);
  }

  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}

async function a_createExampleAndSessionFromStep1() {
  const { language, title, rows, cols } = a_collectStep1();

  // Insert EXAMPLE first
  const { data: ex, error: exErr } = await sb
    .from('example')
    .insert([{
      width: cols,
      height: rows,
      title,
      user: currentFirstName,
      // created_at: leave to DB default (now())
      // id: leave to DB default (uuid gen)
    }])
    .select('id')
    .single();

  if (exErr) throw exErr;
  const exampleId = ex.id;

  // Insert RECORDING SESSION next
  const { data: rs, error: rsErr } = await sb
    .from('recording_session')
    .insert([{
      example_id: exampleId,
      verification_status: true, // as requested
      language,                   // from Step 1 input
      user: currentFirstName,
      // created_at: DB default
      // id: DB default
    }])
    .select('id')
    .single();

  if (rsErr) {
    // best-effort rollback of the example if session insert fails
    await sb.from('example').delete().eq('id', exampleId);
    throw rsErr;
  }

  // Save in state for later steps
  a.state.exampleId = exampleId;
  a.state.recordingSessionId = rs.id;

  return { exampleId, recordingSessionId: rs.id };
}





// --- Wizard UI ---
function a_showStep(step) {
  a.currentStep = step;

  for (let i = 1; i <= a.totalSteps; i++) {
    document.getElementById(`a-step-${i}`).classList.toggle('active', i === step);
  }

  const bar = document.getElementById('progress-bar-admin');
  if (bar) bar.style.width = `${(step / a.totalSteps) * 100}%`;

  const prevBtn   = document.getElementById('a-prev-btn');
  const nextBtn   = document.getElementById('a-next-btn');
  const submitBtn = document.getElementById('a-submit-btn');
  const footer    = document.querySelector('#tab1 .wizard-buttons');

  if (!prevBtn || !nextBtn || !submitBtn || !footer) return;

  if (step === 1) {
    prevBtn.style.display   = 'none';
    nextBtn.style.display   = 'inline-block';
    submitBtn.style.display = 'none';
    footer.style.justifyContent = 'flex-end';
  } else if (step === a.totalSteps) {
  prevBtn.style.display   = 'inline-block';
  nextBtn.style.display   = 'none';
  submitBtn.style.display = 'inline-block';
  footer.style.justifyContent = 'space-between';

  // Make sure the transcription table is up to date whenever Step 3 is shown
  a_renderTranscriptions();
}
 else {
    prevBtn.style.display   = 'inline-block';
    nextBtn.style.display   = 'inline-block';
    submitBtn.style.display = 'none';
    footer.style.justifyContent = 'space-between';
  }
}

function a_wireWizardOnce() {
  if (a._wired) return;
  a._wired = true;

  const prevBtn   = document.getElementById('a-prev-btn');
  const nextBtn   = document.getElementById('a-next-btn');
  const submitBtn = document.getElementById('a-submit-btn');

  prevBtn?.addEventListener('click', () => {
    if (a.currentStep > 1) a_showStep(a.currentStep - 1);
  });

  nextBtn?.addEventListener('click', async () => {
  const statusEl = document.getElementById('a-submit-status');

  // Leaving Step 1 → validate, persist to DB, then build grid
  if (a.currentStep === 1) {
    const { language, title, rows, cols } = a_collectStep1();
    if (!language || !title || rows < 1 || cols < 1) {
      statusEl.textContent = 'Please fill out Language, Title, Rows, and Columns (≥1).';
      return;
    }

    // Update local state + grid sizes
    a_applyStep1ToState();

    try {
      statusEl.textContent = 'Creating draft in database…';
      const { exampleId, recordingSessionId } = await a_createExampleAndSessionFromStep1();
      statusEl.textContent =
        `Draft created (example: ${exampleId.slice(0,8)}…, session: ${recordingSessionId.slice(0,8)}…).`;

      // Now render Step 2 grid
      a_buildGrid();
    } catch (e) {
      console.error('DB insert failed', e);
      statusEl.textContent = 'Failed to create draft. Please try again.';
      return;
    }
  }

  // Advance one step
  if (a.currentStep < a.totalSteps) {
    a_showStep(a.currentStep + 1);
    if (a.currentStep === 2) {
      a_renderTranscriptions(); // keep your existing behavior
    }
  }
});



    submitBtn?.addEventListener('click', async () => {
    const statusEl = document.getElementById('a-submit-status');

    try {
      console.log('#1');
      statusEl.textContent = 'Saving checkmarks…';
      const { inserted: chk } = await a_saveCheckmarks();


      console.log('#2');

      statusEl.textContent = `Saved ${chk} checkmark${chk === 1 ? '' : 's'}. Uploading images…`;
      const { inserted: imgs } = await a_saveImages();

      console.log('#3');

      statusEl.textContent =
        `Saved ${chk} checkmark${chk === 1 ? '' : 's'}, ${imgs} image${imgs === 1 ? '' : 's'}. Uploading audios…`;
      const { inserted: auds } = await a_saveAudios();

      console.log('#4');

      statusEl.textContent =
        `✅ Done — ${chk} check${chk === 1 ? '' : 's'}, ${imgs} image${imgs === 1 ? '' : 's'}, ${auds} audio${auds === 1 ? '' : 's'} saved.`;
    } catch (e) {
      console.error('Submit failed', e);
      statusEl.textContent = `Failed: ${e?.message || 'Unknown error'}`;
    }
  });


  // init
  a_showStep(1);
}

// Hook into tab wiring so the wizard initializes when Tab 1 is active
const _origWireTabs = wireTabs;
wireTabs = function () {
  _origWireTabs();

  const tab1Active = document.getElementById('tab1')?.classList.contains('active');
  if (tab1Active) a_wireWizardOnce();

  document.getElementById('tab1-btn')?.addEventListener('click', a_wireWizardOnce, { once: true });
};

async function a_saveCheckmarks() {
  const exampleId = a.state.exampleId;
  if (!exampleId) throw new Error('No exampleId in state — create Step 1 draft first.');

  // Build insert rows from the Set of "r,c"
  const rows = Array.from(a.state.checks).map((key) => {
    const [r, c] = key.split(',').map((n) => parseInt(n, 10));
    return {
      example_id: exampleId,
      row_index: r,       // already 1-based in your grid
      column_index: c,    // already 1-based in your grid
      // id & created_at come from DB defaults
    };
  });

  if (rows.length === 0) return { inserted: 0 };

  // Optional: replace existing checkmarks for this example on re-submit
  // (comment this out if you ONLY ever insert once)
  await sb.from('checkmarks').delete().eq('example_id', exampleId);

  // Insert all rows (Supabase supports large batches; chunk if you expect thousands)
  const { error } = await sb.from('checkmarks').insert(rows);
  if (error) throw error;

  return { inserted: rows.length };
}

// Make safe strings for bucket names / paths
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanum -> "-"
    .replace(/^-+|-+$/g, '')       // trim dashes
    .slice(0, 80);
}


async function a_saveImages() {
  console.log('+++1');
  const exampleId = a.state.exampleId;
  if (!exampleId) throw new Error('No exampleId in state — create Step 1 first.');

  const bucket = 'image';
  const rows = [];

  console.log('+++2');

  for (const [rStr, obj] of Object.entries(a.state.images)) {
    const r = parseInt(rStr, 10);
    if (!obj?.file) continue;

    const file = obj.file;

    console.log('+++3');


    // ⬇️ put all admin images under the subfolder "admin-images/"
    // const path = `admin-images/${exampleId}/row-${r}-${Date.now()}-${slugify(file.name)}`;
    const path = `row-${r}-${Date.now()}-${slugify(file.name)}`;


    console.log('+++4', path);

    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) throw upErr;

    console.log('+++5', path);

    const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
    rows.push({ example_id: exampleId, image_path: pub.publicUrl, position: r });
  }

  if (!rows.length) return { inserted: 0 };
  const { error } = await sb.from('image').insert(rows);
  if (error) throw error;
  return { inserted: rows.length, bucket };
}


async function a_saveAudios() {
  const sessionId = a.state.recordingSessionId;
  if (!sessionId) throw new Error('No recordingSessionId — create Step 1 first.');

  const bucket = 'audio';
  const rows = [];

  for (const [cStr, obj] of Object.entries(a.state.audios)) {
    const c = parseInt(cStr, 10);
    if (!obj?.file) continue;

    const file = obj.file;

    // ⬇️ put all admin audios under the subfolder "admin-audios/"
    const path = `admin-audios/${sessionId}/col-${c}-${Date.now()}-${slugify(file.name)}`;

    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) throw upErr;

    const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
    rows.push({
      recording_session_id: sessionId,
      audio_path: pub.publicUrl,
      position: c,
      transcription: a.state.transcriptions[c] || null,
    });
  }

  if (!rows.length) return { inserted: 0 };
  const { error } = await sb.from('audio').insert(rows);
  if (error) throw error;
  return { inserted: rows.length, bucket };
}

