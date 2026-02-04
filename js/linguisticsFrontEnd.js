/*
================================================================================
FUNCTION DICTIONARY
================================================================================

checkLoginStatus(): Promise<void>
- WHAT: Verifies if a Supabase session exists, stores user id, fetches profile,
        hides auth UI, shows app UI, wires up tab buttons, loads examples and
        tables, and sets welcome message.
- WHERE CALLED: After login success, and on DOMContentLoaded (if not DEMO_MODE).
- PARAMS: None.
- RETURNS: Promise<void>.

bootDemo(): void
- WHAT: Enters demo mode: hides auth UI, shows app UI with anonymous greeting,
        hides logout, wires tab buttons, fetches tables, starts wizard.
- WHERE CALLED: On DOMContentLoaded (if DEMO_MODE true).
- PARAMS: None.
- RETURNS: void.

fetchAndRenderTable(): Promise<void>
- WHAT: Builds Tab 2 Subtab B/C table with image grid and audio play headers.
        Queries audio_clips, images, and image_audio_map, then renders table.
- WHERE CALLED: On label/language filter input change; in examples row click.
- PARAMS: None (reads filter inputs directly).
- RETURNS: Promise<void>.

fetchAndRenderExamplesTable(): Promise<void>
- WHAT: Builds the list of example rows (label, language, user). Each row click
        sets filters and triggers fetchAndRenderTable().
- WHERE CALLED: In checkLoginStatus() during app init.
- PARAMS: None.
- RETURNS: Promise<void>.

renderSubtab3Table(clips: Array): void
- WHAT: Builds transcription table in Tab 2 Subtab C: audio play buttons + static
        transcriptions from database.
- WHERE CALLED: Inside fetchAndRenderTable().
- PARAMS: clips – array of audio clip objects with path/transcription.
- RETURNS: void.

fetchAndRenderTableD(): Promise<void>
- WHAT: Builds Tab 3 Step 2 table: creates record buttons for each audio clip,
        allows microphone recording, stores blobs in pendingRecordings, shows
        previews, renders image/checkmark rows, and also calls
        renderRecordTranscriptionsTable(clips) at top (placeholder).
- WHERE CALLED: On label/language filter input change; in examples row click;
        inside showStep(2).
- PARAMS: None (reads filter inputs directly).
- RETURNS: Promise<void>.

fetchAndRenderExamplesTableD(): Promise<void>
- WHAT: Builds example selection table for Tab 3 Step 2. Clicking row sets
        currentLanguage/currentLabel and triggers fetchAndRenderTableD().
- WHERE CALLED: Inside showStep(2).
- PARAMS: None.
- RETURNS: Promise<void>.

refreshStep3FromSession(): Promise<void>
- WHAT: Reloads audio clips for the active currentSessionId, sorts them,
        rebuilds Step 3 transcription table via renderRecordTranscriptionsTable().
- WHERE CALLED: After submission (to sync session data).
- PARAMS: None (uses global currentSessionId).
- RETURNS: Promise<void>.

renderRecordTranscriptionsTable(clips: Array): void
- WHAT: Builds Step 3 table where user transcribes their recorded clips.
        Each row: play button + input field, with values cached in
        pendingTranscriptions.
- WHERE CALLED: refreshStep3FromSession(); fetchAndRenderTableD(); showStep(3).
- PARAMS: clips – array of clip objects with id, path, position, transcription.
- RETURNS: void.

openTab(tabId: string, clickedButton: HTMLElement): void
- WHAT: Generic function to switch main tabs (Tab1/2/3).
- WHERE CALLED: Wired in checkLoginStatus() and bootDemo().
- PARAMS: tabId – id of tab content div; clickedButton – tab button element.
- RETURNS: void.

openNestedTab(subTabId: string, clickedButton: HTMLElement, parentTabId: string): void
- WHAT: Switches nested tabs within a parent tab.
- WHERE CALLED: Wired in checkLoginStatus() and bootDemo().
- PARAMS: subTabId – nested content id; clickedButton – button element;
          parentTabId – parent tab’s id.
- RETURNS: void.

showStep(step: number): void
- WHAT: Controls 3-step wizard (Tab 3). Updates active step, progress bar,
        footer button visibility, and triggers data fetch/render for step 2/3.
- WHERE CALLED: At login (step 1), in bootDemo(), and via prev/next buttons.
- PARAMS: step – integer (1–3).
- RETURNS: void.
*/



//Objects/Variables

//Cache of audio clips. Clip ID distinguishes audio, blob is the audio clip, and position is its position in the table. Used in step 2 of tab 3 for submission.
//{ [clipId]: { blob: Blob, position: number } }
let pendingRecordings   = {};

//Cache of transcriptions. Used in step 3 of tab 3 for submission.
//{ [clipId]: string }
let pendingTranscriptions = {};

//Variables
let currentUserId      = null; //String: user's Supabase Auth ID. Used in checkLoginStatus().
let currentLabel       = null; //String: the currently selected examples in tab 3. Used for submission.
let currentLanguage    = null; //String: the language being used to filter in step 2 of tab 3. Should be removed when filtering method improves.
let currentSessionId   = null; //String: the ID of the current submission session the user is doing in tab 3. Used in refreshStep3FromSession().
let currentUserFilter = null; // UUID of the selected user (or null for "any")
let currentFirstName = null;
let currentRole = 'viewer';
const ALL_TABS = ['tab1', 'tab2', 'tab3', 'tab4'];


//Initialize Supabase client
const { createClient } = supabase; //Destructuring supabase object
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co'; //Project's supabase instance
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';
const supabaseClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); //Created supabase Client using previous 3 const's

//Demo version for recruiters
//Uses either ?demo=1 or #demo in the URL
const sp = new URLSearchParams(location.search);
const DEMO_MODE = sp.has('demo') || location.hash.toLowerCase().includes('demo');
//Temporarily close submissions on public app
const SUBMISSIONS_CLOSED = false;


//Toggle between login and signup: change active button and which page is visible
document.getElementById('login-page-btn').addEventListener('click', () => {
  document.getElementById('login-page').style.display = 'block';
  document.getElementById('signup-page').style.display = 'none';
  document.getElementById('login-page-btn').classList.add('active');
  document.getElementById('signup-page-btn').classList.remove('active');
});

