const SUPABASE_URL = 'https://runvdydriatawkpnumtx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IuAUOGkafsswN2Li6VVu_g_yK4D2fNU'; 

// Use window.supabase if loaded via CDN
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

// Open IndexedDB for offline logs safely
let db;
let dbReadyResolve;
const dbReadyPromise = new Promise((resolve) => {
  dbReadyResolve = resolve;
});

const request = indexedDB.open('AeroMaintenanceDB', 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains('logs')) {
    db.createObjectStore('logs', { keyPath: 'id' });
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  console.log('IndexedDB initialized successfully.');
  dbReadyResolve(db); // Signal that db is ready
  syncOfflineLogs();
};

request.onerror = (event) => {
  console.error('IndexedDB failed to open:', event.target.error);
};

// Save log locally to IndexedDB (waits for db to be ready)
async function saveLogLocally(logData) {
  await dbReadyPromise; // Ensures db is initialized even if submitted instantly
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');
    const request = store.put(logData);

    request.onsuccess = () => {
      console.log('Saved log to local IndexedDB');
      if (navigator.onLine && supabaseClient) {
        syncLogToSupabase(logData);
      }
      resolve(true);
    };
    request.onerror = (err) => reject(err);
  });
}

// Sync individual log to Supabase
async function syncLogToSupabase(logData) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient
    .from('maintenance_logs')
    .upsert([logData]);

  if (error) {
    console.error('Cloud sync failed, will retry later:', error);
  } else {
    console.log('Successfully synced log to Supabase:', logData.id);
  }
}

// Sync all offline logs when connection is restored
window.addEventListener('online', () => {
  console.log('Back online! Triggering batch sync...');
  syncOfflineLogs();
});

async function syncOfflineLogs() {
  await dbReadyPromise;
  if (!navigator.onLine || !db) return;
  
  const transaction = db.transaction(['logs'], 'readonly');
  const store = transaction.objectStore('logs');
  const request = store.getAll();

  request.onsuccess = async () => {
    const logs = request.result;
    for (const log of logs) {
      await syncLogToSupabase(log);
    }
  };
}