export interface PeerUser {
  id?: string;
  name: string;
  host: boolean;
  color?: string;
}

export type SyncMessage =
  | { t: 'hello'; name: string }
  | { t: 'state'; url: string; time: number; playing: boolean; title?: string }
  | { t: 'sync' }
  | { t: 'play'; time: number }
  | { t: 'pause'; time: number }
  | { t: 'seek'; time: number }
  | { t: 'load'; url: string; title?: string; from: string }
  | { t: 'tick'; time: number; playing: boolean }
  | { t: 'chat'; id: string; from: string; text: string; time?: number; timestamp: number }
  | { t: 'reaction'; id: string; from: string; emoji: string; x?: number }
  | { t: 'peers'; list: PeerUser[] }
  | { t: 'sys'; text: string; timestamp?: number };

export interface ChatMessageItem {
  id: string;
  from: string;
  text: string;
  mine: boolean;
  timestamp: number;
  isSystem?: boolean;
  videoTime?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  from: string;
  x: number; // percentage 10% - 90%
  rot: number; // degrees
}

export interface DemoVideo {
  id?: string;
  title: string;
  category: string;
  url: string;
  type: 'video' | 'hls' | 'youtube';
  duration: string;
  description: string;
  badge?: string;
  thumbnail?: string;
  isCustom?: boolean;
  addedAt?: number;
  watchedAt?: number;
  watchCount?: number;
}

export interface WatchedMovieRecord {
  id: string;
  title: string;
  url: string;
  type: 'video' | 'hls' | 'youtube';
  lastWatchedAt: number;
  watchCount: number;
  isSavedAsSample?: boolean;
  duration?: string;
  category?: string;
  notes?: string;
}

export interface DesiredPlaybackState {
  playing: boolean;
  time: number;
  at: number;
}

export interface PlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  applySync: (playing: boolean, time: number, forceSeek?: boolean) => void;
  time: () => number;
  duration: () => number;
  playing: () => boolean;
  setVolume: (val: number) => void;
  setMuted: (muted: boolean) => void;
  destroy: () => void;
}

export interface ActiveRoomInfo {
  code: string;
  hostName: string;
  movieTitle: string;
  movieUrl?: string;
  viewerCount: number;
  lastSeen: number;
  createdAt: number;
}