document.getElementById('signup-page-btn').addEventListener('click', () => {
  document.getElementById('signup-page').style.display = 'block';
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('signup-page-btn').classList.add('active');
  document.getElementById('login-page-btn').classList.remove('active');
});

//Sign-up
document.getElementById('signup-btn').addEventListener('click', async () => {
  const email = document.getElementById('email-signup').value.trim();         //user email
  const password = document.getElementById('password-signup').value;          //user password
  const firstName = document.getElementById('first-name').value.trim();       //user fname
  const lastName = document.getElementById('last-name').value.trim();         //user lname
  const username  = document.getElementById('username-signup').value.trim();  //user username

  const msg = document.getElementById('auth-message-signup');                 //feedback message seen by users

  //Making sure user enters username, gives error message and ends function if doesn't
  if (!username) {
    msg.textContent = 'Please choose a username.';
    return;
  }

  //Calls a supabase method to sign up using email and password, then uses object destructuring to get the important data (signUpData) and errors (signUpError)
  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });

  //If there was an error for the supabase sign up call, then the error message is shown, and the function stops
  if (signUpError) {
    document.getElementById('auth-message-signup').textContent = signUpError.message;
    return;
  }

  //Using optional chaining to access user ID from previous supabase call
  const userId = signUpData.user?.id;

  //if the user ID exists, then tries to insert id, fname, lname, username, and email into profiles table in database using supabase's fluent API, then destructures object...
  //... returned by supabase insertion to access potential errors (profileErr)
  if (userId) {
    const { error: profileErr } = await supabaseClient
    .from('profiles')
    .insert([{
      id: userId,
      first_name: firstName,
      last_name: lastName,
      username: username,
      email: email
    }]);

    //if there is an error, an error is thrown to the console. If it was because the username is taken, the UI indicates so. 
    // If not, then the user is given a general failure message. The function then ends.
    if (profileErr) {
      console.error('Failed to insert profile:', profileErr);

      if (String(profileErr.message).toLowerCase().includes('duplicate')) {   //this line accesses the error message from profileErr (initialized earlier), manipulates it, then checks for the word duplicate anywhere inside the error
        msg.textContent = 'That username is already taken. Please pick another.'; //duplicate error message
      }

      else {
        msg.textContent = 'Signed up, but failed to save profile info.'; //non-duplicate error message
      }

      return;
    }
  }

  //if there was no error, the user is notified, and the login page is loaded
  document.getElementById('auth-message-signup').textContent = 'Sign-up successful! Please log in.';
  document.getElementById('login-page-btn').click();
});

// Log-in (username OR email)
document.getElementById('login-btn').addEventListener('click', async () => {

  //getting email/username and password entered by user
  const identifier = document.getElementById('identifier').value.trim();   //email or username
  const password   = document.getElementById('password').value;            //password
  const msg        = document.getElementById('auth-message');              //feedback

  let emailToUse = identifier;

  // If the user entered a username, looks into profile table in database to determine email corresponding to that username
  if (!identifier.includes('@')) {
    const { data: prof, error: profErr } = await supabaseClient
      .from('profiles')
      .select('email')
      .ilike('username', identifier)
      .maybeSingle();

    //Error query failed or could not find username, show user a message and end function
    if (profErr || !prof?.email) {
      msg.textContent = 'Invalid login credentials.';
      return;
    }

    //converts the username to email for log-in
    emailToUse = prof.email;
  }
  
  //tries to use supabase sign in using email and password and uses object destructuring to get error
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailToUse,
    password
  });

  //if there is an error, throws generic error and shows an error message to user
  if (error) {
    console.error('Login failed:', error);
    msg.textContent = 'Invalid login credentials.';
    return;
  }

  //clear out error message since no errors
  msg.textContent = '';

  //if successfully logged in, shifts from sign up/login UI to actual app
  await checkLoginStatus();

  //reset sign-up fields
  document.getElementById('first-name').value = '';
  document.getElementById('last-name').value = '';
  document.getElementById('email-signup').value = '';
  document.getElementById('password-signup').value = '';
  document.getElementById('auth-message-signup').textContent = '';
  document.getElementById('username-signup').value = '';
});

// When pressing Enter in either login input, click "Log In"
['identifier', 'password'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('login-btn').click();
    }
  });
});

// When pressing Enter in any sign-up input, click "Sign Up"
['first-name', 'last-name', 'username-signup', 'email-signup', 'password-signup'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('signup-btn').click();
    }
  });
});

//If logout button clicked, supabase logs out user
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  //reset page
  location.reload();
});

//shifts from login/signup UI to actual app if a successful login occurs
async function checkLoginStatus() {
  //safeguard in case called in demo
  if (DEMO_MODE) return;

  //gets the data from the object that getSession() returns through object destructuring. If the session in the data is null, the user is not logged in
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (!session) return;

  //stores user ID in local and global variable for later use
  const userId = session.user.id;
  currentUserId = userId;

  //gets fname and lname from the given user's profile as a single object
  const { data: profileData } = await supabaseClient
    .from('profiles')
    .select('first_name, last_name, status')
    .eq('id', userId)
    .single();

  currentFirstName = profileData?.first_name || null;
  currentRole = profileData?.status || 'viewer';

  //checks if there is an element in auth-wrapper (safety check). If there is, they are made not visible.
  const authWrapper = document.querySelector('.auth-wrapper');
  if (authWrapper) authWrapper.style.display = 'none';

  //app is now visible
  document.getElementById('app-section').style.display = 'block';

  //starts the wizard process on tab 3 on step 1
  showStep(1);


  //when a tab button is clicked, the openTab function is called to switch tabs accordingly
  document.getElementById("tab1-btn").addEventListener("click", function() {
    openTab("tab1", this);
  });
  document.getElementById("tab2-btn").addEventListener("click", function() {
    openTab("tab2", this);
  });
  document.getElementById("tab3-btn").addEventListener("click", function() {
    openTab("tab3", this);
  });
  document.getElementById("subtabB-btn").addEventListener("click", function() {
    openNestedTab("subtabB", this, "tab2");
  });
  document.getElementById("subtabC-btn").addEventListener("click", function() {
    openNestedTab("subtabC", this, "tab2");
  });
  document.getElementById("tab4-btn").addEventListener("click", function() {
  openTab("tab4", this);
  a_wireWizardOnce();
  });

  //Updating UI with name. If profile data exists, it sets the welcome message text to include first and last name. If not, the email is used instead (ternary operator)
  const nameSpan = document.getElementById('welcome-name');
  if (nameSpan) {
    nameSpan.textContent = profileData
      ? `${profileData.first_name} ${profileData.last_name}`
      : session.user.email;
  }

  //Fetch tables for tab 2 subtab 2. The transcriptions table for tab 2 subtab 3 is also constructed via a function call inside of fetchAndRenderTable()
  fetchAndRenderTable();
  fetchAndRenderExamplesTable();

  //Render Create Examples tab's wizard
  a_wireWizardOnce();

  applyRoleVisibility();
}

