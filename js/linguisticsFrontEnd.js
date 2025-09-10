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

//Initialize Supabase client
const { createClient } = supabase; //Destructuring supabase object
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co'; //Project's supabase instance
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';
const supabaseClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); //Created supabase Client using previous 3 const's

//Demo version for recruiters
//Uses either ?demo=1 or #demo in the URL
const DEMO_MODE =
  new URLSearchParams(location.search).get('demo') === '1' ||
  location.hash.toLowerCase().includes('demo');

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
      .ilike('username', identifier)  // case-insensitive match
      .maybeSingle();

    if (profErr || !prof?.email) {
      msg.textContent = 'Invalid login credentials.';
      return;
    }
    emailToUse = prof.email;
  }



  
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: emailToUse,
    password
  });

  if (error) {
    console.error('Login failed:', error);
    // keep message generic to avoid username/email enumeration
    msg.textContent = 'Invalid login credentials.';
    return;
  }

  msg.textContent = '';
  await checkLoginStatus(); // reveal app

  // clear sign-up fields (unchanged)
  document.getElementById('first-name').value = '';
  document.getElementById('last-name').value = '';
  document.getElementById('email-signup').value = '';
  document.getElementById('password-signup').value = '';
  document.getElementById('auth-message-signup').textContent = '';
  document.getElementById('username-signup').value = '';
});






// Log-out
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

async function checkLoginStatus() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData?.session;
  if (!session) return;

  const userId = session.user.id;

  currentUserId = userId;

  const { data: profileData } = await supabaseClient
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();

  // Show/hide sections
  const authWrapper = document.querySelector('.auth-wrapper'); // the actual container in your HTML
  if (authWrapper) authWrapper.style.display = 'none';
  document.getElementById('app-section').style.display = 'block';


  // ✅ DOM elements now exist. Safe to add event listeners.
  document.getElementById("tab1-btn").addEventListener("click", function() {
    openTab("tab1", this);
  });

  document.getElementById("tab2-btn").addEventListener("click", function() {
    openTab("tab2", this);
  });

  document.getElementById("tab3-btn").addEventListener("click", function() {
    openTab("tab3", this);
  });

  document.getElementById("subtabA-btn").addEventListener("click", function() {
    openNestedTab("subtabA", this, "tab2");
  });

  document.getElementById("subtabB-btn").addEventListener("click", function() {
    openNestedTab("subtabB", this, "tab2");
  });

  document.getElementById("subtabC-btn").addEventListener("click", function() {
    openNestedTab("subtabC", this, "tab2");
    
  });







  // Update UI with name
  const nameSpan = document.getElementById('welcome-name');
  if (nameSpan) {
    nameSpan.textContent = profileData
      ? `${profileData.first_name} ${profileData.last_name}`
      : session.user.email;
  }

  // Fetch tables
  fetchAndRenderTable();
  fetchAndRenderExamplesTable();
}

function bootDemo() {
  // Hide auth UI, show app
  const authWrapper = document.querySelector('.auth-wrapper');
  if (authWrapper) authWrapper.style.display = 'none';
  const app = document.getElementById('app-section');
  if (app) app.style.display = 'block';

  // Anonymous greeting, hide logout
  const nameSpan = document.getElementById('welcome-name');
  if (nameSpan) nameSpan.textContent = 'Anonymous';
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.style.display = 'none';

  // Wire tabs (these were wired inside checkLoginStatus for the real app)
  document.getElementById("tab1-btn").addEventListener("click", function() { openTab("tab1", this); });
  document.getElementById("tab2-btn").addEventListener("click", function() { openTab("tab2", this); });
  document.getElementById("tab3-btn").addEventListener("click", function() { openTab("tab3", this); });
  document.getElementById("subtabA-btn").addEventListener("click", function() { openNestedTab("subtabA", this, "tab2"); });
  document.getElementById("subtabB-btn").addEventListener("click", function() { openNestedTab("subtabB", this, "tab2"); });
  document.getElementById("subtabC-btn").addEventListener("click", function() { openNestedTab("subtabC", this, "tab2"); });

  // Read-only data loads (requires your Supabase RLS to allow anonymous SELECT)
  fetchAndRenderTable();
  fetchAndRenderExamplesTable();

  // Make sure the wizard renders
  showStep(1);
}




