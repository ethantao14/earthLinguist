// 1️⃣ Initialize Supabase client
const { createClient } = supabase; 
const SUPABASE_URL    = 'https://wqmcsvamrfaxcbcvbyxv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxbWNzdmFtcmZheGNiY3ZieXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MTExMDAsImV4cCI6MjA2MjM4NzEwMH0.mQNXXwbn9baTQBQBn84f7ytvD2aYjk6bdnJTdc0wHrY';
const supabaseClient  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchAndRenderTable(labelFilter = '') {
  // 1️⃣ fetch audio clips (for headers)
  const { data: clips, error: clipsError } = await supabaseClient
    .from('audio_clips')
    .select('id, path, label')
    .order('position', { ascending: true });

  if (clipsError) {
    console.error('Error loading audio_clips:', clipsError);
    return;
  }

  // 2️⃣ build the <thead>
  const theadRow = document.querySelector('#image-table thead tr');
  theadRow.innerHTML = '';                    // clear any existing <th>
  // first column header remains “Image”
  const imgTh = document.createElement('th');
  imgTh.textContent = 'Image';
  theadRow.appendChild(imgTh);

  // then one <th> per clip, with a button
  clips.forEach(clip => {
    const th = document.createElement('th');
    const btn = document.createElement('button');
    btn.textContent = clip.label;
    btn.classList.add('custom-button');

    // on click, generate the public URL & play
    btn.addEventListener('click', () => {
      // clip.path already holds a full https://… URL
      new Audio(clip.path).play();
    });
    

    th.appendChild(btn);
    theadRow.appendChild(th);
  });

  // 3️⃣ fetch images (for rows)
  let imgQuery = supabaseClient
  .from('images')
  .select('id, path, label')
  .order('position', { ascending: true });
if (labelFilter.trim()) {
  imgQuery = imgQuery.eq('label', labelFilter.trim());
}
const { data: images, error: imgError } = await imgQuery;


  if (imgError) {
    console.error('Error loading images:', imgError);
    return;
  }

    // … after fetching clips …

  // ❇️ FETCH YOUR MAPPING OF CHECKMARKS
  const { data: mapData, error: mapError } = await supabaseClient
    .from('image_audio_map')
    .select('image_id, audio_clip_id, has_check');
  if (mapError) console.error('Map load error:', mapError);

  // … then fetching images …

  // 4️⃣ build the <tbody>
  const tbody = document.querySelector('#image-table tbody');
  tbody.innerHTML = '';  // clear old rows

  images.forEach(img => {
    const tr = document.createElement('tr');

    // — first cell: the image (unchanged) …
    const tdImg = document.createElement('td');
    const el   = document.createElement('img');
    el.src     = img.path;
    el.alt     = img.label || '';
    el.style.width  = '100px';
    el.style.height = 'auto';
    tdImg.appendChild(el);
    tr.appendChild(tdImg);

    // — now populate one cell per clip **with** checkmark logic
    clips.forEach(clip => {
      const td = document.createElement('td');

      // find the matching row in image_audio_map
      const mapping = mapData.find(
        m => m.image_id === img.id && m.audio_clip_id === clip.id
      );

      if (mapping?.has_check) {
        const mark = document.createElement('img');
        mark.src    = 'images/checkmark.png';    // or your hosted path
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

// ➕ wire up the new input
document
  .getElementById('image-search-input')
  .addEventListener('input', e => {
    fetchAndRenderTable(e.target.value);
  });


// on load, run it
window.addEventListener('load', () => {
  fetchAndRenderTable();
});


// 3️⃣ Hook it up on page load
window.addEventListener('load', () => {
  fetchAndRenderImages();
});





// // ① Initialise Supabase first
// const { createClient } = supabase
// // ── NEW ──
// // Fetch all rows from ImageGroup and render into the <ul id="test-groups">
// async function fetchAndShowTestGroups() {
//     // 1) grab every column from every row
//     const { data, error } = await supabaseClient
//       .from('ImageGroup')
//       .select('*')
  
//     if (error) {
//       console.error('Fetch ImageGroup failed:', error)
//       return
//     }
//     if (!data || data.length === 0) {
//       console.log('No rows in ImageGroup')
//       return
//     }
  
//     // 2) get a handle on your table
//     const table = document.getElementById('group-table')
//     table.innerHTML = ''            // clear any prior content
  
//     // 3) build the header row from the keys of the first object
//     const thead = document.createElement('thead')
//     const headerRow = document.createElement('tr')
//     Object.keys(data[0]).forEach(colName => {
//       const th = document.createElement('th')
//       th.textContent = colName
//       headerRow.appendChild(th)
//     })
//     thead.appendChild(headerRow)
//     table.appendChild(thead)
  
//     // 4) build the body rows
//     const tbody = document.createElement('tbody')
//     data.forEach(row => {
//       const tr = document.createElement('tr')
//       Object.values(row).forEach(cellValue => {
//         const td = document.createElement('td')
//         td.textContent = cellValue
//         tr.appendChild(td)
//       })
//       tbody.appendChild(tr)
//     })
//     table.appendChild(tbody)
//   }
  
  
// const SUPABASE_URL = 'https://xyyivjujhchlsekbjojw.supabase.co'
// const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5eWl2anVqaGNobHNla2Jqb2p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2MjQ3OTgsImV4cCI6MjA1OTIwMDc5OH0.a0QKKRYJOPguGIxx64JZnC6qDE0z56AxO4wUx3oTFeg'
// const supabaseClient   = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)



  





window.onload = function() {
    // Attach event listeners to main tabs
    document.getElementById("tab1-btn").addEventListener("click", function() {
        openTab("tab1", this);
    });

    document.getElementById("tab2-btn").addEventListener("click", function() {
        openTab("tab2", this);
    });

    document.getElementById("tab3-btn").addEventListener("click", function() {
        openTab("tab3", this);
    });

    // Attach event listeners to nested tabs in Tab 2
    document.getElementById("subtabA-btn").addEventListener("click", function() {
        openNestedTab("subtabA", this, "tab2");
    });

    document.getElementById("subtabB-btn").addEventListener("click", function() {
        openNestedTab("subtabB", this, "tab2");
    });

    document.getElementById("subtabC-btn").addEventListener("click", function() {
        openNestedTab("subtabC", this, "tab2");
    });

    /* Loading data from json file when new file loaded */
    // document.getElementById('jsonFileInput').addEventListener('change', function(event) {
    //     const file = event.target.files[0];

    //     if (file) {
    //         const reader = new FileReader();
    //         reader.onload = function(e) {
    //             try {
    //                 // Parse JSON and store it in a global variable
    //                 window.jsonData = JSON.parse(e.target.result);
    //                 console.log("JSON Parsed Successfully:", jsonData);

    //                 // Display "Country: jsonData.language" on the webpage
    //                 if (jsonData.selectedLanguage) {
    //                     document.getElementById('output1').innerHTML = `Language: ${jsonData.selectedLanguage}`;
    //                 } 
    //                 else {
    //                     document.getElementById('output1').innerHTML = "Language data not found.";
    //                 }

    //                 // Display "Country: jsonData.country" on the webpage
    //                 if (jsonData.selectedCountry) {
    //                     document.getElementById('output2').innerHTML = `Country: ${jsonData.selectedCountry}`;
    //                 } 
    //                 else {
    //                     document.getElementById('output2').innerHTML = "Country data not found.";
    //                 }

    //                 // Display "Country: jsonData.region" on the webpage
    //                 if (jsonData.enteredRegion) {
    //                     document.getElementById('output3').innerHTML = `Region: ${jsonData.enteredRegion}`;
    //                 } 
    //                 else {
    //                     document.getElementById('output3').innerHTML = "Region data not found.";
    //                 }

                    

    //             } catch (error) {
    //                 document.getElementById('output').innerHTML = "Invalid JSON file.";
    //                 console.error("Error parsing JSON:", error);
    //             }
    //         };
    //         reader.readAsText(file);
    //     }
    // });

      // ── NEW ──
  // 2) Fetch & render the rows you inserted via the UI
  // fetchAndShowTestGroups()

};









document.getElementById('binaryFileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        // Split the file content into lines (each representing a row of binary digits)
        const lines = content.trim().split(/\r?\n/);
        
        // Flatten the binary digits from all lines into one array.
        const digits = lines.reduce((acc, line) => {
            return acc.concat(line.trim().split(''));
        }, []);
        
        // Get the existing table by its ID.
        const table = document.getElementById('binaryTable2');
        let digitIndex = 0;
        
        // Loop over the table rows starting at index 1 (skip top row)
        for (let r = 1; r < table.rows.length; r++) {
            // Loop over the cells starting at index 1 (skip left column)
            for (let c = 1; c < table.rows[r].cells.length; c++) {
                if (digitIndex >= digits.length) break;
                const digit = digits[digitIndex];
                const cell = table.rows[r].cells[c];
                
                // Clear any existing content in this cell.
                cell.innerHTML = '';
                
                // Create an image element and set its source based on the digit.
                const img = document.createElement('img');
                if (digit === '1') {
                    img.src = 'images/checkmark.png'; // Update with your checkmark image path
                    img.alt = 'Checkmark';
                } else if (digit === '0') {
                    img.src = 'images/x.png'; // Update with your x image path
                    img.alt = 'X';
                }
                cell.appendChild(img);
                digitIndex++;
            }
        }
    };
    reader.readAsText(file);
});



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