function bootDemo() {
  //checks if there is an element in auth-wrapper (safety check). If there is, they are made not visible.
  const authWrapper = document.querySelector('.auth-wrapper');
  if (authWrapper) authWrapper.style.display = 'none';

  //checks if there is an element in app-section (safety check). If there is, they are made visible.
  const app = document.getElementById('app-section');
  if (app) app.style.display = 'block';

  //Changes greeting to anonymous
  const nameSpan = document.getElementById('welcome-name');
  if (nameSpan) nameSpan.textContent = 'Anonymous';

  //Removes log out button for demo
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  //when a tab button is clicked, the openTab function is called to switch tabs accordingly
  document.getElementById("tab1-btn").addEventListener("click", function() { openTab("tab1", this); });
  document.getElementById("tab2-btn").addEventListener("click", function() { openTab("tab2", this); });
  document.getElementById("tab3-btn").addEventListener("click", function() { openTab("tab3", this); });
  document.getElementById("subtabB-btn").addEventListener("click", function() { openNestedTab("subtabB", this, "tab2"); });
  document.getElementById("subtabC-btn").addEventListener("click", function() { openNestedTab("subtabC", this, "tab2"); });
  document.getElementById("tab4-btn").addEventListener("click", function() { openTab("tab4", this); a_wireWizardOnce();});

  //Fetch tables for tab 2 subtab 2. The transcriptions table for tab 2 subtab 3 is also constructed via a function call inside of fetchAndRenderTable()
  fetchAndRenderTable();
  fetchAndRenderExamplesTable();

  currentRole = 'creator';
  applyRoleVisibility();

  //starts the wizard process on tab 3 on step 1
  showStep(1);
}

//skips authentication if using demo. Also checks if should log in a prior session the user logged in to
document.addEventListener('DOMContentLoaded', () => {
  if (DEMO_MODE) {
    bootDemo();
  } else {
    checkLoginStatus();
  }
});

//refetching the top table displaying the selected example everytime the filters are changed for tab 2 subtab 2
const langInput = document.getElementById('language-search-input');
const labelInput = document.getElementById('label-search-input');
labelInput.addEventListener('input', () => fetchAndRenderTable());
langInput.addEventListener('input',  () => fetchAndRenderTable());

//refetching the top table displaying the selected example everytime the filters are changed for tab 3 step 2
const langInputD  = document.getElementById('language-search-input-d');
const labelInputD = document.getElementById('label-search-input-d');
labelInputD.addEventListener('input', fetchAndRenderTableD);
langInputD.addEventListener('input',  fetchAndRenderTableD);

