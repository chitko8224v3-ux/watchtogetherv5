import { DemoVideo, WatchedMovieRecord } from '../types';
import {
  saveSampleToFirestore,
  deleteSampleFromFirestore,
  saveWatchedMovieToFirestore,
} from '../firebase';

export const BUILTIN_DEMO_VIDEOS: DemoVideo[] = [
  {
    id: 'demo-bbb',
    title: 'Big Buck Bunny',
    category: 'Animation Film',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    type: 'video',
    duration: '9:56',
    description: 'Blender Foundation animated classic about a giant bunny and forest critters.',
    badge: '1080p MP4',
  },
  {
    id: 'demo-sintel',
    title: 'Sintel - CGI Fantasy Movie',
    category: 'Fantasy Short',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    type: 'video',
    duration: '14:48',
    description: 'A young girl seeks her pet dragon in this visually stunning Blender open film.',
    badge: '1080p MP4',
  },
  {
    id: 'demo-tears',
    title: 'Tears of Steel (Sci-Fi Short)',
    category: 'Sci-Fi Film',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    type: 'video',
    duration: '12:14',
    description: 'A dystopian future where soldiers battle rocket-wielding robots in Amsterdam.',
    badge: '1080p MP4',
  },
  {
    id: 'demo-elephants',
    title: 'Elephants Dream (Open Movie)',
    category: 'Surreal Sci-Fi',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    type: 'video',
    duration: '10:53',
    description: 'Proog and Emo explore a giant mechanical clockwork world with mysterious powers.',
    badge: 'HD MP4',
  },
  {
    id: 'demo-mux-hls',
    title: 'Mux HLS Multivariant Stream',
    category: 'HLS Live/VOD',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    type: 'hls',
    duration: '10:34',
    description: 'Adaptive bitrate multi-audio HLS stream for testing high quality streaming.',
    badge: 'HLS .m3u8',
  },
  {
    id: 'demo-unified-hls',
    title: 'Unified Streaming - Tears of Steel HLS',
    category: 'HLS Stream',
    url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    type: 'hls',
    duration: '12:14',
    description: 'Multi-audio adaptive HLS test stream with full seekable timestamps.',
    badge: 'HLS .m3u8',
  },
  {
    id: 'demo-lofi-yt',
    title: 'Lofi Hip Hop - Beats to Relax/Study',
    category: 'YouTube Music',
    url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    type: 'youtube',
    duration: 'Live Stream',
    description: 'Lofi Girl chill beats - perfect for studying or relaxing together.',
    badge: 'YouTube',
  },
  {
    id: 'demo-sprite-fright',
    title: 'Blender Studio: Sprite Fright',
    category: 'Comedy Horror',
    url: 'https://www.youtube.com/watch?v=_cMxraX_5RE',
    type: 'youtube',
    duration: '10:30',
    description: '80s-inspired horror-comedy about backpackers venturing into woodland horrors.',
    badge: 'YouTube',
  },
  {
    id: 'demo-sintel-torrent',
    title: 'Sintel - Torrent Stream',
    category: 'Torrent Movie',
    url: 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.webtorrent.dev',
    type: 'torrent',
    duration: '14:48',
    description: 'Streamed directly over BitTorrent P2P with live peer swarm & instant playback.',
    badge: 'Torrent / Magnet',
  },
  {
    id: 'demo-bbb-torrent',
    title: 'Big Buck Bunny - Torrent Stream',
    category: 'Torrent Movie',
    url: 'magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c&dn=Big+Buck+Bunny&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.webtorrent.dev',
    type: 'torrent',
    duration: '9:56',
    description: 'High-speed torrent video streaming synced peer-to-peer for watch parties.',
    badge: 'Torrent / Magnet',
  },
  {
    id: 'demo-tears-torrent',
    title: 'Tears of Steel - Torrent Stream',
    category: 'Torrent Movie',
    url: 'magnet:?xt=urn:btih:209c8226b299b308e24c481b40232c73318290b2&dn=Tears+of+Steel&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.webtorrent.dev',
    type: 'torrent',
    duration: '12:14',
    description: 'VFX Sci-Fi classic streamed live via BitTorrent magnet link.',
    badge: 'Torrent / Magnet',
  },
];

export const DEMO_VIDEOS = BUILTIN_DEMO_VIDEOS;

const STORAGE_SAVED_SAMPLES = 'wt-saved-sample-movies';
const STORAGE_WATCHED_HISTORY = 'wt-watched-movies-history';