window.addEventListener('load', () => {
  if (DEMO_MODE) {
    bootDemo();
  } else {
    checkLoginStatus();
  }
});




const langInput = document.getElementById('language-search-input');
const labelInput = document.getElementById('label-search-input');
labelInput.addEventListener('input', () => fetchAndRenderTable());
langInput.addEventListener('input',  () => fetchAndRenderTable());

// 2) Grab D’s inputs
const langInputD  = document.getElementById('language-search-input-d');
const labelInputD = document.getElementById('label-search-input-d');

// 3) Re-fetch when D’s filters change
labelInputD.addEventListener('input', fetchAndRenderTableD);
langInputD.addEventListener('input',  fetchAndRenderTableD);

// still seed subtab B as before:
fetchAndRenderTable();
fetchAndRenderExamplesTable();







async function fetchAndRenderTable() {
  // 1) Read the two filters
  const labelFilter    = labelInput.value.trim();
  const languageFilter = langInput.value.trim();

  // 2) If no label is entered, clear the table and stop
  if (!labelFilter) {
    document.querySelector('#image-table thead tr').innerHTML = '<th>Image</th>';
    document.querySelector('#image-table tbody').innerHTML = '';
    return;
  }

  // 3) Fetch the audio clips matching both label AND language
  const { data: clips, error: clipsError } = await supabaseClient
    .from('audio_clips')
    .select('id, path, transcription')
    .eq('label',    labelFilter)
    .eq('language', languageFilter)
    .order('position', { ascending: true });
  if (clipsError) {
    console.error('Error loading audio_clips:', clipsError);
    return;
  }

  renderSubtab3Table(clips);

  


  // 4) Build the <thead> (one “Image” + one “Play” per clip)
  const theadRow = document.querySelector('#image-table thead tr');
  theadRow.innerHTML = '<th>Image</th>';
  clips.forEach(clip => {
    const th  = document.createElement('th');
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.classList.add('custom-button');
    btn.addEventListener('click', () => new Audio(clip.path).play());
    th.appendChild(btn);
    theadRow.appendChild(th);
  });

  // 5) Fetch the images matching only the label
  const { data: images, error: imgError } = await supabaseClient
    .from('images')
    .select('id, path, label')
    .eq('label', labelFilter)
    .order('position', { ascending: true });
  if (imgError) {
    console.error('Error loading images:', imgError);
    return;
  }

    // 6️⃣ Fetch the image-audio mapping USING column instead of audio_clip_id
  const { data: mapData, error: mapError } = await supabaseClient
    .from('image_audio_map')
    .select('image_id, column, has_check');
  if (mapError) {
    console.error('Map load error:', mapError);
    // we can still continue, but no checkmarks will appear
  }

  // 7️⃣ Build the <tbody>
  const tbody = document.querySelector('#image-table tbody');
  tbody.innerHTML = '';
  images.forEach(img => {
    const tr = document.createElement('tr');

    // — first cell: the image
    const tdImg = document.createElement('td');
    const el    = document.createElement('img');
    el.src      = img.path;
    el.alt      = img.label || '';
    el.style.width  = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    // — one cell per clip, with checkmark logic based on `column`
    clips.forEach((clip, clipIndex) => {
      const td = document.createElement('td');

      // Compute this clip's columnNumber = clipIndex + 1
      const columnNumber = clipIndex + 1;
      // Look for a mapping where image_id matches and column matches
      const mapping = mapData.find(
        m => m.image_id === img.id && m.column === columnNumber
      );

      if (mapping?.has_check) {
        const mark = document.createElement('img');
        mark.src    = 'images/checkmark.png';
        mark.alt    = '✔';
        mark.style.width  = '20px';
        mark.style.height = '20px';
        td.appendChild(mark);
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

}


async function fetchAndRenderExamplesTable() {
  // 1) Grab position=1 clips, plus join in the profile row
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

  if (error) {
    console.error('Error fetching examples:', error);
    return;
  }

  const tbody = document.querySelector('#examples-table tbody');
  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');

    // Label cell
    const tdLabel = document.createElement('td');
    tdLabel.textContent = row.label;
    tr.appendChild(tdLabel);

    // Language cell
    const tdLang = document.createElement('td');
    tdLang.textContent = row.language;
    tr.appendChild(tdLang);

    // User cell: use joined profile, fallback to raw user_id
    const tdUser = document.createElement('td');
    if (row.profiles) {
      tdUser.textContent = `${row.profiles.first_name} ${row.profiles.last_name}`;
    } else {
      tdUser.textContent = row.user_id;
    }
    tr.appendChild(tdUser);

    // Make row clickable to re-run main table
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.getElementById('language-search-input').value = row.language;
      document.getElementById('label-search-input').value    = row.label;
      fetchAndRenderTable();
    });

    tbody.appendChild(tr);
  });
}




  function renderSubtab3Table(clips) {
  const container = document.getElementById('subtabC');
  const old = container.querySelector('table');
  if (old) old.remove();

  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';

  // ─── column headers ───
  const thead = tbl.createTHead();
  const headerRow = thead.insertRow();

  const thAudio = document.createElement('th');
  thAudio.textContent = 'Audio';
  thAudio.style.padding = '8px';
  thAudio.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thAudio);

  const thTrans = document.createElement('th');
  thTrans.textContent = 'Transcription';
  thTrans.style.padding = '8px';
  thTrans.style.border = '1px solid #A7A1C2';
  headerRow.appendChild(thTrans);

  // ─── one row per clip ───
  clips.forEach(clip => {
    const tr = tbl.insertRow();

    // left cell: Play button
    const tdBtn = tr.insertCell();
    const btn = document.createElement('button');
    btn.textContent = 'Play';
    btn.classList.add('custom-button');
    btn.addEventListener('click', () => new Audio(clip.path).play());
    tdBtn.appendChild(btn);

    // right cell: transcription text
    const tdTrans = tr.insertCell();
    tdTrans.style.border = '1px solid #A7A1C2';
    tdTrans.style.padding = '8px';
    tdTrans.textContent = clip.transcription || '';
  });

  container.appendChild(tbl);
}