// Build the "Listen" table for a single example (images + audio columns + checkmarks)
async function fetchAndRenderTable() {
  // Read filters from the inputs
  const labelFilter    = labelInput.value.trim();
  const languageFilter = langInput.value.trim(); // filter via recording_session.language
  const wrap = document.getElementById('listen-table-wrap');


  // If no example title, clear the table and stop
  if (!labelFilter) {
    wrap.classList.add('hidden');
    document.querySelector('#image-table thead tr').innerHTML = '';
    document.querySelector('#image-table tbody').innerHTML = '';
    document.getElementById('subtabC').innerHTML = '';
    return;
  }

  // Resolve example PK by title
  let exLookup = supabaseClient
  .from('example')
  .select('id')
  .eq('title', labelFilter);

  if (currentRole === 'student') {
    exLookup = exLookup.eq('class_viewable', true);
  }

  const { data: ex, error: exErr } = await exLookup.maybeSingle();

  if (exErr) { console.error('Error loading example:', exErr); return; }
  if (!ex) {
    document.querySelector('#image-table thead tr').innerHTML = '<th>Image</th>';
    document.querySelector('#image-table tbody').innerHTML = '';
    document.getElementById('subtabC').innerHTML = '';
    return;
  }

  // Fetch audio columns joined to recording_session (new schema)
  // - filter by example_id, language, and verified sessions
  // - NOTE: "user" is on recording_session, not on audio
  let q = supabaseClient
    .from('audio')
    .select(`
      id, audio_path, transcription, position,
      recording_session:recording_session!inner(example_id, language, "user", verification_status)
    `)
    .eq('recording_session.example_id', ex.id)
    .eq('recording_session.language', languageFilter)
    .eq('recording_session.verification_status', true)
    .order('position', { ascending: true });

  // Optional filter: only show one submitter (from examples table user dropdown)
  if (currentUserFilter) {
    q = q.eq('recording_session."user"', currentUserFilter);
  }

  const { data: clips, error: clipsError } = await q;
  if (clipsError) { console.error('Error loading audio:', clipsError); return; }

  // Keep Subtab C in sync: it expects `path`, so map audio_path -> path
  renderSubtab3Table((clips || []).map(c => ({ ...c, path: c.audio_path })));

  // Header: first "Image" col, then one Play button per audio column
  wrap.classList.remove('hidden');
  const theadRow = document.querySelector('#image-table thead tr');
  theadRow.innerHTML = '';
  theadRow.insertAdjacentHTML('beforeend', '<th>Image</th>');

  (clips || []).forEach(clip => {
    const th  = document.createElement('th');
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.classList.add('custom-button');
    btn.addEventListener('click', () => new Audio(clip.audio_path).play());
    th.appendChild(btn);
    theadRow.appendChild(th);
  });

  // Rows: images for this example (ordered by position)
  const { data: images, error: imgError } = await supabaseClient
    .from('image')
    .select('id, image_path, position')
    .eq('example_id', ex.id)
    .order('position', { ascending: true });
  if (imgError) { console.error('Error loading images:', imgError); return; }

  // Checkmarks addressed by (row_index, column_index) for this example
  const { data: checks, error: ckErr } = await supabaseClient
    .from('checkmarks')
    .select('row_index, column_index')
    .eq('example_id', ex.id);
  if (ckErr) { console.error('Error loading checkmarks:', ckErr); }

  // Build body
  const tbody = document.querySelector('#image-table tbody');
  tbody.innerHTML = '';

  (images || []).forEach(img => {
    const tr = document.createElement('tr');

    // Left image cell
    const tdImg = document.createElement('td');
    const el = document.createElement('img');
    el.src = img.image_path;
    el.alt = labelFilter || '';
    el.style.width = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    // One cell per audio column; add ✔ if checkmarks say so
    (clips || []).forEach((_, clipIndex) => {
      const td = document.createElement('td');
      const columnNumber = clipIndex + 1;

      const hasMark = (checks || []).some(c =>
        c.row_index === img.position && c.column_index === columnNumber
      );
      if (hasMark) {
        const mark = document.createElement('img');
        mark.src = 'images/checkmark.png';
        mark.alt = '✔';
        mark.style.width = '20px';
        mark.style.height = '20px';
        td.appendChild(mark);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// Build the examples list: Title | Languages(dropdown) | User(dropdown)
// - Only VERIFIED recording_session rows are considered
// - Languages dropdown lists languages with a FULL set (positions 1..width)
// - User dropdown (depends on selected language) lists submitters ("user" column)
//   who have a FULL set for that example+language
// - Clicking a row or changing a dropdown sets filters + currentUserFilter, then loads the main table
async function fetchAndRenderExamplesTable() {
  // 1) Fetch examples (need width to know how many positions a "full set" means)
  let exQuery = supabaseClient
  .from('example')
  .select('id, title, width, created_at')
  .order('created_at', { ascending: false });

  if (currentRole === 'student') {
    exQuery = exQuery.eq('class_viewable', true);
  }

  const { data: examples, error } = await exQuery;

  if (error) { console.error('Error fetching examples:', error); return; }

  const ids = (examples || []).map(e => e.id);

  // 2) Fetch VERIFIED audio joined to recording_session → (example_id, language, "user", position)
  // Build nested map: example_id -> Map(language -> Map(user -> Set(positions))))
  const byExLangUser = new Map();

  if (ids.length) {
    const { data: auds, error: audErr } = await supabaseClient
      .from('audio')
      .select(`
        position,
        recording_session:recording_session!inner(example_id, language, "user", verification_status)
      `)
      .in('recording_session.example_id', ids)
      .eq('recording_session.verification_status', true); // ONLY verified sessions

    if (audErr) {
      console.error('Error fetching audio/recording_session:', audErr);
    } else {
      for (const row of (auds || [])) {
        const exId = row.recording_session?.example_id;
        const lang = row.recording_session?.language;
        const usr  = row.recording_session?.user; // <-- string from recording_session."user"
        const pos  = row.position;
        if (!exId || !lang || !usr) continue;

        let langMap = byExLangUser.get(exId);
        if (!langMap) { langMap = new Map(); byExLangUser.set(exId, langMap); }

        let userMap = langMap.get(lang);
        if (!userMap) { userMap = new Map(); langMap.set(lang, userMap); }

        let posSet = userMap.get(usr);
        if (!posSet) { posSet = new Set(); userMap.set(usr, posSet); }

        if (pos != null) posSet.add(pos);
      }
    }
  }

  // Helper: does a Set contain positions 1..need ?
  const hasFullSet = (posSet, need) => {
    if (!need || need <= 0) return false;
    for (let i = 1; i <= need; i++) if (!posSet.has(i)) return false;
    return true;
  };

  // Languages with at least one user having a full set
  function fullLanguagesForExample(ex) {
    const need = ex.width && ex.width > 0 ? ex.width : null;
    const langMap = byExLangUser.get(ex.id) || new Map();
    const out = [];
    for (const [lang, userMap] of langMap.entries()) {
      const ok = Array.from(userMap.values()).some(posSet => hasFullSet(posSet, need));
      if (ok) out.push(lang);
    }
    return out.sort();
  }

  // Users (string "user" values) with a full set for given example+language
  function fullUsersForExampleLang(ex, lang) {
    const need = ex.width && ex.width > 0 ? ex.width : null;
    const langMap = byExLangUser.get(ex.id) || new Map();
    const userMap = langMap.get(lang) || new Map();
    const out = [];
    for (const [usr, posSet] of userMap.entries()) {
      if (hasFullSet(posSet, need)) out.push(usr);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  // 3) Render (Title | Languages | User)
  const thead = document.querySelector('#examples-table thead tr');
  if (thead) thead.innerHTML = '<th>Title</th><th>Languages</th><th>User</th>';

  const tbody = document.querySelector('#examples-table tbody');
  tbody.innerHTML = '';

  (examples || []).forEach(ex => {
    // Skip examples with no verified audio at all
    const langMap = byExLangUser.get(ex.id);
    if (!langMap || !langMap.size) return;

    const langsFull = fullLanguagesForExample(ex);
    const tr = document.createElement('tr');

    // Title
    const tdTitle = document.createElement('td');
    tdTitle.textContent = ex.title || '';
    tr.appendChild(tdTitle);

    // Languages dropdown (only languages with a full set)
    const tdLangs = document.createElement('td');
    const selLang = document.createElement('select');
    selLang.style.minWidth = '160px';
    if (langsFull.length) {
      langsFull.forEach(l => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = l;
        selLang.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.textContent = 'No complete set';
      opt.value = '';
      selLang.appendChild(opt);
      selLang.disabled = true;
    }
    tdLangs.appendChild(selLang);
    tr.appendChild(tdLangs);

    // User dropdown (users who have full set for selected language)
    const tdUsers = document.createElement('td');
    const selUser = document.createElement('select');
    selUser.style.minWidth = '200px';

    const refreshUsers = () => {
      selUser.innerHTML = '';
      if (selLang.disabled) {
        const opt = document.createElement('option');
        opt.textContent = 'No users';
        opt.value = '';
        selUser.appendChild(opt);
        selUser.disabled = true;
        return;
      }
      const users = fullUsersForExampleLang(ex, selLang.value);
      if (!users.length) {
        const opt = document.createElement('option');
        opt.textContent = 'No users';
        opt.value = '';
        selUser.appendChild(opt);
        selUser.disabled = true;
        return;
      }
      selUser.disabled = false;
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;           // keep the string value of recording_session."user"
        opt.textContent = u;     // show it as-is
        selUser.appendChild(opt);
      });
    };

    refreshUsers();
    tdUsers.appendChild(selUser);
    tr.appendChild(tdUsers);

    // Clicking row → set filters (title + language + user) and load
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.getElementById('label-search-input').value = ex.title || '';
      document.getElementById('language-search-input').value = selLang.disabled ? '' : (selLang.value || '');
      currentUserFilter = selUser.disabled ? null : (selUser.value || null); // this is the string "user"
      fetchAndRenderTable();
    });

    // Changing language → repopulate users and reload
    selLang.addEventListener('change', () => {
      refreshUsers();
      document.getElementById('label-search-input').value = ex.title || '';
      document.getElementById('language-search-input').value = selLang.value || '';
      currentUserFilter = selUser.disabled ? null : (selUser.value || null);
      fetchAndRenderTable();
    });

    // Changing user → reload for that user
    selUser.addEventListener('change', () => {
      document.getElementById('label-search-input').value = ex.title || '';
      document.getElementById('language-search-input').value = selLang.value || '';
      currentUserFilter = selUser.disabled ? null : (selUser.value || null);
      fetchAndRenderTable();
    });

    tbody.appendChild(tr);
  });
}

//This function creates the transcription table shown on tab 2 subtab 3
function renderSubtab3Table(clips) {

  //Resets the transcription table
  const container = document.getElementById('subtabC');
  const old = container.querySelector('table');
  if (old) old.remove();

  //Creating table with clean borders
  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';

  //Creates table head and header row
  const thead = tbl.createTHead();
  const headerRow = thead.insertRow();

  //Appends audio table head
  const thAudio = document.createElement('th');
  thAudio.textContent = 'Audio';
  thAudio.style.padding = '8px';
  thAudio.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thAudio);

  //Appends transcription table head
  const thTrans = document.createElement('th');
  thTrans.textContent = 'Transcription';
  thTrans.style.padding = '8px';
  thTrans.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thTrans);

  clips.forEach(clip => {
    //A row is added for each audio clip in clips
    const tr = tbl.insertRow();

    //Appends play button for this row that plays this audio clip when pressed
    const tdBtn = tr.insertCell();
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.classList.add('custom-button');
    btn.addEventListener('click', () => new Audio(clip.path).play());
    tdBtn.appendChild(btn);

    //Inserts transcription to row, or nothing if no transcription in supabase
    const tdTrans = tr.insertCell();
    tdTrans.style.border = '1px solid #A7A1C2';
    tdTrans.style.padding = '8px';
    tdTrans.textContent = clip.transcription || '';
  });

  //Row added to table
  container.appendChild(tbl);
}

async function fetchAndRenderTableD() {
  const labelFilter    = document.getElementById('label-search-input-d').value.trim();
  const languageFilter = document.getElementById('language-search-input-d').value.trim();
  const wrap = document.getElementById('record-table-wrap');

  if (!labelFilter) {
    wrap.classList.add('hidden');
    document.querySelector('#image-table-d thead tr').innerHTML = '';
    document.querySelector('#image-table-d tbody').innerHTML = '';
    return;
  }

  const { data: ex, error: exErr } = await supabaseClient
    .from('example')
    .select('id, width, title')
    .eq('title', labelFilter)
    .maybeSingle();
  if (exErr || !ex) {
    console.error('Could not load example for Step 2:', exErr || 'not found');
    wrap.classList.add('hidden');
    document.querySelector('#image-table-d thead tr').innerHTML = '';
    document.querySelector('#image-table-d tbody').innerHTML = '';
    return;
  }

  const { data: images, error: imgErr } = await supabaseClient
    .from('image')
    .select('id, image_path, position')
    .eq('example_id', ex.id)
    .order('position', { ascending: true });
  if (imgErr) { console.error('Error loading images (Step 2):', imgErr); return; }

  const { data: checks, error: ckErr } = await supabaseClient
    .from('checkmarks')
    .select('row_index, column_index')
    .eq('example_id', ex.id);
  if (ckErr) console.warn('Error loading checkmarks (Step 2):', ckErr);

  const columnsCount = Number.isFinite(ex.width) && ex.width > 0 ? ex.width : (images?.length ? 1 : 0);

  wrap.classList.remove('hidden');
  const tableEl = document.getElementById('image-table-d');
  const theadRow = tableEl.querySelector('thead tr');
  theadRow.innerHTML = '';

  // lock layout + explicit widths
  tableEl.style.tableLayout = 'fixed';
  const IMAGE_COL_PX = 140;  // << adjust as you like
  const COL_WIDTH_PX = 150;  // audio columns

  // --- Header cells ---
  const thImg = document.createElement('th');
  thImg.textContent = 'Image';
  thImg.style.width = IMAGE_COL_PX + 'px';
  thImg.style.verticalAlign = 'middle';
  thImg.style.padding = '8px';
  theadRow.appendChild(thImg);

  for (let c = 1; c <= columnsCount; c++) {
    const th  = document.createElement('th');
    th.style.width = COL_WIDTH_PX + 'px';
    th.style.verticalAlign = 'middle';
    th.style.padding = '8px';

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.flexWrap = 'nowrap';
    controls.style.justifyContent = 'center';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';
    th.appendChild(controls);

    const addPreviewPlayButton = (blob) => {
      controls.querySelectorAll('.preview-play').forEach(el => el.remove());
      const url = URL.createObjectURL(blob);
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play';
      playBtn.classList.add('custom-button', 'preview-play');
      playBtn.style.whiteSpace = 'nowrap';
      playBtn.addEventListener('click', () => new Audio(url).play());
      controls.appendChild(playBtn);
    };

    const recordBtn = document.createElement('button');
    recordBtn.textContent = 'Record';
    recordBtn.classList.add('custom-button');
    recordBtn.style.whiteSpace = 'nowrap';
    controls.appendChild(recordBtn);

    let mediaRecorder, chunks;

    recordBtn.addEventListener('click', async () => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        delete pendingRecordings[`col-${c}`];
        controls.querySelectorAll('.preview-play').forEach(el => el.remove());
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.start();
        recordBtn.textContent = 'Stop';
      } else {
        mediaRecorder.stop();
        recordBtn.textContent = 'Record';
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          pendingRecordings[`col-${c}`] = { blob, position: c };
          addPreviewPlayButton(blob);
        };
      }
    });

    if (pendingRecordings[`col-${c}`]) {
      const { blob } = pendingRecordings[`col-${c}`];
      addPreviewPlayButton(blob);
    }

    theadRow.appendChild(th);
  }

  // --- Body ---
  const tbody = document.querySelector('#image-table-d tbody');
  tbody.innerHTML = '';

  (images || []).forEach(img => {
    const tr = document.createElement('tr');

    const tdImg = document.createElement('td');
    tdImg.style.width = IMAGE_COL_PX + 'px'; // match header width
    tdImg.style.textAlign = 'center';
    const el = document.createElement('img');
    el.src = img.image_path;
    el.alt = ex.title || '';
    el.style.width = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    for (let c = 1; c <= columnsCount; c++) {
      const td = document.createElement('td');
      td.style.width = COL_WIDTH_PX + 'px';
      td.style.textAlign = 'center';
      const hasMark = (checks || []).some(k =>
        k.row_index === img.position && k.column_index === c
      );
      if (hasMark) {
        const mark = document.createElement('img');
        mark.src = 'images/checkmark.png';
        mark.alt = '✔';
        mark.style.width = '20px';
        mark.style.height = '20px';
        td.appendChild(mark);
      }
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });
}

async function fetchAndRenderExamplesTableD() {
  // 1) Fetch VERIFIED examples only
  const { data: examples, error } = await supabaseClient
    .from('example')
    .select('id, title, verification_status')
    .eq('verification_status', true)
    .order('created_at', { ascending: false });

  const tbody = document.querySelector('#examples-table-d tbody');
  const thead = document.querySelector('#examples-table-d thead tr');

  if (error) {
    console.error('Error fetching examples for Record tab:', error);
    return;
  }

  // Set table header
  if (thead) thead.innerHTML = '<th>Title</th>';

  // Clear old rows
  tbody.innerHTML = '';

  // If no verified examples
  if (!examples || examples.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'No verified examples available.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  // 2) Render simple table: only verified examples
  examples.forEach(ex => {
    const tr = document.createElement('tr');
    const td = document.createElement('td');

    td.textContent = ex.title;
    tr.appendChild(td);

    // Clicking selects example
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.getElementById('label-search-input-d').value = ex.title;
      currentLabel = ex.title;
      currentLanguage = null;

      // This loads Step 2 recording table normally
      fetchAndRenderTableD();
    });

    tbody.appendChild(tr);
  });
}

