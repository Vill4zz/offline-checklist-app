// Initialize Supabase Client
const SUPABASE_URL = 'https://runvdydriatawkpnumtx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IuAUOGkafsswN2Li6VVu_g_yK4D2fNU';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// --- AUTHENTICATION HANDLING ---
const authContainer = document.getElementById("authContainer");
const appContainer = document.getElementById("appContainer");

// Check active session on initial load
supabaseClient.auth.getSession().then(({ data: { session } }) => {
  handleAuthSession(session);
});

// Listen for sign-in / sign-out changes
supabaseClient.auth.onAuthStateChange((_event, session) => {
  handleAuthSession(session);
});

function handleAuthSession(session) {
  if (session) {
    authContainer.style.display = "none";
    appContainer.style.display = "block";
  } else {
    authContainer.style.display = "block";
    appContainer.style.display = "none";
  }
}

// Login Form Submission
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    alert("Authentication Failed: " + error.message);
  }
});

// Logout Button Handler
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});
// -------------------------------

// Toggle custom text box if "Add New" is chosen
function toggleCustomMechanic(select) {
  const customInput = document.getElementById("customMechanic");
  if (select.value === "custom") {
    customInput.style.display = "block";
    customInput.required = true;
  } else {
    customInput.style.display = "none";
    customInput.required = false;
  }
}

// 1. Setup IndexedDB (Version 5 with UUID keyPath)
let db;
const request = indexedDB.open("AeroChecklistDB", 5);

request.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("inspections")) {
    db.createObjectStore("inspections", { keyPath: "id" });
  }
};

request.onsuccess = (e) => {
  db = e.target.result;
  loadTasks();
  if (navigator.onLine) {
    syncPendingLogs();
  }
};

// 2. Monitor Network Status
const statusDiv = document.getElementById("status");
function updateStatus() {
  if (navigator.onLine) {
    statusDiv.textContent = "Online Mode (Ready to Sync)";
    statusDiv.className = "status online";
    syncPendingLogs();
  } else {
    statusDiv.textContent = "Offline Mode (Saving locally to IndexedDB)";
    statusDiv.className = "status offline";
  }
}
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);
updateStatus();

// 3. Add Log to Local Database & Try Cloud Sync
document.getElementById("taskForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const mechanicChoice = document.getElementById("mechanicSelect").value;
  const finalMechanic = mechanicChoice === "custom" 
    ? document.getElementById("customMechanic").value 
    : mechanicChoice;
  
  const entryId = crypto.randomUUID();
  const entry = {
    id: entryId,
    aircraft_id: document.getElementById("tailNumber").value,
    technician_id: finalMechanic,
    checklist_data: {
      category: document.getElementById("category").value,
      details: document.getElementById("taskInput").value
    },
    status: "completed",
    sync_status: "pending_sync",
    timestamp: new Date().toLocaleString()
  };

  const transaction = db.transaction(["inspections"], "readwrite");
  const store = transaction.objectStore("inspections");
  store.put(entry);

  transaction.oncomplete = async () => {
    document.getElementById("taskForm").reset();
    document.getElementById("customMechanic").style.display = "none";
    loadTasks();

    if (navigator.onLine) {
      await pushLogToSupabase(entry);
    }
  };
});

// Push single log to Supabase PostgreSQL
async function pushLogToSupabase(item) {
  try {
    const { error } = await supabaseClient
      .from('maintenance_logs')
      .upsert([{
        id: item.id,
        aircraft_id: item.aircraft_id,
        technician_id: item.technician_id,
        checklist_data: item.checklist_data,
        status: item.status
      }]);

    if (!error) {
      const tx = db.transaction(["inspections"], "readwrite");
      const store = tx.objectStore("inspections");
      item.sync_status = "synced";
      store.put(item);
      tx.oncomplete = () => loadTasks();
    } else {
      console.error("Sync error:", error);
    }
  } catch (err) {
    console.error("Network or request error during sync:", err);
  }
}

// 4. Render Logged Items from IndexedDB
function loadTasks() {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  const transaction = db.transaction(["inspections"], "readonly");
  const store = transaction.objectStore("inspections");

  store.openCursor().onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      const isSynced = item.sync_status === "synced";
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>[${item.aircraft_id}] ${item.checklist_data.category}</strong>
          <div class="meta">${item.checklist_data.details} • <em>${item.timestamp}</em></div>
          <div class="personnel">👤 Inspector / Mechanic: <strong>${item.technician_id}</strong></div>
        </div>
        <span class="badge ${isSynced ? 'synced' : 'pending'}">
          ${isSynced ? 'Synced' : 'Pending Sync'}
        </span>
      `;
      list.appendChild(li);
      cursor.continue();
    }
  };
}

// 5. Batch Sync Button Handler
document.getElementById("syncBtn").addEventListener("click", () => {
  if (!navigator.onLine) {
    alert("Cannot sync: Device is offline!");
    return;
  }
  syncPendingLogs();
  alert("Sync process triggered with cloud database!");
});

async function syncPendingLogs() {
  if (!navigator.onLine || !db) return;

  const transaction = db.transaction(["inspections"], "readonly");
  const store = transaction.objectStore("inspections");

  store.openCursor().onsuccess = async (e) => {
    const cursor = e.target.result;
    if (cursor) {
      const item = cursor.value;
      if (item.sync_status !== "synced") {
        await pushLogToSupabase(item);
      }
      cursor.continue();
    }
  };
}

// 6. Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed:', err));
}