import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json());

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
  // Keep active rooms for up to 10 minutes without heartbeat
  return Array.from(rooms.values())
    .filter((r) => now - r.lastSeen <= 600000)
    .sort((a, b) => {
      const timeB = b.createdAt || b.lastSeen || 0;
      const timeA = a.createdAt || a.lastSeen || 0;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
}

// Clean inactive rooms older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastSeen > 600000) {
      rooms.delete(code);
    }
  }
}, 30000);

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
