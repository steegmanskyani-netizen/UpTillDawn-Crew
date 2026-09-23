'use client'

export type OfflineOperationsSnapshot = {
  version: 1
  userId: string
  savedAt: number
  events: Array<{ id: string; name: string }>
  workplaces: Array<{ id: string; event_id: string; name: string }>
  shifts: Array<{
    id: string
    event_id: string
    workplace_id: string
    role_name: string | null
    scheduled_start: string
    scheduled_end: string
  }>
  activeSession: {
    id: string
    event_id: string
    shift_id: string | null
    started_at: string
  } | null
  activeBreak: {
    id: string
    work_session_id: string
    started_at: string
  } | null
  checkins: Array<{
    event_id: string
    workplace_id: string
    status: string
  }>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('uptilldawn-offline-shell', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'userId' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveOperationsSnapshot(snapshot: OfflineOperationsSnapshot) {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'meta'], 'readwrite')
      tx.objectStore('snapshots').put(snapshot)
      tx.objectStore('meta').put({ key: 'activeUserId', value: snapshot.userId })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