async function refreshStep3FromSession() {
  //Only refreshes recording trascription table if in a session
  if (!currentSessionId) return;

  //Fetching audio clips from this session
  const { data: clips, error } = await supabaseClient
    .from('audio_clips')
    .select('id, path, transcription, position')
    .eq('session_id', currentSessionId)
    .order('position', { ascending: true });

  //Throws error if cannot fetch audio clips
  if (error) {
    console.error('Error fetching session clips for step 3:', error);
    return;
  }

  //Organizes audio clips and calls renderRecordTranscriptionsTable() to rebuild the table
  const normalizedClips = clips
    .map(c => ({
      id: c.id,
      path: c.path,
      transcription: c.transcription,
      position: c.position
    }))
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  renderRecordTranscriptionsTable(normalizedClips);
}

function renderRecordTranscriptionsTable(clips) {
  //Remove old transcriptions table
  const container = document.getElementById('step-3');
  const old = container.querySelector('table');
  if (old) old.remove();

  //Create new table
  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';

  //Creating table Head
  const thead = tbl.createTHead();
  const headerRow = thead.insertRow();

  //"Audio" table header
  const thAudio = document.createElement('th');
  thAudio.textContent = 'Audio';
  thAudio.style.padding = '8px';
  thAudio.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thAudio);

  //"Your Transcription" table header
  const thInput = document.createElement('th');
  thInput.textContent = 'Your Transcription';
  thInput.style.padding = '8px';
  thInput.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thInput);

  //Row created for each audio clip
  clips.forEach(clip => {
    const tr = tbl.insertRow();

    //Creates play button for audio
    const tdBtn = tr.insertCell();
    tdBtn.style.border = '1px solid #A7A1C2';
    tdBtn.style.padding = '8px';
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.classList.add('custom-button');
    btn.addEventListener('click', () => {
      new Audio(clip.path).play();
    });
    tdBtn.appendChild(btn);

    //Creates cell for user to type transcription
    const tdInp = tr.insertCell();
    tdInp.style.border = '1px solid #A7A1C2';
    tdInp.style.padding = '8px';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type sentence…';
    input.style.width = '100%';

    //The cells where the user types the transcriptions are filled with prior transcriptions from this session so they aren't lost when switching between steps
    input.value = pendingTranscriptions[clip.id] || '';
    //Transcriptions stored in cache
    input.addEventListener('input', e => {
      pendingTranscriptions[clip.id] = e.target.value;
    });

    //Links transcription to audio clip
    input.dataset.clipId = clip.id;

    //Transcription added to table
    tdInp.appendChild(input);
  });

  //Table body added to table
  container.appendChild(tbl);
}

