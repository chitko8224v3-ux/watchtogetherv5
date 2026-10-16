import { ActiveRoomInfo } from '../types';
import { fetchFirestoreRooms } from '../firebase';

// Purge any legacy room history keys from localStorage as requested:
// "no need to save history for available rooms"
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('wt-recent-rooms');
    localStorage.removeItem('wt-cached-active-rooms');
  }
} catch {}

/**
 * Sort rooms so that the latest available rooms are always at the top
 */
export function sortRoomsLatestFirst(rooms: ActiveRoomInfo[]): ActiveRoomInfo[] {
  return [...rooms].sort((a, b) => {
    const timeB = b.createdAt || b.lastSeen || 0;
    const timeA = a.createdAt || a.lastSeen || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });
}

// Temporary in-memory list only for the active session (not saved to localStorage)
let liveActiveRooms: ActiveRoomInfo[] = [];

/**
 * Fetch currently active rooms on-demand (no background polling, no persistent room history saved)
 * Always returns latest available rooms at the top
 */
export async function fetchActiveRooms(): Promise<ActiveRoomInfo[]> {
  const mergedMap = new Map<string, ActiveRoomInfo>();

  // 1. Fetch from Express API
  try {
    const res = await fetch('/api/rooms', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.rooms)) {
        data.rooms.forEach((r: ActiveRoomInfo) => mergedMap.set(r.code, r));
      }
    }
  } catch (err) {
    console.debug('Failed to fetch rooms from API:', err);
  }

  // 2. Fetch from Firestore for multi-instance sync
  try {
    const fireRooms = await fetchFirestoreRooms();
    if (Array.isArray(fireRooms)) {
      fireRooms.forEach((r) => {
        const existing = mergedMap.get(r.code);
        if (!existing) {
          mergedMap.set(r.code, r);
        } else {
          mergedMap.set(r.code, {
            ...existing,
            createdAt: Math.max(existing.createdAt || 0, r.createdAt || 0),
            lastSeen: Math.max(existing.lastSeen || 0, r.lastSeen || 0),
          });
        }
      });
    }
  } catch (err) {
    console.debug('Failed to fetch rooms from Firestore:', err);
  }

  const now = Date.now();
  const validRooms = Array.from(mergedMap.values()).filter(
    (r) => now - (r.lastSeen || 0) <= 25000
  );
  const sorted = sortRoomsLatestFirst(validRooms);
  liveActiveRooms = sorted;
  return sorted;
}

export async function registerActiveRoom(room: {
  code: string;
  hostName: string;
  movieTitle: string;
  movieUrl?: string;
  viewerCount: number;
}): Promise<void> {
  const cleanCode = room.code.trim().toUpperCase();
  const fullRoom: ActiveRoomInfo = {
    code: cleanCode,
    hostName: room.hostName,
    movieTitle: room.movieTitle,
    viewerCount: room.viewerCount,
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };

  const existing = liveActiveRooms.filter((r) => r.code !== cleanCode);
  existing.unshift(fullRoom);
  liveActiveRooms = sortRoomsLatestFirst(existing);

  // Post to server
  try {
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
      keepalive: true,
    });
  } catch (err) {
    console.debug('Failed to register room to server:', err);
  }
}

export async function removeActiveRoom(code: string): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  liveActiveRooms = liveActiveRooms.filter((r) => r.code !== cleanCode);

  try {
    await fetch(`/api/rooms/${encodeURIComponent(cleanCode)}`, {
      method: 'DELETE',
      keepalive: true,
    });
  } catch {}
}

/**
 * Upload a .torrent file and parse it to a streamable magnet link with active WebRTC trackers
 */
export async function uploadTorrentFile(file: File): Promise<{
  ok: boolean;
  magnetUrl: string;
  title: string;
  size: number;
  infoHash: string;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuf = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        const len = bytes.byteLength;
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
          binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
        }
        const fileBase64 = btoa(binary);

        const res = await fetch('/api/torrent/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to parse torrent file');
        }

        const data = await res.json();
        resolve(data);
      } catch (err) {
        // Fallback: If server parse fails, try client-side WebTorrent instance if available
        if (typeof window !== 'undefined' && window.WebTorrent) {
          try {
            const client = new window.WebTorrent();
            client.add(file, (torrent: any) => {
              const magnetUrl = torrent.magnetURI;
              const title = torrent.name || file.name.replace(/\.torrent$/i, '');
              resolve({
                ok: true,
                magnetUrl,
                title,
                size: torrent.length || file.size,
                infoHash: torrent.infoHash,
              });
            });
            return;
          } catch {}
        }
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file from disk'));
    reader.readAsArrayBuffer(file);
  });
}
