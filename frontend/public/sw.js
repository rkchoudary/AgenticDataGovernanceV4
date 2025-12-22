// Service Worker for Data Governance Platform PWA
const CACHE_NAME = 'datagov-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests - don't cache them
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseClone = response.clone();
        
        // Cache successful responses
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        
        return response;
      })
      .catch(async () => {
        // Try to get from cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Return offline page for navigation requests
        if (event.request.mode === 'navigate') {
          const offlineResponse = await caches.match(OFFLINE_URL);
          if (offlineResponse) {
            return offlineResponse;
          }
        }
        
        // Return a basic offline response
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      id: data.id,
    },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Data Governance', options)
  );
});

// Notification click event - handle deep links
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  // Handle action buttons
  if (event.action === 'approve') {
    event.waitUntil(
      clients.openWindow(`${url}?action=approve`)
    );
    return;
  }

  if (event.action === 'reject') {
    event.waitUntil(
      clients.openWindow(`${url}?action=reject`)
    );
    return;
  }

  // Default - open the URL
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-approvals') {
    event.waitUntil(syncApprovals());
  }
  if (event.tag === 'sync-actions') {
    event.waitUntil(syncQueuedActions());
  }
  if (event.tag === 'sync-workflow-actions') {
    event.waitUntil(syncWorkflowActions());
  }
});

// Sync queued approvals when back online
async function syncApprovals() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending-approvals', 'readonly');
    const store = tx.objectStore('pending-approvals');
    const pendingApprovals = await store.getAll();

    for (const approval of pendingApprovals) {
      try {
        await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(approval),
        });
        
        // Remove from pending queue
        const deleteTx = db.transaction('pending-approvals', 'readwrite');
        await deleteTx.objectStore('pending-approvals').delete(approval.id);
      } catch (error) {
        console.error('[SW] Failed to sync approval:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync approvals failed:', error);
  }
}

// Sync any queued actions
async function syncQueuedActions() {
  try {
    const db = await openDB();
    const tx = db.transaction('queued-actions', 'readonly');
    const store = tx.objectStore('queued-actions');
    const actions = await store.getAll();

    for (const action of actions) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
        });
        
        // Remove from queue
        const deleteTx = db.transaction('queued-actions', 'readwrite');
        await deleteTx.objectStore('queued-actions').delete(action.id);
      } catch (error) {
        console.error('[SW] Failed to sync action:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync actions failed:', error);
  }
}

// Sync workflow wizard actions from dedicated store
async function syncWorkflowActions() {
  try {
    const db = await openWorkflowDB();
    const tx = db.transaction('queued-actions', 'readonly');
    const store = tx.objectStore('queued-actions');
    const actions = await store.getAll();

    // Sort by priority (lower = higher priority) then by timestamp
    const sortedActions = actions
      .filter(a => a.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) return (a.priority || 5) - (b.priority || 5);
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });

    for (const action of sortedActions) {
      try {
        const response = await fetch('/api/workflow/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: action.type,
            cycleId: action.cycleId,
            phaseId: action.phaseId,
            stepId: action.stepId,
            data: action.data,
            timestamp: action.timestamp,
          }),
        });
        
        if (response.ok) {
          // Remove from queue on success
          const deleteTx = db.transaction('queued-actions', 'readwrite');
          await deleteTx.objectStore('queued-actions').delete(action.id);
        } else {
          // Update retry count on failure
          const updateTx = db.transaction('queued-actions', 'readwrite');
          const updateStore = updateTx.objectStore('queued-actions');
          const updatedAction = {
            ...action,
            retryCount: (action.retryCount || 0) + 1,
            status: (action.retryCount || 0) + 1 >= (action.maxRetries || 3) ? 'failed' : 'pending',
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
          await updateStore.put(updatedAction);
        }
      } catch (error) {
        console.error('[SW] Failed to sync workflow action:', error);
        // Update with error
        const updateTx = db.transaction('queued-actions', 'readwrite');
        const updateStore = updateTx.objectStore('queued-actions');
        const updatedAction = {
          ...action,
          retryCount: (action.retryCount || 0) + 1,
          status: (action.retryCount || 0) + 1 >= (action.maxRetries || 3) ? 'failed' : 'pending',
          error: error.message || 'Network error',
        };
        await updateStore.put(updatedAction);
      }
    }

    // Notify clients of sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'WORKFLOW_SYNC_COMPLETE',
        timestamp: new Date().toISOString(),
      });
    });
  } catch (error) {
    console.error('[SW] Sync workflow actions failed:', error);
  }
}

// Open workflow wizard IndexedDB
function openWorkflowDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('workflow-wizard-offline', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('queued-actions')) {
        const store = db.createObjectStore('queued-actions', { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('cycleId', 'cycleId', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
      }
    };
  });
}

// Simple IndexedDB helper
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('datagov-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-approvals')) {
        db.createObjectStore('pending-approvals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('queued-actions')) {
        db.createObjectStore('queued-actions', { keyPath: 'id' });
      }
    };
  });
}
