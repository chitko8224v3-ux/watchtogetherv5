import { ActiveRoomInfo } from '../types';
import { fetchFirestoreRooms } from '../firebase';

const RECENT_KEY = 'wt-recent-rooms';
const CACHED_ROOMS_KEY = 'wt-cached-active-rooms';

export interface RecentRoom {
  code: string;
  name?: string;
  movieTitle?: string;
  visitedAt: number;
}

// In-memory cache of active rooms
let cachedActiveRooms: ActiveRoomInfo[] = [];
try {
  const stored = localStorage.getItem(CACHED_ROOMS_KEY);
  if (stored) {
    cachedActiveRooms = JSON.parse(stored);
  }
} catch {}

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

function updateCachedRooms(rooms: ActiveRoomInfo[]) {
  cachedActiveRooms = sortRoomsLatestFirst(rooms);
  try {
    localStorage.setItem(CACHED_ROOMS_KEY, JSON.stringify(cachedActiveRooms));
  } catch {}
}

// Fetch active rooms on-demand with latest available rooms always at the top
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

  // 2. Fetch from Firestore for multi-instance persistent sync
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

  // 3. Fallback to cache if offline
  if (mergedMap.size === 0 && cachedActiveRooms.length > 0) {
    cachedActiveRooms.forEach((r) => mergedMap.set(r.code, r));
  }

  const sorted = sortRoomsLatestFirst(Array.from(mergedMap.values()));
  updateCachedRooms(sorted);
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

  const existing = cachedActiveRooms.filter((r) => r.code !== cleanCode);
  existing.unshift(fullRoom);
  updateCachedRooms(existing);

  // Save to recent rooms
  addRecentRoom({
    code: cleanCode,
    name: room.hostName,
    movieTitle: room.movieTitle,
    visitedAt: Date.now(),
  });

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
  const filtered = cachedActiveRooms.filter((r) => r.code !== cleanCode);
  updateCachedRooms(filtered);

  try {
    await fetch(`/api/rooms/${encodeURIComponent(cleanCode)}`, {
      method: 'DELETE',
      keepalive: true,
    });
  } catch {}
}

// Local storage recent rooms
export function getRecentRooms(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addRecentRoom(room: RecentRoom): void {
  try {
    const list = getRecentRooms().filter((r) => r.code !== room.code);
    list.unshift(room);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {}
}

export function clearRecentRooms(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {}
}