//Function to switch tabs
function openTab(tabId, clickedButton) {
  const btn = clickedButton || document.getElementById(`${tabId}-btn`);

  // Prevent opening disallowed tabs
  if (btn && btn.style.display === 'none') {
    return;
  }

  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
    tab.style.display = 'none';
  });

  // Remove 'active' from all buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  // Show the selected tab
  const content = document.getElementById(tabId);
  if (content) {
    content.classList.add('active');
    content.style.display = 'block';
  }

  // Highlight the clicked tab button
  if (btn) {
    btn.classList.add('active');
  }
}


//Function to switch nested tabs
function openNestedTab(subTabId, clickedButton, parentTabId) {
  // Students cannot access Listen -> Transcriptions
  if (currentRole === 'student' && subTabId === 'subtabC') return;

  //Hide all nested tab contents inside the parent tab
  document.querySelectorAll(`#${parentTabId} .nested-tab-content`).forEach(tab => {
    tab.classList.remove('active');
  });

  //Remove 'active' class from all nested buttons inside the parent tab
  document.querySelectorAll(`#${parentTabId} .nested-tab-button`).forEach(button => {
    button.classList.remove('active');
  });

  //Show the selected nested tab
  document.getElementById(subTabId).classList.add('active');

  //Highlight the clicked nested tab button
  clickedButton.classList.add('active');
}


