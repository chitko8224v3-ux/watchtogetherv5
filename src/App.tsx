import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';
import confetti from 'canvas-confetti';
import {
  Film,
  Copy,
  Check,
  LogOut,
  Sparkles,
  RefreshCw,
  Share2,
  Star,
} from 'lucide-react';
import { Player } from './components/Player';
import { Sidebar } from './components/Sidebar';
import { Lobby } from './components/Lobby';
import { LibraryModal } from './components/LibraryModal';
import { InviteModal } from './components/InviteModal';
import {
  PeerUser,
  SyncMessage,
  ChatMessageItem,
  FloatingReaction,
  PlayerHandle,
  DesiredPlaybackState,
  ActiveRoomInfo,
} from './types';
import {
  playJoinSound,
  playMessageSound,
  playReactionSound,
} from './utils/sound';
import {
  fetchActiveRooms,
  registerActiveRoom,
  removeActiveRoom,
  getRecentRooms,
  addRecentRoom,
  clearRecentRooms,
  sortRoomsLatestFirst,
  RecentRoom,
} from './utils/roomRegistry';
import {
  recordWatchedMovie,
  isMovieSavedAsSample,
  formatUrlTitle,
} from './data/demoMedia';
import {
  auth,
  signOutUser,
  saveRoomToFirestore,
  deleteRoomFromFirestore,
} from './firebase';
import { User, onAuthStateChanged } from 'firebase/auth';

