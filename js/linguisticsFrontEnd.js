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

//Initialize Supabase client
const { createClient } = supabase; //Destructuring supabase object
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co'; //Project's supabase instance
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';
const supabaseClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); //Created supabase Client using previous 3 const's

//Demo version for recruiters
//Uses either ?demo=1 or #demo in the URL
const sp = new URLSearchParams(location.search);
const DEMO_MODE = sp.has('demo') || location.hash.toLowerCase().includes('demo');


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
    .select('first_name, last_name')
    .eq('id', userId)
    .single();

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

  //Fetch tables for tab 2 subtab 2. The transcriptions table for tab 2 subtab 3 is also constructed via a function call inside of fetchAndRenderTable()
  fetchAndRenderTable();
  fetchAndRenderExamplesTable();

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

  // If no example title, clear the table and stop
  if (!labelFilter) {
    document.querySelector('#image-table thead tr').innerHTML = '<th>Image</th>';
    document.querySelector('#image-table tbody').innerHTML = '';
    return;
  }

  // Resolve example PK by title
  const { data: ex, error: exErr } = await supabaseClient
    .from('example')
    .select('id')
    .eq('title', labelFilter)
    .maybeSingle();
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
  const theadRow = document.querySelector('#image-table thead tr');
  theadRow.innerHTML = '<th>Image</th>';
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
  const { data: examples, error } = await supabaseClient
    .from('example')
    .select('id, title, width, created_at')
    .order('created_at', { ascending: false });
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
  //Reading filter values
  const labelFilter    = document.getElementById('label-search-input-d').value.trim();
  const languageFilter = document.getElementById('language-search-input-d').value.trim();

  //If the filters are empty, empty table and end
  if (!labelFilter) {
    document.querySelector('#image-table-d thead tr').innerHTML = '<th>Image</th>';
    document.querySelector('#image-table-d tbody').innerHTML = '';
    return;
  }

  //Fetching the audio clips. This indicates the # of columns
  const { data: clips, error: clipsError } = await supabaseClient
    .from('audio_clips')
    .select('id, path')
    .eq('label',    labelFilter)
    .eq('language', languageFilter)
    .order('position', { ascending: true });
  if (clipsError) {
    console.error('Error loading audio_clips for Subtab D:', clipsError);
    return;
  }

  //Should de deleted later. Pretty sure this line inserts the audios from the db to step 3 instead of the session audios.
  renderRecordTranscriptionsTable(clips);

  //Building first row of table
  const theadRow = document.querySelector('#image-table-d thead tr');

  //Left-most cell is "image" text
  theadRow.innerHTML = '<th>Image</th>';

  //Table head and record button created once for each audio clip in the database version
  clips.forEach((clip, clipIndex) => {
    //Table head and record button created and added
    const th  = document.createElement('th');
    const btn = document.createElement('button');
    btn.textContent = 'Record';
    btn.classList.add('custom-button');

    //Recording variable and audio clip for this cell
    let mediaRecorder, chunks;

    //When record button clicked...
    btn.addEventListener('click', async () => {
      //If no recording variable or it's inactive...
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {

        //Remove old audio clip
        delete pendingRecordings[clip.id];

        //Removing old audio clip preview
        const oldPreview = btn.parentNode.querySelector('audio');
        if (oldPreview) oldPreview.remove();

        //Turning on the mic, starts recording, and prepares to collect audio chunks, while flipping the button UI to "stop"
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.start();
        btn.textContent = 'Stop';
      }

      //Ends the recording, saves the new audio blob in memory, and shows a playback preview
      else {
        mediaRecorder.stop();
        btn.textContent = 'Record';
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          pendingRecordings[clip.id] = {
            blob,
            position: clipIndex + 1
          };
          const preview = document.createElement('audio');
          preview.controls = true;
          preview.src = URL.createObjectURL(blob);
          btn.parentNode.appendChild(preview);
          btn.textContent = 'Record';
        };
      }
    });

    //Adds cell to header of table
    th.appendChild(btn);

    //Adds preview if exists
    if (pendingRecordings[clip.id]) {
      const { blob } = pendingRecordings[clip.id];
      const preview = document.createElement('audio');
      preview.controls = true;
      preview.src = URL.createObjectURL(blob);
      th.appendChild(preview);
    }
    theadRow.appendChild(th);
  });

  //Tries to fetch images required for this example
  const { data: images, error: imgErr } = await supabaseClient
    .from('images')
    .select('id, path, label')
    .eq('label', labelFilter)
    .order('position', { ascending: true });
  if (imgErr) return console.error(imgErr);

  //Tries to fetch the check mark locations
  const { data: mapData, error: mapErr } = await supabaseClient
    .from('image_audio_map')
    .select('image_id, column, has_check');
  if (mapErr) console.warn(mapErr);

  //Creating table body
  const tbody = document.querySelector('#image-table-d tbody');
  tbody.innerHTML = '';

  //Creating row for each image
  images.forEach(img => {
    //Adding image
    const tr = document.createElement('tr');
    const tdImg = document.createElement('td');
    const el    = document.createElement('img');
    el.src      = img.path;
    el.style.width  = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    //After image is added, for each column (indicated by a clip in the original database example), appends checkmark/blank
    clips.forEach((_, i) => {
      const td = document.createElement('td');
      const m  = mapData.find(m => m.image_id === img.id && m.column === i + 1);
      if (m?.has_check) {
        const mark = document.createElement('img');
        mark.src    = 'images/checkmark.png';
        mark.alt    = '✔';
        mark.style.width  = '20px';
        mark.style.height = '20px';
        td.appendChild(mark);
      }
      tr.appendChild(td);
    });

    //This row added to table
    tbody.appendChild(tr);
  });
}