async function fetchAndRenderTableD() {
  // 1) Read filters
  const labelFilter    = document.getElementById('label-search-input-d').value.trim();
  const languageFilter = document.getElementById('language-search-input-d').value.trim();

  // 2) If empty, clear table
  if (!labelFilter) {
    document.querySelector('#image-table-d thead tr').innerHTML = '<th>Image</th>';
    document.querySelector('#image-table-d tbody').innerHTML = '';
    return;
  }

  // 3) Fetch clips
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

  renderRecordTranscriptionsTable(clips);


  // 4) Build THEAD (one “Image” + one “Record” button per clip)
  const theadRow = document.querySelector('#image-table-d thead tr');
  theadRow.innerHTML = '<th>Image</th>';
  clips.forEach((clip, clipIndex) => {
    const th  = document.createElement('th');
    const btn = document.createElement('button');
    btn.textContent = 'Record';
    btn.classList.add('custom-button');

    let mediaRecorder, chunks;

    btn.addEventListener('click', async () => {
      // start recording
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {

        delete pendingRecordings[clip.id];
        const oldPreview = btn.parentNode.querySelector('audio');
        if (oldPreview) oldPreview.remove();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.start();
        btn.textContent = 'Stop';
      }
      // stop & upload
      else {
        mediaRecorder.stop();
        btn.textContent = 'Record';

        mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        // store both the blob and its button‐index (position)
        pendingRecordings[clip.id] = {
          blob,
          position: clipIndex + 1
        };

        // preview
        const preview = document.createElement('audio');
        preview.controls = true;
        preview.src = URL.createObjectURL(blob);
        btn.parentNode.appendChild(preview);

        btn.textContent = 'Record';
      };


      }
    });

    th.appendChild(btn);



    if (pendingRecordings[clip.id]) {
    const { blob } = pendingRecordings[clip.id];
    const preview = document.createElement('audio');
    preview.controls = true;
    preview.src = URL.createObjectURL(blob);
    th.appendChild(preview);
  }

    theadRow.appendChild(th);
  });

  // 5) rest of your body‐building code unchanged…
  const { data: images, error: imgErr } = await supabaseClient
    .from('images')
    .select('id, path, label')
    .eq('label', labelFilter)
    .order('position', { ascending: true });
  if (imgErr) return console.error(imgErr);

  const { data: mapData, error: mapErr } = await supabaseClient
    .from('image_audio_map')
    .select('image_id, column, has_check');
  if (mapErr) console.warn(mapErr);

  const tbody = document.querySelector('#image-table-d tbody');
  tbody.innerHTML = '';
  images.forEach(img => {
    const tr = document.createElement('tr');
    // image cell
    const tdImg = document.createElement('td');
    const el    = document.createElement('img');
    el.src      = img.path;
    el.style.width  = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    // one checkmark cell per clip
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

    tbody.appendChild(tr);
  });
}



