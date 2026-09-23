'use client'

import { createClient } from '@/lib/supabase/crew-client'
import type { Json } from '@/types/crew-database'

export type QueuedOperation = {
  id: string
  userId: string
  type: string
  payload: Record<string, Json>
  createdAt: number
  attempts: number
  error?: string
}

export type QueuedUpload = {
  id: string
  userId: string
  kind: 'incident_photo' | 'chat_photo'
  payload: Record<string, Json>
  storagePath: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  blob: Blob
  createdAt: number
  attempts: number
  error?: string
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('uptilldawn-operations', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('operations')) db.createObjectStore('operations', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('uploads')) db.createObjectStore('uploads', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function writeOperation(operation: QueuedOperation, remove = false) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('operations', 'readwrite')
      const store = tx.objectStore('operations')
      if (remove) store.delete(operation.id)
      else store.put(operation)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

async function writeUpload(upload: QueuedUpload, remove = false) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('uploads', 'readwrite')
      const store = tx.objectStore('uploads')
      if (remove) store.delete(upload.id)
      else store.put(upload)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function queued(userId: string): Promise<QueuedOperation[]> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const q = db.transaction('operations').objectStore('operations').getAll()
      q.onsuccess = () => resolve(
        (q.result as QueuedOperation[])
          .filter(x => x.userId === userId)
          .sort((a, b) => a.createdAt - b.createdAt),
      )
      q.onerror = () => reject(q.error)
    })
  } finally {
    db.close()
  }
}

export async function queuedUploads(userId: string): Promise<QueuedUpload[]> {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const q = db.transaction('uploads').objectStore('uploads').getAll()
      q.onsuccess = () => resolve(
        (q.result as QueuedUpload[])
          .filter(x => x.userId === userId)
          .sort((a, b) => a.createdAt - b.createdAt),
      )
      q.onerror = () => reject(q.error)
    })
  } finally {
    db.close()
  }
}

export async function discardQueuedOperation(userId: string, id: string) {
  const operation = (await queued(userId)).find(x => x.id === id)
  if (!operation) return false
  await writeOperation(operation, true)
  window.dispatchEvent(new Event('crew-queue-change'))
  return true
}

export async function discardQueuedUpload(userId: string, id: string) {
  const upload = (await queuedUploads(userId)).find(x => x.id === id)
  if (!upload) return false
  await writeUpload(upload, true)
  window.dispatchEvent(new Event('crew-queue-change'))
  return true
}