async function fetchAndRenderExamplesTableD() {
  //Fetching required information for all audio clips that have position 1
  const { data, error } = await supabaseClient
    .from('audio_clips')
    .select(`
      label,
      language,
      user_id,
      profiles!audio_clips_user_id_fkey (
        first_name,
        last_name
      )
    `)
    .eq('position', 1)
    .order('created_at', { ascending: false });

  //Error thrown if cannot fetch audio clips' information
  if (error) {
    console.error('Error fetching examples for Subtab D:', error);
    return;
  }

  //Empties examples table
  const tbody = document.querySelector('#examples-table-d tbody');
  tbody.innerHTML = '';

  //Creating a row for each record from the SQL query
  data.forEach(row => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = row.label;
    tr.appendChild(tdLabel);

    //If a row is clicked, the filter values are adjusted, and then the top table displaying the example is remade
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', async () => {
      document.getElementById('language-search-input-d').value = row.language;
      document.getElementById('label-search-input-d').value    = row.label;
      currentLanguage = row.language;
      currentLabel    = row.label;
      fetchAndRenderTableD();
    });

    //Row added to table
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
  //Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  //Remove 'active' class from all buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  //Show the selected tab
  document.getElementById(tabId).classList.add('active');

  //Highlight the clicked tab button
  clickedButton.classList.add('active');
}

//Function to switch nested tabs
function openNestedTab(subTabId, clickedButton, parentTabId) {
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
document.getElementById('next-btn').addEventListener('click', () => {
  if (currentStep < totalSteps) {
    showStep(++currentStep);
  } 
  else {
    alert('All done!');
  }
});

//Step 3 Submission
document.getElementById('submit-recordings-btn').addEventListener('click', async () => {
  //message to user
  const status = document.getElementById('submit-status');

  //Prevents submission in demo
  if (DEMO_MODE) {
    status.textContent = 'To submit, move to non-demo version linked on resume.';
    return;
  }

  //Tells user submission is occuring
  status.textContent = 'Uploading…';
  

  //Reading step 1 values
  const language = document.getElementById('record-language').value.trim();
  const location = document.getElementById('record-location').value.trim();

  //Inserting user, title, language, and location to supabase
  //Returns session id
  const { data: sessionRow, error: sessionErr } = await supabaseClient
  .from('recording_sessions')
  .insert([{
    user_id:  currentUserId,
    label:    currentLabel,
    language,
    location
  }])
    .select('id')
    .single();

  //Throws error if couldn't create session
  if (sessionErr) {
    console.error('Could not create session:', sessionErr);
    status.textContent = 'Error creating session';
    return;
  }

  //Storing session id
  currentSessionId = sessionRow.id;

  //Clears out step 1 input values
  document.getElementById('record-language').value = '';
  document.getElementById('record-location').value = '';

  try {
    //Storing audio clips
    for (const clipId in pendingRecordings) {
    const { blob, position } = pendingRecordings[clipId];
    const fileName = `${clipId}_${Date.now()}.webm`;

    //Uploading audio clips to supabase bucket
    const { data: up, error: upErr } = await supabaseClient
      .storage
      .from('user-recordings')
      .upload(fileName, blob);

    //Error catching
    if (upErr) throw upErr;

    //Getting url from bucket in supabase
    const { data: urlData, error: urlErr } = await supabaseClient
      .storage
      .from('user-recordings')
      .getPublicUrl(fileName);

    //Error catching and storing
    if (urlErr) throw urlErr;
    const publicUrl = urlData.publicUrl;

    //Inserting information in supabase database
    const id = crypto.randomUUID();
    const transcription = pendingTranscriptions[clipId] || null;
    const { error: dbErr } = await supabaseClient
      .from('audio_clips')
      .insert([{
        id,
        user_id:       currentUserId,
        session_id:    currentSessionId,
        label:         currentLabel,
        language:      language, // from step 1
        path:          publicUrl,
        position:      position,
        verified:      false,
        transcription: transcription,
        annotation:    null
      }]);

    //Error catching
    if (dbErr) throw dbErr;
    }

    //Clearing step 3 input values
    pendingTranscriptions = {};
    document.querySelectorAll('#step-3 input[type="text"]').forEach(input => input.value = '');




  
    //Clearing step 2 input values
    pendingRecordings = {};
    status.textContent = 'All recordings saved!';

    //Refreshing table that displays selected example
    fetchAndRenderTableD();

    //Refresh step 3 based on step 2
    await refreshStep3FromSession();

    //Stay on step 3
    currentStep = 3;
    showStep(3);
  }

  //Error catching
  catch (err) {
    console.error(err);
    status.textContent = `Error: ${err.message}`;
  }
});