async function fetchAndRenderExamplesTableD() {
  // 1) Fetch examples plus joined profile data
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

  if (error) {
    console.error('Error fetching examples for Subtab D:', error);
    return;
  }

  // 2) Render into the D-tab’s <tbody>
  const tbody = document.querySelector('#examples-table-d tbody');
  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');

    // Label cell
    const tdLabel = document.createElement('td');
    tdLabel.textContent = row.label;
    tr.appendChild(tdLabel);

    // Click to re-run D-tab’s main table
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', async () => {
      // 1) Set the inputs & context
      document.getElementById('language-search-input-d').value = row.language;
      document.getElementById('label-search-input-d').value    = row.label;
      currentLanguage = row.language;
      currentLabel    = row.label;

      

      // 3) Now load the D‐tab clips table
      fetchAndRenderTableD();
    });


    tbody.appendChild(tr);
  });
}


async function refreshStep3FromSession() {
  if (!currentSessionId) return;

  // Get the clips we just saved for this session, ordered by position
  const { data: clips, error } = await supabaseClient
    .from('audio_clips')
    .select('id, path, transcription, position')
    .eq('session_id', currentSessionId)
    .order('position', { ascending: true });

  if (error) {
    console.error('Error fetching session clips for step 3:', error);
    return;
  }

  // Map to the shape renderRecordTranscriptionsTable expects (it only uses id, path, transcription)
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
  const container = document.getElementById('step-3');
  // remove any old table
  const old = container.querySelector('table');
  if (old) old.remove();

  // build new table
  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';

  // ─── headers ───
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

  // ─── one row per clip ───
  clips.forEach(clip => {
    const tr = tbl.insertRow();

    // ◼ Play button cell
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

    // ◼ Input cell
    const tdInp = tr.insertCell();
    tdInp.style.border = '1px solid #A7A1C2';
    tdInp.style.padding = '8px';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type sentence…';
    input.style.width = '100%';

      // restore any previous value
  input.value = pendingTranscriptions[clip.id] || '';
  // update our store on every keystroke
  input.addEventListener('input', e => {
    pendingTranscriptions[clip.id] = e.target.value;
  });



    // associate with clip.id if you need later
    input.dataset.clipId = clip.id;
    tdInp.appendChild(input);
  });

  container.appendChild(tbl);
}




window.onload = function() {
    fetchAndRenderExamplesTable();
};



// Function to switch tabs
function openTab(tabId, clickedButton) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove 'active' class from all buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Show the selected tab
    document.getElementById(tabId).classList.add('active');

    // Highlight the clicked tab button
    clickedButton.classList.add('active');
}

// Function to switch nested tabs
function openNestedTab(subTabId, clickedButton, parentTabId) {
    // Hide all nested tab contents inside the parent tab
    document.querySelectorAll(`#${parentTabId} .nested-tab-content`).forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove 'active' class from all nested buttons inside the parent tab
    document.querySelectorAll(`#${parentTabId} .nested-tab-button`).forEach(button => {
        button.classList.remove('active');
    });

    // Show the selected nested tab
    document.getElementById(subTabId).classList.add('active');

    // Highlight the clicked nested tab button
    clickedButton.classList.add('active');
}


// ─── Wizard Logic for Tab 3 ───
const totalSteps = 3;
let currentStep = 1;