const PREFIX = 'wtgr-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export default function App() {
  // Navigation / View State
  const [inRoom, setInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [myName, setMyName] = useState(() => {
    try {
      return localStorage.getItem('wt-name') || '';
    } catch {
      return '';
    }
  });

  // Media State
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [theaterMode, setTheaterMode] = useState(false);
  const [drift, setDrift] = useState(0);
  const [desiredState, setDesiredState] = useState<DesiredPlaybackState>({
    playing: false,
    time: 0,
    at: Date.now(),
  });

  // Saved Sample status for current URL
  const [isCurrentSavedSample, setIsCurrentSavedSample] = useState(false);

  // Networking & Chat
  const [peers, setPeers] = useState<PeerUser[]>([]);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [toasts, setToasts] = useState<{ id: string; msg: string; kind?: 'info' | 'err' | 'success' }[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  // Modals
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Active and Recent Rooms State (Manual refresh on user request, no automatic polling)
  const [activeRooms, setActiveRooms] = useState<ActiveRoomInfo[]>([]);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>(() => getRecentRooms());
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const roomHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Manual or initial on-demand fetch of rooms (latest always at top)
  const loadRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const rooms = await fetchActiveRooms();
      setActiveRooms(sortRoomsLatestFirst(rooms));
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  // Firebase auth state
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user?.displayName && !myName) {
        setMyName(user.displayName);
      }
    });
    return () => {
      unsubAuth();
    };
  }, [myName]);

  // Initial load when entering lobby (NO automatic periodic refresh / polling)
  useEffect(() => {
    if (inRoom) return;
    loadRooms();
    setRecentRooms(getRecentRooms());
  }, [inRoom, loadRooms]);

  // Sync isCurrentSavedSample whenever currentUrl changes
  useEffect(() => {
    if (currentUrl) {
      setIsCurrentSavedSample(isMovieSavedAsSample(currentUrl));
    } else {
      setIsCurrentSavedSample(false);
    }
  }, [currentUrl]);

  // References - avoid stale closures in WebRTC events
  const currentUrlRef = useRef(currentUrl);
  useEffect(() => {
    currentUrlRef.current = currentUrl;
  }, [currentUrl]);

  const myNameRef = useRef(myName);
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const peerRef = useRef<Peer | null>(null);
  const hostConnRef = useRef<DataConnection | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());
  const playerRef = useRef<PlayerHandle | null>(null);
  const tickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  // Shared desired playback state
  const desiredRef = useRef<DesiredPlaybackState>({ playing: false, time: 0, at: Date.now() });

  const getDesiredTime = () => {
    const { playing, time, at } = desiredRef.current;
    return playing ? Math.max(0, time + (Date.now() - at) / 1000) : time;
  };

  const setDesired = (playing: boolean, time: number) => {
    const newState = { playing, time, at: Date.now() };
    desiredRef.current = newState;
    setDesiredState(newState);
  };

  const showToast = useCallback((msg: string, kind: 'info' | 'err' | 'success' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, msg, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutUser();
      showToast('Signed out', 'info');
    } catch {
      showToast('Sign out failed', 'err');
    }
  }, [showToast]);

  const enqueue = useCallback((task: () => Promise<void> | void) => {
    chainRef.current = chainRef.current.then(async () => {
      try {
        await task();
      } catch (err) {
        console.warn('Sync queue error:', err);
      }
    });
  }, []);

  // Send message to host or broadcast if host
  const send = useCallback((msg: SyncMessage) => {
    if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send(msg);
    } else if (connsRef.current.size > 0) {
      for (const [, c] of connsRef.current) {
        if (c.open) c.send(msg);
      }
    }
  }, []);

  const broadcast = useCallback((msg: SyncMessage, exceptId?: string) => {
    for (const [id, c] of connsRef.current) {
      if (id !== exceptId && c.open) {
        c.send(msg);
      }
    }
  }, []);

  const teardownPeer = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }
    hostConnRef.current = null;
    connsRef.current.clear();
    namesRef.current.clear();
  }, []);

  // Add system message
  const addSystemMessage = useCallback((text: string) => {
    const item: ChatMessageItem = {
      id: Math.random().toString(36).substring(2, 9),
      from: 'System',
      text,
      mine: false,
      timestamp: Date.now(),
      isSystem: true,
    };
    setMessages((prev) => [...prev, item]);
  }, []);

  // Trigger floating reaction burst
  const triggerReaction = useCallback((emoji: string, from: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    const x = Math.random() * 68 + 16;
    const rot = (Math.random() - 0.5) * 36;
    setReactions((prev) => [...prev, { id, emoji, from, x, rot }]);
    if (emoji === '🎉' || emoji === '🚀') {
      try {
        confetti({
          particleCount: 25,
          spread: 55,
          origin: { y: 0.75 },
          colors: ['#6366f1', '#38bdf8', '#f59e0b', '#ec4899'],
        });
      } catch {}
    }
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2400);
  }, []);

  // Apply state received from remote peer
  const applyState = useCallback((s: { playing: boolean; time: number }, seekThreshold = 1.0) => {
    setDesired(s.playing, s.time);
    const p = playerRef.current;
    if (!p) return;
    const cur = p.time();
    const driftAmt = Math.abs(cur - s.time);
    setDrift(driftAmt);
    p.applySync(s.playing, s.time, driftAmt > seekThreshold);
  }, []);

  // Remote message dispatcher
  const handleRemoteMessage = useCallback(
    (m: SyncMessage) => {
      if (!m || typeof m !== 'object') return;
      switch (m.t) {
        case 'chat': {
          playMessageSound();
          const item: ChatMessageItem = {
            id: m.id || Math.random().toString(36).substring(2, 9),
            from: m.from || 'Guest',
            text: m.text,
            mine: false,
            timestamp: m.timestamp || Date.now(),
            videoTime: m.time,
          };
          setMessages((prev) => [...prev, item]);
          break;
        }
        case 'reaction': {
          playReactionSound();
          triggerReaction(m.emoji, m.from || 'Guest');
          break;
        }
        case 'sys': {
          addSystemMessage(m.text);
          break;
        }
        case 'peers': {
          setPeers(m.list || []);
          break;
        }
        case 'load': {
          addSystemMessage(`${m.from || 'Someone'} loaded: ${m.title || 'New video'}`);
          enqueue(async () => {
            currentUrlRef.current = m.url;
            setCurrentUrl(m.url);
            setUrlInput(m.url);
            setDesired(false, 0);
            recordWatchedMovie(m.url, m.title);
          });
          break;
        }
        case 'state': {
          enqueue(async () => {
            setDesired(m.playing, m.time);
            if (m.url && m.url !== currentUrlRef.current) {
              currentUrlRef.current = m.url;
              setCurrentUrl(m.url);
              setUrlInput(m.url);
              recordWatchedMovie(m.url, m.title);
            } else if (playerRef.current) {
              applyState({ playing: m.playing, time: m.time }, 0);
            }
          });
          break;
        }
        case 'play': {
          enqueue(() => applyState({ playing: true, time: m.time }, 0.8));
          break;
        }
        case 'pause': {
          enqueue(() => applyState({ playing: false, time: m.time }, 0.8));
          break;
        }
        case 'seek': {
          enqueue(() => applyState({ playing: desiredRef.current.playing, time: m.time }, 0));
          break;
        }
        case 'tick': {
          enqueue(() => {
            const p = playerRef.current;
            if (!p || isHostRef.current) return;
            const curT = p.time();
            const driftDelta = Math.abs(curT - m.time);
            setDrift(driftDelta);
            const isPlayingMismatch = m.playing !== desiredRef.current.playing || (m.playing && !p.playing());
            if (driftDelta > 2.0 || isPlayingMismatch) {
              applyState(m, driftDelta > 2.0 ? 1.5 : 99);
            }
          });
          break;
        }
      }
    },
    [addSystemMessage, applyState, enqueue, triggerReaction]
  );

  // Host: accept guest connection
  const hostAccept = useCallback(
    (c: DataConnection) => {
      c.on('open', () => {
        connsRef.current.set(c.peer, c);
      });
      c.on('data', (data) => {
        const m = data as SyncMessage;
        if (!m || typeof m !== 'object') return;
        if (m.t === 'hello') {
          playJoinSound();
          const guestName = String(m.name || 'Guest').slice(0, 20);
          namesRef.current.set(c.peer, guestName);
          let curTime = getDesiredTime();
          if (playerRef.current) {
            try {
              curTime = playerRef.current.time();
            } catch {}
          }
          const curUrl = currentUrlRef.current;
          const isCurrentlyPlaying = desiredRef.current.playing;
          c.send({
            t: 'state',
            url: curUrl,
            time: curTime,
            playing: isCurrentlyPlaying,
          });
          const joinText = `${guestName} joined the room`;
          addSystemMessage(joinText);
          broadcast({ t: 'sys', text: joinText });
          const list: PeerUser[] = [
            { name: myNameRef.current, host: true },
            ...Array.from(connsRef.current.keys()).map((id) => ({
              id,
              name: namesRef.current.get(id) || 'Guest',
              host: false,
            })),
          ];
          setPeers(list);
          broadcast({ t: 'peers', list });
          return;
        }
        if (m.t === 'sync') {
          let curTime = getDesiredTime();
          if (playerRef.current) {
            try {
              curTime = playerRef.current.time();
            } catch {}
          }
          c.send({
            t: 'state',
            url: currentUrlRef.current,
            time: curTime,
            playing: desiredRef.current.playing,
          });
          return;
        }
        handleRemoteMessage(m);
        broadcast(m, c.peer);
      });
      c.on('close', () => {
        const leftName = namesRef.current.get(c.peer) || 'A participant';
        connsRef.current.delete(c.peer);
        namesRef.current.delete(c.peer);
        const leftText = `${leftName} left the room`;
        addSystemMessage(leftText);
        broadcast({ t: 'sys', text: leftText });
        const list: PeerUser[] = [
          { name: myNameRef.current, host: true },
          ...Array.from(connsRef.current.keys()).map((id) => ({
            id,
            name: namesRef.current.get(id) || 'Guest',
            host: false,
          })),
        ];
        setPeers(list);
        broadcast({ t: 'peers', list });
      });
      c.on('error', (err) => {
        console.warn('Connection error with peer:', err);
      });
    },
    [addSystemMessage, broadcast, handleRemoteMessage]
  );

  // Host: Create a Room
  const handleCreateRoom = useCallback(
    (userName: string, initialMediaUrl?: string) => {
      setLobbyError(null);
      setIsConnecting(true);
      setMyName(userName);
      try {
        localStorage.setItem('wt-name', userName);
      } catch {}
      const code = generateRoomCode();
      const movieTitle = initialMediaUrl
        ? formatUrlTitle(initialMediaUrl)
        : 'In Lobby';

      registerActiveRoom({
        code,
        hostName: userName,
        movieTitle,
        movieUrl: initialMediaUrl,
        viewerCount: 1,
      });

      addRecentRoom({
        code,
        name: userName,
        movieTitle,
        visitedAt: Date.now(),
      });
      setRecentRooms(getRecentRooms());

      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      };

      const peerId = PREFIX + code;
      const peer = new Peer(peerId, peerConfig);
      peerRef.current = peer;

      peer.on('open', () => {
        setIsConnecting(false);
        setIsHost(true);
        setRoomCode(code);
        setInRoom(true);
        setPeers([{ name: userName, host: true }]);
        addSystemMessage(`Room created! Anyone in the lobby can join with the code or link.`);
        showToast(`Party room ${code} created!`, 'success');

        if (initialMediaUrl) {
          currentUrlRef.current = initialMediaUrl;
          setCurrentUrl(initialMediaUrl);
          setUrlInput(initialMediaUrl);
          recordWatchedMovie(initialMediaUrl);
        }

        try {
          window.history.replaceState(null, '', '#' + code);
        } catch {}

        const roomCreatedTimestamp = Date.now();
        const roomObj: ActiveRoomInfo = {
          code,
          hostName: userName,
          movieTitle: currentUrlRef.current ? formatUrlTitle(currentUrlRef.current) : movieTitle,
          movieUrl: currentUrlRef.current,
          viewerCount: 1,
          createdAt: roomCreatedTimestamp,
          lastSeen: Date.now(),
        };
        registerActiveRoom(roomObj);
        saveRoomToFirestore(roomObj).catch(() => {});

        tickTimerRef.current = setInterval(() => {
          if (connsRef.current.size > 0 && currentUrlRef.current) {
            let t = getDesiredTime();
            if (playerRef.current) {
              try {
                t = playerRef.current.time();
              } catch {}
            }
            broadcast({
              t: 'tick',
              time: t,
              playing: desiredRef.current.playing,
            });
          }
        }, 3000);

        if (roomHeartbeatRef.current) clearInterval(roomHeartbeatRef.current);
        roomHeartbeatRef.current = setInterval(() => {
          if (!isHostRef.current) return;
          const curMovie = currentUrlRef.current
            ? formatUrlTitle(currentUrlRef.current)
            : 'In Lobby';
          const updateObj: ActiveRoomInfo = {
            code,
            hostName: myNameRef.current || userName,
            movieTitle: curMovie,
            movieUrl: currentUrlRef.current,
            viewerCount: connsRef.current.size + 1,
            createdAt: roomCreatedTimestamp,
            lastSeen: Date.now(),
          };
          registerActiveRoom(updateObj);
          saveRoomToFirestore(updateObj).catch(() => {});
        }, 5000);
      });

      peer.on('connection', hostAccept);
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          teardownPeer();
          handleCreateRoom(userName, initialMediaUrl);
          return;
        }
        setIsConnecting(false);
        teardownPeer();
        setLobbyError(`Could not create room (${err.type}). Please check your internet connection.`);
      });
    },
    [addSystemMessage, broadcast, hostAccept, showToast, teardownPeer]
  );

  // Guest: Join a Room
  const handleJoinRoom = useCallback(
    (userName: string, code: string) => {
      setLobbyError(null);
      setIsConnecting(true);
      setMyName(userName);
      try {
        localStorage.setItem('wt-name', userName);
      } catch {}

      const cleanCode = code.trim().toUpperCase();
      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      };

      const peer = new Peer(peerConfig);
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(PREFIX + cleanCode, { reliable: true });
        hostConnRef.current = conn;

        const timeoutId = setTimeout(() => {
          if (!conn.open) {
            setIsConnecting(false);
            teardownPeer();
            setLobbyError('Could not reach room. Verify the 5-character code or ensure host is online.');
          }
        }, 12000);

        conn.on('open', () => {
          clearTimeout(timeoutId);
          setIsConnecting(false);
          setIsHost(false);
          setRoomCode(cleanCode);
          setInRoom(true);
          addSystemMessage(`Joined room ${cleanCode}`);
          showToast(`Joined room ${cleanCode}!`, 'success');
          addRecentRoom({
            code: cleanCode,
            name: 'Watch Party',
            visitedAt: Date.now(),
          });
          setRecentRooms(getRecentRooms());

          conn.send({ t: 'hello', name: userName });
          try {
            window.history.replaceState(null, '', '#' + cleanCode);
          } catch {}
        });

        conn.on('data', (data) => {
          handleRemoteMessage(data as SyncMessage);
        });

        conn.on('close', () => {
          showToast('The host closed the room or disconnected.', 'err');
          handleLeaveRoom();
        });

        conn.on('error', (err) => {
          console.warn('Host connection error:', err);
        });
      });

      peer.on('error', (err) => {
        setIsConnecting(false);
        teardownPeer();
        if (err.type === 'peer-unavailable') {
          setLobbyError(`Room "${cleanCode}" not found. Please double check the code.`);
        } else {
          setLobbyError(`Failed to connect (${err.type}).`);
        }
      });
    },
    [addSystemMessage, handleRemoteMessage, showToast, teardownPeer]
  );

  const handleLeaveRoom = () => {
    if (roomHeartbeatRef.current) {
      clearInterval(roomHeartbeatRef.current);
      roomHeartbeatRef.current = null;
    }
    if (isHost && roomCode) {
      removeActiveRoom(roomCode);
      deleteRoomFromFirestore(roomCode).catch(() => {});
    }
    teardownPeer();
    setInRoom(false);
    setIsHost(false);
    setRoomCode('');
    currentUrlRef.current = '';
    setCurrentUrl('');
    setUrlInput('');
    setPeers([]);
    setMessages([]);
    setReactions([]);
    setLobbyError(null);
    setDesired(false, 0);
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {}
  };

  // Local Play Event
  const handleLocalPlay = useCallback(
    (time: number) => {
      if (desiredRef.current.playing) return;
      setDesired(true, time);
      send({ t: 'play', time });
      if (currentUrlRef.current) {
        recordWatchedMovie(currentUrlRef.current);
      }
    },
    [send]
  );

  // Local Pause Event
  const handleLocalPause = useCallback(
    (time: number) => {
      if (!desiredRef.current.playing) return;
      setDesired(false, time);
      send({ t: 'pause', time });
    },
    [send]
  );

  // Local Seek Event
  const handleLocalSeek = useCallback(
    (time: number) => {
      if (Math.abs(time - getDesiredTime()) < 1.2) return;
      setDesired(desiredRef.current.playing, time);
      send({ t: 'seek', time });
    },
    [send]
  );

  // Load new video URL for the room (supports MP4, WebM, HLS, YouTube, and Magnet/Torrent)
  const handleLoadUrl = useCallback(
    (url: string, title?: string) => {
      const clean = url.trim();
      if (!clean) return;
      const isMagnet = clean.startsWith('magnet:');
      const isHttp = /^https?:\/\//i.test(clean);
      const isTorrentBlob = clean.startsWith('blob:') || clean.startsWith('data:');
      if (!isMagnet && !isHttp && !isTorrentBlob) {
        showToast('Please enter a valid video link (http, https, YouTube, or magnet / torrent)', 'err');
        return;
      }
      const displayTitle = title || formatUrlTitle(clean);
      addSystemMessage(`You loaded: ${displayTitle}`);
      enqueue(() => {
        currentUrlRef.current = clean;
        setCurrentUrl(clean);
        setUrlInput(clean);
        setDesired(false, 0);
      });
      recordWatchedMovie(clean, displayTitle);
      send({ t: 'load', url: clean, title: displayTitle, from: myNameRef.current });
      if (isHostRef.current && roomCode) {
        saveRoomToFirestore({
          code: roomCode,
          hostName: myNameRef.current,
          movieTitle: displayTitle,
          movieUrl: clean,
          viewerCount: connsRef.current.size + 1,
          createdAt: Date.now(),
          lastSeen: Date.now(),
        }).catch(() => {});
      }
      showToast('Video loaded and saved to Library!', 'success');
    },
    [addSystemMessage, enqueue, roomCode, send, showToast]
  );

  // Player finished loading media metadata
  const handlePlayerReady = useCallback(() => {
    if (!isHostRef.current) {
      send({ t: 'sync' });
    }
    if (currentUrlRef.current) {
      recordWatchedMovie(currentUrlRef.current);
    }
  }, [send]);

  // Send Chat message
  const handleSendMessage = useCallback(
    (text: string, time?: number) => {
      const id = Math.random().toString(36).substring(2, 9);
      const timestamp = Date.now();
      const msgItem: ChatMessageItem = {
        id,
        from: myNameRef.current,
        text,
        mine: true,
        timestamp,
        videoTime: time,
      };
      setMessages((prev) => [...prev, msgItem]);
      send({ t: 'chat', id, from: myNameRef.current, text, time, timestamp });
    },
    [send]
  );

  // Send emoji reaction
  const handleSendReaction = useCallback(
    (emoji: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      triggerReaction(emoji, myNameRef.current);
      send({ t: 'reaction', id, from: myNameRef.current, emoji });
    },
    [send, triggerReaction]
  );

  // Request resync
  const handleResync = useCallback(() => {
    send({ t: 'sync' });
    showToast('Syncing with host playback...', 'info');
  }, [send, showToast]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedCode(true);
      showToast(`Copied room code: ${roomCode}`, 'success');
      setTimeout(() => setCopiedCode(false), 2200);
    });
  };

  // Check URL hash for direct invite link on first mount (e.g. #ABCDE)
  useEffect(() => {
    const hash = window.location.hash.replace(/^#(room=)?/, '').trim().toUpperCase();
    if (hash && hash.length >= 4) {
      setRoomCode(hash.slice(0, 5));
    }
  }, []);

  // Update current video time for chat timestamping
  useEffect(() => {
    const timer = setInterval(() => {
      if (playerRef.current) {
        try {
          setCurrentVideoTime(playerRef.current.time());
        } catch {}
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Before unload cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isHostRef.current && roomCode) {
        removeActiveRoom(roomCode);
        deleteRoomFromFirestore(roomCode).catch(() => {});
      }
      teardownPeer();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roomCode, teardownPeer]);

  if (!inRoom) {
    return (
      <>
        <Lobby
          initialCode={roomCode}
          initialName={myName}
          isConnecting={isConnecting}
          errorMessage={lobbyError}
          activeRooms={activeRooms}
          recentRooms={recentRooms}
          isLoadingRooms={isLoadingRooms}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onRefreshRooms={loadRooms}
          onClearRecentRooms={() => {
            clearRecentRooms();
            setRecentRooms([]);
          }}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onOpenLibrary={() => setIsLibraryOpen(true)}
        />
        <LibraryModal
          isOpen={isLibraryOpen}
          onClose={() => setIsLibraryOpen(false)}
          onSelectVideo={(url) => {
            handleCreateRoom(myName || 'Host', url);
          }}
          currentUrl={currentUrl}
        />
      </>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0c12] text-[#eceef5] overflow-hidden select-none">
      {/* Top Navbar */}
      <header className="h-14 border-b border-white/10 bg-[#12141d]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        {/* Left: Brand & Room code */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Watch Together" className="w-8 h-8 rounded-xl shadow-md shadow-indigo-500/25" />
            <span className="font-extrabold text-sm text-white tracking-tight hidden sm:inline">
              Watch Together
            </span>
          </div>

          {/* Room Code Chip */}
          <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-white/10">
            <button
              onClick={handleCopyCode}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1b1e2c] border border-white/10 hover:border-indigo-500/50 text-xs font-mono font-bold text-sky-300 transition-colors group cursor-pointer"
              title="Click to copy room code"
            >
              <span className="text-[10px] text-slate-400 font-sans uppercase">Room</span>
              <span className="tracking-widest text-indigo-300 font-extrabold">{roomCode}</span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
              )}
            </button>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="Invite Friends"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center: Stream URL Input Bar */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-xl mx-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLoadUrl(urlInput);
            }}
            className="flex-1 flex gap-2"
          >
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste movie or torrent link (.mp4, .m3u8, YouTube, magnet:, .torrent)..."
              className="w-full bg-[#181a26] border border-white/10 focus:border-indigo-500 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!urlInput.trim()}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-500 to-sky-500 hover:brightness-110 text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap cursor-pointer"
            >
              Load
            </button>
          </form>

          <button
            onClick={() => setIsLibraryOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-indigo-300 hover:text-white flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            title="Browse movies & history"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Movie Library</span>
          </button>
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-2.5">
          {currentUser && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#181a26] border border-white/10 text-xs">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'User'}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-[10px] font-bold text-white flex items-center justify-center">
                  {(currentUser.displayName || 'U')[0].toUpperCase()}
                </span>
              )}
              <span className="text-slate-200 font-medium max-w-[80px] truncate text-[11px]">
                {currentUser.displayName || 'User'}
              </span>
            </div>
          )}

          {/* Member count pill */}
          <div className="px-2.5 py-1 rounded-full bg-[#181a26] border border-white/10 text-slate-300 text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{peers.length}</span>
            <span className="hidden sm:inline">watching</span>
          </div>

          {!isHost && (
            <button
              onClick={handleResync}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
              title="Resync with Host"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleLeaveRoom}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Leave this watch room"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Mobile Stream URL Input Bar */}
      <div className="md:hidden p-2.5 bg-[#141621] border-b border-white/10 flex items-center gap-2 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLoadUrl(urlInput);
          }}
          className="flex-1 flex gap-2"
        >
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste video (.mp4 / .m3u8 / YouTube / magnet:)..."
            className="w-full bg-[#1b1e2c] border border-white/10 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow cursor-pointer"
          >
            Load
          </button>
        </form>
        <button
          onClick={() => setIsLibraryOpen(true)}
          className="p-2 rounded-xl bg-white/5 border border-white/10 text-indigo-300 cursor-pointer"
          title="Movie Library"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>

      {/* Main Grid Viewport */}
      <main className="flex-1 p-3 md:p-4 overflow-hidden min-h-0">
        <div
          className={`h-full grid gap-4 transition-all duration-300 ${
            theaterMode
              ? 'grid-cols-1'
              : 'grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]'
          }`}
        >
          {/* Left Column: Player Stage */}
          <div className="flex flex-col gap-3 min-w-0 min-h-0 overflow-y-auto">
            <Player
              ref={playerRef}
              url={currentUrl}
              isHost={isHost}
              desiredState={desiredState}
              drift={drift}
              reactions={reactions}
              messages={messages}
              peers={peers}
              myName={myName}
              onSendMessage={handleSendMessage}
              onSendReaction={handleSendReaction}
              onLocalPlay={handleLocalPlay}
              onLocalPause={handleLocalPause}
              onLocalSeek={handleLocalSeek}
              onReady={handlePlayerReady}
              onResync={handleResync}
              onOpenLibrary={() => setIsLibraryOpen(true)}
              theaterMode={theaterMode}
              onToggleTheater={() => setTheaterMode(!theaterMode)}
            />

            {/* Movie Info & Quick Actions Bar */}
            <div className="p-3.5 bg-[#141622] border border-white/10 rounded-2xl flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate flex items-center gap-2">
                    <span>{currentUrl ? formatUrlTitle(currentUrl) : 'Ready for video'}</span>
                    {currentUrl && isCurrentSavedSample && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <Star className="w-2.5 h-2.5 fill-amber-300" />
                        Saved to Library
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    {isHost
                      ? 'You are the Host. Your play, pause and seek actions sync to everyone in real time.'
                      : 'You are synced with the Host. Play/pause or seek and everyone follows.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsLibraryOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Browse Movies</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Chat & Room Sidebar */}
          {!theaterMode && (
            <div className="h-full min-h-0">
              <Sidebar
                peers={peers}
                messages={messages}
                currentVideoTime={currentVideoTime}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
                onSeekTo={(t) => {
                  playerRef.current?.seek(t);
                  handleLocalSeek(t);
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Floating Toast Alerts */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-[92vw] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl backdrop-blur-md border animate-in slide-in-from-bottom-2 duration-200 ${
              t.kind === 'err'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                : t.kind === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-[#1e2230]/95 border-white/10 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>

      {/* Modals */}
      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        onSelectVideo={handleLoadUrl}
        currentUrl={currentUrl}
      />
      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        roomCode={roomCode}
      />
    </div>
  );
}