export function inferMediaType(url: string): 'video' | 'hls' | 'youtube' | 'torrent' {
  const clean = url.trim();
  if (
    clean.startsWith('magnet:') ||
    /\.torrent(\?|#|$)/i.test(clean) ||
    clean.startsWith('blob:torrent') ||
    clean.startsWith('data:application/x-bittorrent')
  ) {
    return 'torrent';
  }
  if (/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.test(clean)) {
    return 'youtube';
  }
  if (/\.m3u8(\?|#|$)/i.test(clean)) {
    return 'hls';
  }
  return 'video';
}

export function formatUrlTitle(url: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim();
  const clean = url.trim();

  // Magnet link title extraction
  if (clean.startsWith('magnet:')) {
    try {
      const dnMatch = clean.match(/[?&]dn=([^&]+)/i);
      if (dnMatch && dnMatch[1]) {
        return decodeURIComponent(dnMatch[1].replace(/\+/g, ' '));
      }
      const xtMatch = clean.match(/urn:btih:([a-f0-9]+)/i);
      if (xtMatch && xtMatch[1]) {
        return `Torrent (${xtMatch[1].slice(0, 8)}...)`;
      }
      return 'Torrent Video';
    } catch {
      return 'Torrent Video';
    }
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
      const v = parsed.searchParams.get('v');
      return v ? `YouTube Video (${v.slice(0, 6)})` : 'YouTube Stream';
    }
    const filename = parsed.pathname.split('/').filter(Boolean).pop();
    if (filename) {
      const cleanName = decodeURIComponent(filename)
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      if (cleanName.length > 0) {
        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      }
    }
  } catch {}
  return fallback || 'Custom Video';
}

// Get user-saved sample movies
export function getSavedSamples(): DemoVideo[] {
  try {
    const raw = localStorage.getItem(STORAGE_SAVED_SAMPLES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Check if a movie URL is already saved as sample
export function isMovieSavedAsSample(url: string): boolean {
  if (!url) return false;
  const clean = url.trim();
  if (BUILTIN_DEMO_VIDEOS.some((d) => d.url === clean)) return true;
  const saved = getSavedSamples();
  return saved.some((s) => s.url === clean);
}

// Save a movie or custom URL as a sample (auto or manual)
export function saveWatchedMovieAsSample(movie: {
  url: string;
  title?: string;
  category?: string;
  duration?: string;
  description?: string;
}): DemoVideo {
  const cleanUrl = movie.url.trim();
  const type = inferMediaType(cleanUrl);
  const badge = type === 'youtube' ? 'YouTube' : type === 'hls' ? 'HLS Stream' : 'Direct Video';
  const title = movie.title?.trim() || formatUrlTitle(cleanUrl);
  const duration = movie.duration || 'Watched';
  const category = movie.category || (type === 'youtube' ? 'Watched YouTube' : 'Watched Movie');
  const description =
    movie.description || `Auto-saved watched movie on ${new Date().toLocaleDateString()}. Ready for synchronized watching.`;

  const newSample: DemoVideo = {
    id: 'saved-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
    title,
    category,
    url: cleanUrl,
    type,
    duration,
    description,
    badge,
    isCustom: true,
    addedAt: Date.now(),
  };

  const currentList = getSavedSamples().filter((s) => s.url !== cleanUrl);
  // Keep up to 50 saved samples
  currentList.unshift(newSample);
  try {
    localStorage.setItem(STORAGE_SAVED_SAMPLES, JSON.stringify(currentList.slice(0, 50)));
  } catch (err) {
    console.error('Failed to save sample:', err);
  }

  // Also sync to Firestore in background
  saveSampleToFirestore(newSample).catch(() => {});
  // Also update watched record flag
  updateWatchedRecordSampleFlag(cleanUrl, true);

  return newSample;
}

// Remove a saved sample
export function removeSavedSample(urlOrId: string): void {
  const currentList = getSavedSamples().filter((s) => s.url !== urlOrId && s.id !== urlOrId);
  try {
    localStorage.setItem(STORAGE_SAVED_SAMPLES, JSON.stringify(currentList));
  } catch {}
  deleteSampleFromFirestore(urlOrId).catch(() => {});
  updateWatchedRecordSampleFlag(urlOrId, false);
}

// Get all samples: custom saved samples first, then built-in demos
export function getAllSamples(): DemoVideo[] {
  const saved = getSavedSamples();
  return [...saved, ...BUILTIN_DEMO_VIDEOS];
}

// Watched History
export function getWatchedHistory(): WatchedMovieRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_WATCHED_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Record a movie as watched AND automatically save it as a sample!
export function recordWatchedMovie(url: string, title?: string, duration?: string): WatchedMovieRecord {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Url is empty');
  }

  const type = inferMediaType(cleanUrl);
  const displayTitle = title?.trim() || formatUrlTitle(cleanUrl);
  const history = getWatchedHistory();
  const existingIndex = history.findIndex((h) => h.url === cleanUrl);

  let record: WatchedMovieRecord;
  if (existingIndex >= 0) {
    const existing = history[existingIndex];
    record = {
      ...existing,
      title: displayTitle || existing.title,
      lastWatchedAt: Date.now(),
      watchCount: (existing.watchCount || 1) + 1,
      isSavedAsSample: true,
      duration: duration || existing.duration,
    };
    history.splice(existingIndex, 1);
    history.unshift(record);
  } else {
    record = {
      id: 'watch-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      title: displayTitle,
      url: cleanUrl,
      type,
      lastWatchedAt: Date.now(),
      watchCount: 1,
      isSavedAsSample: true,
      duration: duration || 'Watched',
    };
    history.unshift(record);
  }

  try {
    localStorage.setItem(STORAGE_WATCHED_HISTORY, JSON.stringify(history.slice(0, 40)));
  } catch {}

  // Sync to Firestore
  saveWatchedMovieToFirestore(record).catch(() => {});

  // AUTO-SAVE AS SAMPLE:
  const isBuiltIn = BUILTIN_DEMO_VIDEOS.some((d) => d.url === cleanUrl);
  if (!isBuiltIn) {
    saveWatchedMovieAsSample({
      url: cleanUrl,
      title: displayTitle,
      duration,
    });
  }

  return record;
}

function updateWatchedRecordSampleFlag(urlOrId: string, isSaved: boolean) {
  const history = getWatchedHistory();
  const match = history.find((h) => h.url === urlOrId || h.id === urlOrId);
  if (match) {
    match.isSavedAsSample = isSaved;
    try {
      localStorage.setItem(STORAGE_WATCHED_HISTORY, JSON.stringify(history));
    } catch {}
  }
}

export function clearWatchedHistory(): void {
  try {
    localStorage.removeItem(STORAGE_WATCHED_HISTORY);
  } catch {}
}