async function showStep(step) {
  // 1) show/hide steps
  for (let i = 1; i <= totalSteps; i++) {
    document
      .getElementById(`step-${i}`)
      .classList.toggle('active', i === step);
  }

  // 2) update progress bar: 1/3, 2/3, 3/3
  const pct = (step / totalSteps) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;



  // ─── swap Prev / Next / Submit & align ───
  const prevBtn   = document.getElementById('prev-btn');
  const nextBtn   = document.getElementById('next-btn');
  const submitBtn = document.getElementById('submit-recordings-btn');
  const footer    = document.querySelector('.wizard-buttons');

  if (step === 1) {
    // only “Next”, centered
    prevBtn.style.display       = 'none';
    nextBtn.style.display       = 'inline-block';
    submitBtn.style.display     = 'none';
    footer.style.justifyContent = 'flex-end';
  }
  else if (step === totalSteps) {
    // “Prev” at left, “Submit” at right
    prevBtn.style.display       = 'inline-block';
    nextBtn.style.display       = 'none';
    submitBtn.style.display     = 'inline-block';
    footer.style.justifyContent = 'space-between';
  }
  else {
    // “Prev” at left, “Next” at right
    prevBtn.style.display       = 'inline-block';
    nextBtn.style.display       = 'inline-block';
    submitBtn.style.display     = 'none';
    footer.style.justifyContent = 'space-between';
  }




  







  if (step === 2) {
    fetchAndRenderExamplesTableD();
    fetchAndRenderTableD();
  }

  if (step === 3) {
  // Build the clip list from your in‑memory pendingRecordings
  const clips = Object.entries(pendingRecordings)
    .map(([id, { blob, position }]) => ({
      id,
      path: URL.createObjectURL(blob),
      position,
    }))
    .sort((a, b) => a.position - b.position);

  renderRecordTranscriptionsTable(clips);
}

}

// wire up buttons
document.getElementById('prev-btn').addEventListener('click', () => {
  if (currentStep > 1) showStep(--currentStep);
});
document.getElementById('next-btn').addEventListener('click', () => {
  if (currentStep < totalSteps) {
    showStep(++currentStep);
  } else {
    // final step “Finish” action
    alert('All done!');
  }
});

// initialize on load
window.addEventListener('load', () => {
  showStep(currentStep);
});





// ─── BATCH-SUBMIT: “Submit All Recordings” ───
document
  .getElementById('submit-recordings-btn')
  .addEventListener('click', async () => {
    const status = document.getElementById('submit-status');

    // Demo: block writes
    if (DEMO_MODE) {
      status.textContent = 'To submit, move to non-demo version linked on resume.';
      return;
    }

    status.textContent = 'Uploading…';
    

    // 0️⃣ Create a fresh session, capturing Step 1’s language & location
    const language = document.getElementById('record-language').value.trim();
    const location = document.getElementById('record-location').value.trim();

    const { data: sessionRow, error: sessionErr } = await supabaseClient
    .from('recording_sessions')
    .insert([{
      user_id:  currentUserId,
      label:    currentLabel,
      language,      // ← newly added
      location       // ← newly added
    }])
      .select('id')
      .single();

    if (sessionErr) {
      console.error('Could not create session:', sessionErr);
      status.textContent = 'Error creating session';
      return;
    }
    currentSessionId = sessionRow.id;
    // Clear out the Step 1 fields now that we’ve saved them:
    document.getElementById('record-language').value = '';
    document.getElementById('record-location').value = '';



    try {
      // Upload each staged blob and insert a row, carrying over language and any transcription from step 3
for (const clipId in pendingRecordings) {
  const { blob, position } = pendingRecordings[clipId];
  const fileName = `${clipId}_${Date.now()}.webm`;

  // 1️⃣ Upload to Storage
  const { data: up, error: upErr } = await supabaseClient
    .storage
    .from('user-recordings')
    .upload(fileName, blob);
  if (upErr) throw upErr;

  // 1️⃣·b) Get its public URL
  const { data: urlData, error: urlErr } = await supabaseClient
    .storage
    .from('user-recordings')
    .getPublicUrl(fileName);
  if (urlErr) throw urlErr;
  const publicUrl = urlData.publicUrl;

  // 2️⃣ Insert into audio_clips, including step-1 language and corresponding transcription
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
  if (dbErr) throw dbErr;
}

// CLEAR STEP 3 state & inputs (transcriptions)
pendingTranscriptions = {};
document
  .querySelectorAll('#step-3 input[type="text"]')
  .forEach(input => input.value = '');




  
      // 3️⃣ Cleanup & refresh
pendingRecordings = {};
status.textContent = 'All recordings saved!';

// refresh the D tab’s table as you already do
fetchAndRenderTableD();

// then immediately refresh step 3 from the saved session and show it
await refreshStep3FromSession();
currentStep = 3;            // keep your wizard state consistent
showStep(3);

    } catch (err) {
      console.error(err);
      status.textContent = `Error: ${err.message}`;
    }
  });
