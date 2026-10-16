import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import parseTorrent from 'parse-torrent';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '30mb' }));

interface ActiveRoom {
  code: string;
  hostName: string;
  movieTitle: string;
  movieUrl?: string;
  viewerCount: number;
  lastSeen: number;
  createdAt: number;
}

const rooms = new Map<string, ActiveRoom>();

function getFilteredActiveRooms(): ActiveRoom[] {
  const now = Date.now();
  // Rooms send heartbeat every 5s. If no heartbeat within 25s, room is no longer active
  return Array.from(rooms.values())
    .filter((r) => now - r.lastSeen <= 25000)
    .sort((a, b) => {
      const timeB = b.createdAt || b.lastSeen || 0;
      const timeA = a.createdAt || a.lastSeen || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
}

// Clean inactive rooms older than 25 seconds
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastSeen > 25000) {
      rooms.delete(code);
    }
  }
}, 10000);

// GET /api/rooms - list active rooms on demand
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: getFilteredActiveRooms() });
});

// POST /api/rooms - register or heartbeat an active room
app.post('/api/rooms', (req, res) => {
  const { code, hostName, movieTitle, movieUrl, viewerCount } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ error: 'Code is required' });
    return;
  }
  const cleanCode = code.trim().toUpperCase();
  const existing = rooms.get(cleanCode);
  const updated: ActiveRoom = {
    code: cleanCode,
    hostName: hostName || (existing ? existing.hostName : 'Host'),
    movieTitle: movieTitle || (existing ? existing.movieTitle : 'No movie loaded'),
    movieUrl: movieUrl || (existing ? existing.movieUrl : undefined),
    viewerCount: typeof viewerCount === 'number' ? viewerCount : 1,
    lastSeen: Date.now(),
    createdAt: existing ? existing.createdAt : Date.now(),
  };
  rooms.set(cleanCode, updated);
  res.json({ ok: true, room: updated });
});

// DELETE /api/rooms/:code - remove a room when host leaves
app.delete('/api/rooms/:code', (req, res) => {
  const cleanCode = req.params.code.trim().toUpperCase();
  rooms.delete(cleanCode);
  res.json({ ok: true });
});

// POST /api/torrent/upload - upload a .torrent file and convert it to a streamable magnet link
app.post('/api/torrent/upload', (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      res.status(400).json({ error: 'fileBase64 is required' });
      return;
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    const parsed: any = parseTorrent(buffer);

    // Default high-availability trackers to ensure immediate peer connection in WebTorrent
    const defaultTrackers = [
      'wss://tracker.openwebtorrent.com',
      'wss://tracker.btorrent.xyz',
      'wss://tracker.fastcast.nz',
      'wss://tracker.webtorrent.dev',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'http://tracker.opentrackr.org:1337/announce',
    ];

    if (!parsed.announce) parsed.announce = [];
    defaultTrackers.forEach((tr) => {
      if (!parsed.announce.includes(tr)) parsed.announce.push(tr);
    });

    const magnetUrl = (parseTorrent as any).toMagnetURI(parsed);
    const title = parsed.name || (fileName ? fileName.replace(/\.torrent$/i, '') : 'Torrent Movie');

    res.json({
      ok: true,
      infoHash: parsed.infoHash,
      title,
      magnetUrl,
      size: parsed.length || 0,
      files: (parsed.files || []).map((f: any) => ({ name: f.name, length: f.length })),
    });
  } catch (err: any) {
    console.error('Failed to parse torrent file upload:', err);
    res.status(400).json({ error: err?.message || 'Could not parse .torrent file' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Watch Together Server listening on port ${PORT}`);
  });
}

startServer();