//Recording Process
const totalSteps = 3;
let currentStep = 1;

async function showStep(step) {
  //Adjusts "active" class to show correct step
  for (let i = 1; i <= totalSteps; i++) {
    document.getElementById(`step-${i}`).classList.toggle('active', i === step);
  }

  //Adjust progress bar
  const pct = (step / totalSteps) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;

  //Step-switching based on buttons/current step
  const prevBtn   = document.getElementById('prev-btn');
  const nextBtn   = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-recordings-btn');
  const footer    = document.querySelector('.wizard-buttons');

  if (step === 1) {
    prevBtn.style.display       = 'none';
    nextBtn.style.display       = 'inline-block';
    submitBtn.style.display     = 'none';
    footer.style.justifyContent = 'flex-end';
  }
  else if (step === totalSteps) {
    prevBtn.style.display       = 'inline-block';
    nextBtn.style.display       = 'none';
    submitBtn.style.display     = 'inline-block';
    footer.style.justifyContent = 'space-between';
  }
  else {
    prevBtn.style.display       = 'inline-block';
    nextBtn.style.display       = 'inline-block';
    submitBtn.style.display     = 'none';
    footer.style.justifyContent = 'space-between';
  }

  //rendering step 2 tables
  if (step === 2) {
    fetchAndRenderExamplesTableD();
    fetchAndRenderTableD();
  }

  //fetching audio clips and rendering step 3 tables
  if (step === 3) {
    const clips = Object.entries(pendingRecordings).map(([id, { blob, position }]) => ({
      id,
      path: URL.createObjectURL(blob),
      position,
    }))
    .sort((a, b) => a.position - b.position);
    renderRecordTranscriptionsTable(clips);
  }
}

//Setting up buttons
document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentStep > 1)
    showStep(--currentStep);
});
document.getElementById('next-btn').addEventListener('click', async () => {
  if (currentStep === 1) {
    const language = document.getElementById('record-language').value.trim();
    if (!language) {
      alert('Please enter the language of your recording before continuing.');
      return;
    }
  }
  if (currentStep === 2) {
    const labelFilter = document.getElementById('label-search-input-d').value.trim();

    if (labelFilter) {
      const { data: ex } = await supabaseClient
        .from('example')
        .select('width')
        .eq('title', labelFilter)
        .maybeSingle();

      const requiredColumns = ex?.width || 0;

      const recordedColumns = Object.values(pendingRecordings).map(r => r.position);
      const uniqueRecorded = new Set(recordedColumns).size;

      if (uniqueRecorded < requiredColumns) {
        alert(`You must record audio for all ${requiredColumns} columns before continuing.`);
        return;
      }
    }
  }

  if (currentStep < totalSteps) {
    showStep(++currentStep);
  }
});



//Step 3 Submission
document.getElementById('submit-recordings-btn').addEventListener('click', async () => {
  const status = document.getElementById('submit-status');

  if (DEMO_MODE) {
    status.textContent = 'Submissions Not Allowed In Demo Version.';
    return;
  }

  if (currentRole === 'viewer') {
    status.textContent = 'Only recorders or creators can submit recordings.';
    return;
  }

  // Step 1 input
  const language = document.getElementById('record-language').value.trim();

  if (!currentLabel) {
    status.textContent = 'Pick an example in Step 2 first.';
    return;
  }

  if (!language) {
    status.textContent = 'Enter a language in Step 1.';
    return;
  }

  if (!Object.keys(pendingRecordings).length) {
    status.textContent = 'Record at least one clip.';
    return;
  }

  status.textContent = 'Preparing…';

  // 1) Resolve example_id from example title
  const { data: ex, error: exErr } = await supabaseClient
    .from('example')
    .select('id, title')
    .eq('title', currentLabel)
    .maybeSingle();

  if (exErr || !ex) {
    status.textContent = 'Could not find selected example.';
    console.error(exErr);
    return;
  }

  // 2) Build user string for recording_session.user
  let userString = null;
  {
    const { data: prof } = await supabaseClient
      .from('profiles')
      .select('first_name, username, email')
      .eq('id', currentUserId)
      .maybeSingle();

    userString =
      prof?.first_name ||
      prof?.username ||
      prof?.email ||
      'unknown';
  }

  // 3) Insert new row in recording_session
  status.textContent = 'Creating session…';

  const { data: sessionRow, error: sessionErr } = await supabaseClient
    .from('recording_session')
    .insert([{
      example_id: ex.id,
      language,
      user: userString,
      verification_status: false
    }])
    .select('id')
    .single();

  if (sessionErr) {
    status.textContent = sessionErr.message || 'Error creating session';
    console.error('SESSION ERR', sessionErr);
    return;
  }

  const sessionId = sessionRow.id;
  currentSessionId = sessionId;

  // 4) Upload all clips + insert into audio
  try {
    status.textContent = 'Uploading clips…';

    for (const clipId in pendingRecordings) {
      const { blob, position } = pendingRecordings[clipId];

      // The file path MUST start with 'recordings' to satisfy your policy
      const fileName = `recordings/${currentUserId}/${clipId}_${Date.now()}.webm`;

      // Upload to user-recordings bucket
      const up = await supabaseClient.storage
        .from('user-recordings')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false
        });

      if (up.error) throw up.error;

      // Get public URL
      const { data: pub, error: pubErr } = await supabaseClient
        .storage
        .from('user-recordings')
        .getPublicUrl(fileName);

      if (pubErr) throw pubErr;

      const publicUrl = pub.publicUrl;
      const transcription = pendingTranscriptions[clipId] || null;

      // Insert row into audio
      const { error: audioErr } = await supabaseClient
        .from('audio')
        .insert([{
          recording_session_id: sessionId,
          audio_path: publicUrl,
          position,
          transcription
        }]);

      if (audioErr) throw audioErr;
    }

    // Clean caches
    pendingTranscriptions = {};
    document.querySelectorAll('#step-3 input[type="text"]').forEach(i => i.value = '');
    pendingRecordings = {};

    status.textContent = '✅ All recordings saved!';
    
    await refreshStep3FromSession();

    currentStep = 3;
    showStep(3);

  } catch (err) {
    console.error(err);
    status.textContent = `Error: ${err.message}`;
  } finally {
    // Clear Step 1 inputs
    document.getElementById('record-language').value = '';
  }
});

