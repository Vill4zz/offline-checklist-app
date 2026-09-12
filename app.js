const SUPABASE_URL = 'https://runvdydriatawkpnumtx.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_IuAUOGkafsswN2Li6VVu_g_yK4D2fNU'; 

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Open IndexedDB for offline logs
let db;
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
  syncOfflineLogs();
};

// Save log locally to IndexedDB
async function saveLogLocally(logData) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');
    const request = store.put(logData);

    request.onsuccess = () => {
      console.log('Saved log to local IndexedDB');
      if (navigator.onLine) {
        syncLogToSupabase(logData);
      }
      resolve(true);
    };
    request.onerror = (err) => reject(err);
  });
}

// Sync individual log to Supabase
async function syncLogToSupabase(logData) {
  const { error } = await supabase
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