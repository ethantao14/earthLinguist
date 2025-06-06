// 1️⃣ Initialize Supabase client
const { createClient } = supabase; 
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';
const supabaseClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Sign-up
document.getElementById('signup-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({ email, password });

  if (signUpError) {
    document.getElementById('auth-message').textContent = signUpError.message;
    return;
  }

  const userId = signUpData.user?.id;
  if (userId) {
    await supabaseClient.from('profiles').insert([{ id: userId, first_name: firstName, last_name: lastName }]);
  }

  document.getElementById('auth-message').textContent = 'Sign-up successful! Please log in.';
});

// Log-in
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById('auth-message').textContent = error.message;
  } else {
    checkLoginStatus();
  }
});

// Log-out
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  location.reload();
});

async function checkLoginStatus() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const session = sessionData.session;
  if (!session) return;

  const userId = session.user.id;
  const { data: profileData } = await supabaseClient
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', userId)
    .single();

  // Show/hide sections
  document.getElementById('auth-section').style.display = 'none';
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


window.addEventListener('load', () => {
  checkLoginStatus();
});



const langInput = document.getElementById('language-search-input');
const labelInput = document.getElementById('label-search-input');
labelInput.addEventListener('input', () => fetchAndRenderTable());
langInput.addEventListener('input',  () => fetchAndRenderTable());
// seed the table on first load (with whatever initial label/value you want),
// or leave both blank to show only the header until the user types.
fetchAndRenderTable();






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
    .select('id, path')
    .eq('label',    labelFilter)
    .eq('language', languageFilter)
    .order('position', { ascending: true });
  if (clipsError) {
    console.error('Error loading audio_clips:', clipsError);
    return;
  }

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
  const { data, error } = await supabaseClient
    .from('audio_clips')
    .select('label, language, user')
    .eq('position', 1)  // only clips with position = 1
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching audio_clips examples:', error);
    return;
  }

  const tbody = document.querySelector('#examples-table tbody');
  tbody.innerHTML = '';

  data.forEach(row => {
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.textContent = row.label;
    tr.appendChild(tdLabel);

    const tdLang = document.createElement('td');
    tdLang.textContent = row.language;
    tr.appendChild(tdLang);

    const tdUser = document.createElement('td');
    tdUser.textContent = row.user;
    tr.appendChild(tdUser);

    // Make row clickable: use that row’s label and language
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      document.getElementById('language-search-input').value = row.language;
      document.getElementById('label-search-input').value = row.label;
      fetchAndRenderTable();
    });

    tbody.appendChild(tr);
  });
}



  





window.onload = function() {
    // // Attach event listeners to main tabs
    // // document.getElementById("tab1-btn").addEventListener("click", function() {
    // //     openTab("tab1", this);
    // // });

    // document.getElementById("tab2-btn").addEventListener("click", function() {
    //     openTab("tab2", this);
    // });

    // document.getElementById("tab3-btn").addEventListener("click", function() {
    //     openTab("tab3", this);
    // });

    // // Attach event listeners to nested tabs in Tab 2
    // // document.getElementById("subtabA-btn").addEventListener("click", function() {
    // //     openNestedTab("subtabA", this, "tab2");
    // // });

    // document.getElementById("subtabB-btn").addEventListener("click", function() {
    //     openNestedTab("subtabB", this, "tab2");
    // });

    // document.getElementById("subtabC-btn").addEventListener("click", function() {
    //     openNestedTab("subtabC", this, "tab2");
    // });
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

const playButtons = document.querySelectorAll("#subtabB .custom-button");
playButtons.forEach(function(button) {
    button.addEventListener('click', function() {
        const audioPath = this.getAttribute('data-audio');
        let audio = new Audio(audioPath);
        audio.currentTime = 0;
        audio.play();
    });
});




// ─── Wizard Logic for Tab 3 ───
const totalSteps = 5;
let currentStep = 1;

function showStep(step) {
  // show/hide steps
  for (let i = 1; i <= totalSteps; i++) {
    document
      .getElementById(`step-${i}`)
      .classList.toggle('active', i === step);
  }

  // update progress bar (0% at step1, 100% at step5)
  const pct = ((step - 1) / (totalSteps - 1)) * 100;
  document.getElementById('progress-bar').style.width = `${pct}%`;

  // prev button visibility
  document.getElementById('prev-btn').style.visibility =
    step === 1 ? 'hidden' : 'visible';

  // next button label
  document.getElementById('next-btn').textContent =
    step === totalSteps ? 'Finish' : 'Next';
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
    // or navigate away/save…
  }
});

// initialize on load
window.addEventListener('load', () => {
  showStep(currentStep);
});