//===============================================Variables and functions relevant to "Create Example" Tab
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

// Make safe strings for bucket names / paths
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanum -> "-"
    .replace(/^-+|-+$/g, '')       // trim dashes
    .slice(0, 80);
}

async function a_createExampleAndSessionFromStep1() {
  const { language, title, rows, cols } = a_collectStep1();

  // Insert EXAMPLE first
  const { data: ex, error: exErr } = await supabaseClient
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
  const { data: rs, error: rsErr } = await supabaseClient
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
    await supabaseClient.from('example').delete().eq('id', exampleId);
    throw rsErr;
  }

  // Save in state for later steps
  a.state.exampleId = exampleId;
  a.state.recordingSessionId = rs.id;

  return { exampleId, recordingSessionId: rs.id };
}

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
  const footer    = document.querySelector('#tab4 .wizard-buttons');

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

  if (currentRole !== 'creator') {
    statusEl.textContent = 'Only creators can create examples.';
    return;
  }

  // Leaving Step 1 → validate, persist to DB, then build grid
  if (a.currentStep === 1) {
    const { language, title, rows, cols } = a_collectStep1();
    if (!language || !title || rows < 1 || cols < 1) {
      statusEl.textContent = 'Please fill out Language, Title, Rows, and Columns (≥1).';
      return;
    }

    // Update local state + grid sizes
    a_applyStep1ToState();

    if (DEMO_MODE) {
      // DEMO: no DB write, just local state + grid
      statusEl.textContent = 'Demo mode: example will not be saved to the database.';
      a_buildGrid();
    } 
    else {
      try {
        statusEl.textContent = 'Creating draft in database…';
        const { exampleId, recordingSessionId } = await a_createExampleAndSessionFromStep1();
        statusEl.textContent =
          `Draft created (example: ${exampleId.slice(0,8)}…, session: ${recordingSessionId.slice(0,8)}…).`;

        a_buildGrid();
      } 
      catch (e) {
        console.error('DB insert failed', e);
        statusEl.textContent = 'Failed to create draft. Please try again.';
        return;
      }
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

    if (currentRole !== 'creator') {
      statusEl.textContent = 'Only creators can create examples.';
      return;
    }

    if (DEMO_MODE) {
      statusEl.textContent = 'Submissions Not Allowed In Demo Version.';
      return;
    }

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
  await supabaseClient.from('checkmarks').delete().eq('example_id', exampleId);

  // Insert all rows (Supabase supports large batches; chunk if you expect thousands)
  const { error } = await supabaseClient.from('checkmarks').insert(rows);
  if (error) throw error;

  return { inserted: rows.length };
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


    // put all admin images under the subfolder "admin-images/"
    // const path = `admin-images/${exampleId}/row-${r}-${Date.now()}-${slugify(file.name)}`;
    //const path = `row-${r}-${Date.now()}-${slugify(file.name)}`;
    const path = `admin-images/${exampleId}/row-${r}-${Date.now()}-${slugify(file.name)}`; //kyle's line


    console.log('+++4', path);

    const { error: upErr } = await supabaseClient.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) throw upErr;

    console.log('+++5', path);

    const { data: pub } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    rows.push({ example_id: exampleId, image_path: pub.publicUrl, position: r });
  }

  if (!rows.length) return { inserted: 0 };
  const { error } = await supabaseClient.from('image').insert(rows);
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

    // put all admin audios under the subfolder "admin-audios/"
    const path = `admin-audios/${sessionId}/col-${c}-${Date.now()}-${slugify(file.name)}`;

    const { error: upErr } = await supabaseClient.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) throw upErr;

    const { data: pub } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    rows.push({
      recording_session_id: sessionId,
      audio_path: pub.publicUrl,
      position: c,
      transcription: a.state.transcriptions[c] || null,
    });
  }

  if (!rows.length) return { inserted: 0 };
  const { error } = await supabaseClient.from('audio').insert(rows);
  if (error) throw error;
  return { inserted: rows.length, bucket };
}

//================================Security based on enum role

function applyRoleVisibility() {
  const role = currentRole || 'viewer';
  console.log('applyRoleVisibility – active role:', role);

  let allowedTabs;
  if (role === 'creator') {
    allowedTabs = ['tab1', 'tab2', 'tab3', 'tab4'];
  } else if (role === 'recorder') {
    allowedTabs = ['tab1', 'tab2', 'tab3'];
  } else {
    // default: viewer
    allowedTabs = ['tab1', 'tab2'];
  }

  ALL_TABS.forEach((tabId) => {
    const btn = document.getElementById(`${tabId}-btn`);
    const content = document.getElementById(tabId);
    const isAllowed = allowedTabs.includes(tabId);

    if (btn) {
      btn.style.display = isAllowed ? 'inline-block' : 'none';
    }

    if (content) {
      // Remove active class if not allowed
      if (!isAllowed) {
        content.classList.remove('active');
        content.style.display = 'none';
      } else {
        // We'll re-activate one allowed tab below
        if (!content.classList.contains('active')) {
          content.style.display = 'none';
        }
      }
    }
  });

  // Ensure there is exactly one active, allowed tab
  let activeAllowed = allowedTabs.find((tabId) => {
    const content = document.getElementById(tabId);
    return content && content.classList.contains('active');
  });

  if (!activeAllowed) {
    // default to the first allowed tab
    activeAllowed = allowedTabs[0];
  }

  const activeBtn = document.getElementById(`${activeAllowed}-btn`);
  openTab(activeAllowed, activeBtn);

  // Listen nested tabs visibility by role
  const subtabBBtn = document.getElementById('subtabB-btn'); // Images
  const subtabCBtn = document.getElementById('subtabC-btn'); // Transcriptions

  if (role === 'student') {
    if (subtabCBtn) subtabCBtn.style.display = 'none';
    if (subtabBBtn) subtabBBtn.style.display = 'inline-block';
    if (subtabBBtn) openNestedTab('subtabB', subtabBBtn, 'tab2'); // force Images
  } else {
    if (subtabCBtn) subtabCBtn.style.display = 'inline-block';
    if (subtabBBtn) subtabBBtn.style.display = 'inline-block';
  }

}