function imageType(file: File): QueuedUpload['mimeType'] {
  if (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp') return file.type
  throw new Error('Gebruik een JPG-, PNG- of WEBP-foto.')
}

function extension(mime: QueuedUpload['mimeType']) {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp'
}

async function ensureUploaded(upload: QueuedUpload) {
  const s = createClient()
  const bucket = upload.kind === 'incident_photo' ? 'incident-photos' : 'chat-attachments'
  const { error } = await s.storage.from(bucket).upload(upload.storagePath, upload.blob, {
    contentType: upload.mimeType,
    upsert: false,
  })
  if (!error) return

  const slash = upload.storagePath.indexOf('/')
  const folder = slash >= 0 ? upload.storagePath.slice(0, slash) : ''
  const filename = slash >= 0 ? upload.storagePath.slice(slash + 1) : upload.storagePath
  const { data: existing, error: listError } = await s.storage.from(bucket).list(folder, {
    limit: 10,
    search: filename,
  })
  if (listError || !existing?.some(item => item.name === filename)) throw error
}

async function synchronizeUploads(userId: string) {
  const s = createClient()

  for (const upload of await queuedUploads(userId)) {
    if (!navigator.onLine) break

    try {
      if (upload.kind === 'incident_photo') {
        const operationId = upload.payload.incident_operation_id
        const incidentPayload = upload.payload.incident_payload
        if (
          typeof operationId !== 'string'
          || typeof incidentPayload !== 'object'
          || incidentPayload === null
          || Array.isArray(incidentPayload)
        ) throw new Error('Ongeldige incident-upload.')

        const incident = await s.rpc('upt_sync_operation', {
          p_id: operationId,
          p_type: 'incident',
          p_payload: incidentPayload,
        })
        if (incident.error) throw incident.error

        const result = incident.data
        const incidentId = typeof result === 'object'
          && result !== null
          && !Array.isArray(result)
          && typeof result.id === 'string'
          ? result.id
          : null
        if (!incidentId) throw new Error('Incident werd niet bevestigd.')

        await ensureUploaded(upload)
        const { error } = await s.rpc('upt_attach_incident_photo', {
          p_operation: upload.id,
          p_incident: incidentId,
          p_photo_path: upload.storagePath,
        })
        if (error) throw error
      } else {
        const channelId = upload.payload.channel_id
        const body = upload.payload.body
        if (typeof channelId !== 'string' || (body !== undefined && typeof body !== 'string')) {
          throw new Error('Ongeldige chat-upload.')
        }

        await ensureUploaded(upload)
        const { error } = await s.rpc('upt_send_photo_message_operation', {
          p_operation: upload.id,
          p_channel: channelId,
          p_body: typeof body === 'string' ? body : '',
          p_attachment_path: upload.storagePath,
        })
        if (error) throw error
      }

      await writeUpload(upload, true)
    } catch {
      await writeUpload({
        ...upload,
        attempts: upload.attempts + 1,
        error: 'Foto niet verwerkt. Het bestand blijft lokaal bewaard en wordt opnieuw geprobeerd.',
      })
    }
  }
}

let running: Promise<void> | null = null

export async function synchronize(userId: string) {
  if (running) return running

  running = (async () => {
    const s = createClient()
    const { data: { user } } = await s.auth.getUser()
    if (user?.id !== userId) return

    const ordered = new Set(['start_work', 'start_break', 'stop_break', 'stop_work', 'transition'])
    let timeConflict = false

    for (const op of await queued(userId)) {
      if (timeConflict && ordered.has(op.type)) continue
      if (!navigator.onLine) break

      try {
        const { error } = await s.rpc('upt_sync_operation', {
          p_id: op.id,
          p_type: op.type,
          p_payload: op.payload,
        })
        if (error) {
          await writeOperation({
            ...op,
            attempts: op.attempts + 1,
            error: 'Niet verwerkt. Controleer de actuele werkstatus; deze actie blijft bewaard.',
          })
          if (ordered.has(op.type)) timeConflict = true
          continue
        }
        await writeOperation(op, true)
      } catch {
        await writeOperation({
          ...op,
          attempts: op.attempts + 1,
          error: 'Verbinding onderbroken; opnieuw proberen.',
        })
        break
      }
    }

    await synchronizeUploads(userId)
  })().finally(() => {
    running = null
    window.dispatchEvent(new Event('crew-queue-change'))
  })

  return running
}

export async function enqueue(userId: string, type: string, payload: Record<string, Json>) {
  const op: QueuedOperation = {
    id: crypto.randomUUID(),
    userId,
    type,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  }
  await writeOperation(op)
  window.dispatchEvent(new Event('crew-queue-change'))
  if (navigator.onLine) await synchronize(userId)
  return op.id
}

export async function enqueueIncidentPhoto(
  userId: string,
  payload: Record<string, Json>,
  file: File,
) {
  if (file.size > 10 * 1024 * 1024) throw new Error('De incidentfoto mag maximaal 10 MB zijn.')
  const mimeType = imageType(file)
  const id = crypto.randomUUID()
  const upload: QueuedUpload = {
    id,
    userId,
    kind: 'incident_photo',
    payload: {
      incident_operation_id: crypto.randomUUID(),
      incident_payload: payload,
    },
    storagePath: `${userId}/${id}.${extension(mimeType)}`,
    mimeType,
    blob: file,
    createdAt: Date.now(),
    attempts: 0,
  }
  await writeUpload(upload)
  window.dispatchEvent(new Event('crew-queue-change'))
  if (navigator.onLine) await synchronize(userId)
  return id
}

export async function enqueueChatPhoto(
  userId: string,
  channelId: string,
  body: string,
  file: File,
) {
  if (file.size > 10 * 1024 * 1024) throw new Error('De chatfoto mag maximaal 10 MB zijn.')
  const mimeType = imageType(file)
  const id = crypto.randomUUID()
  const upload: QueuedUpload = {
    id,
    userId,
    kind: 'chat_photo',
    payload: { channel_id: channelId, body },
    storagePath: `${userId}/${id}.${extension(mimeType)}`,
    mimeType,
    blob: file,
    createdAt: Date.now(),
    attempts: 0,
  }
  await writeUpload(upload)
  window.dispatchEvent(new Event('crew-queue-change'))
  if (navigator.onLine) await synchronize(userId)
  return id
}
