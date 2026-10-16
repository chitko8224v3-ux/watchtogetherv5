import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Film,
  Sparkles,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  MessageSquareOff,
  Send,
  X,
  Smile,
  GripHorizontal,
  Move,
} from 'lucide-react';
import { FloatingReaction, PlayerHandle, DesiredPlaybackState, ChatMessageItem, PeerUser } from '../types';
import { playReactionSound } from '../utils/sound';

declare global {
  interface Window {
    YT: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId?: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (event: unknown) => void;
            onStateChange?: (event: { data: number }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

export function parseMediaUrl(url: string): { kind: 'yt'; id: string } | { kind: 'hls'; url: string } | { kind: 'video'; url: string } {
  const clean = url.trim();
  const ytMatch = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  if (ytMatch) {
    return { kind: 'yt', id: ytMatch[1] };
  }
  if (/\.m3u8(\?|#|$)/i.test(clean)) {
    return { kind: 'hls', url: clean };
  }
  return { kind: 'video', url: clean };
}

const QUICK_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎉', '🍿', '🚀'];

interface PlayerProps {
  url: string;
  isHost: boolean;
  desiredState: DesiredPlaybackState;
  drift: number;
  reactions: FloatingReaction[];
  messages: ChatMessageItem[];
  peers: PeerUser[];
  myName: string;
  onSendMessage: (text: string, time?: number) => void;
  onSendReaction: (emoji: string) => void;
  onLocalPlay: (time: number) => void;
  onLocalPause: (time: number) => void;
  onLocalSeek: (time: number) => void;
  onReady?: () => void;
  onResync: () => void;
  onOpenLibrary: () => void;
  theaterMode: boolean;
  onToggleTheater: () => void;
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player(
  {
    url,
    isHost,
    desiredState,
    drift,
    reactions,
    messages,
    peers,
    myName,
    onSendMessage,
    onSendReaction,
    onLocalPlay,
    onLocalPause,
    onLocalSeek,
    onReady,
    onResync,
    onOpenLibrary,
    theaterMode,
    onToggleTheater,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YTPlayerInstance | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fsInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<'video' | 'hls' | 'yt' | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTapToPlay, setShowTapToPlay] = useState(false);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fullscreen floating toasts and chat state
  const [fsToasts, setFsToasts] = useState<{
    id: string;
    from: string;
    text: string;
    mine: boolean;
    videoTime?: number;
    timestamp: number;
  }[]>([]);
  const [showFsToasts] = useState(true);
  const [showFsChat, setShowFsChat] = useState(true);
  const [fsChatText, setFsChatText] = useState('');
  const [isFsTyping, setIsFsTyping] = useState(false);
  const [fsChatPos, setFsChatPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingFsChat, setIsDraggingFsChat] = useState(false);
  const [isFsChatHovered, setIsFsChatHovered] = useState(false);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);
  const fsChatBoxRef = useRef<HTMLDivElement>(null);

  const lastSeenMsgCountRef = useRef(messages.length);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingRef = useRef(false);
  const lastReportedTimeRef = useRef(0);
  const ytPollRef = useRef<NodeJS.Timeout | null>(null);
  const isApplyingRemoteRef = useRef(false);

  // Keep latest desiredState in a ref for callbacks
  const desiredRef = useRef(desiredState);
  useEffect(() => {
    desiredRef.current = desiredState;
  }, [desiredState]);

  const addFullscreenToast = useCallback(
    (msg: { id: string; from: string; text: string; mine: boolean; videoTime?: number; timestamp: number }) => {
      setFsToasts((prev) => {
        if (
          prev.some(
            (t) =>
              t.id === msg.id ||
              (t.mine && msg.mine && t.text === msg.text && Math.abs(t.timestamp - msg.timestamp) < 2500)
          )
        ) {
          return prev;
        }
        return [...prev.slice(-3), msg];
      });
      setTimeout(() => {
        setFsToasts((prev) => prev.filter((t) => t.id !== msg.id));
      }, 6000);
    },
    []
  );

  // Show floating toast whenever a new message arrives in fullscreen
  useEffect(() => {
    if (messages.length === 0) return;
    const newMessages = messages.slice(lastSeenMsgCountRef.current);
    lastSeenMsgCountRef.current = messages.length;
    if (isFullscreen && showFsToasts && newMessages.length > 0) {
      for (const m of newMessages) {
        if (!m.isSystem) {
          addFullscreenToast(m);
        }
      }
    }
  }, [messages, isFullscreen, showFsToasts, addFullscreenToast]);

  const getDesiredCurrentTime = useCallback(() => {
    const s = desiredRef.current;
    if (!s) return 0;
    return s.playing ? Math.max(0, s.time + (Date.now() - s.at) / 1000) : s.time;
  }, []);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = () => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !isFsTyping && !isDraggingFsChat && !isFsChatHovered) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
      }, 3200);
    }
  };

  // Dragging logic for movable fullscreen chat input box
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current || !fsChatBoxRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const boxRect = fsChatBoxRef.current.getBoundingClientRect();
    const currentX = boxRect.left - containerRect.left;
    const currentY = boxRect.top - containerRect.top;
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: currentX,
      initialY: currentY,
    };
    setIsDraggingFsChat(true);
    setIsControlsVisible(true);
  }, []);

  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    if (!dragStartRef.current || !containerRef.current || !fsChatBoxRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const boxRect = fsChatBoxRef.current.getBoundingClientRect();
    const deltaX = clientX - dragStartRef.current.startX;
    const deltaY = clientY - dragStartRef.current.startY;
    let newX = dragStartRef.current.initialX + deltaX;
    let newY = dragStartRef.current.initialY + deltaY;

    // Bounds constraint inside player container
    const padding = 10;
    const minX = padding;
    const maxX = Math.max(padding, containerRect.width - boxRect.width - padding);
    const minY = padding;
    const maxY = Math.max(padding, containerRect.height - boxRect.height - padding);

    newX = Math.min(Math.max(minX, newX), maxX);
    newY = Math.min(Math.max(minY, newY), maxY);

    setFsChatPos({ x: Math.round(newX), y: Math.round(newY) });
  }, []);

  const handlePointerEnd = useCallback(() => {
    dragStartRef.current = null;
    setIsDraggingFsChat(false);
  }, []);

  useEffect(() => {
    if (!isDraggingFsChat) return;
    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handlePointerMove(e.clientX, e.clientY);
    };
    const onMouseUp = () => {
      handlePointerEnd();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => {
      handlePointerEnd();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isDraggingFsChat, handlePointerMove, handlePointerEnd]);

  const executeApplySync = useCallback((playing: boolean, time: number, forceSeek = false) => {
    isApplyingRemoteRef.current = true;
    setShowTapToPlay(false);
    if (ytRef.current) {
      const yt = ytRef.current;
      const cur = yt.getCurrentTime() || 0;
      if (forceSeek || Math.abs(cur - time) > 1.2) {
        try {
          yt.seekTo(Math.max(0, time), true);
        } catch {}
      }
      if (playing) {
        try {
          yt.playVideo();
        } catch {}
      } else {
        try {
          yt.pauseVideo();
        } catch {}
      }
    } else if (videoRef.current) {
      const v = videoRef.current;
      const cur = v.currentTime || 0;
      if (forceSeek || Math.abs(cur - time) > 1.2) {
        try {
          v.currentTime = Math.max(0, time);
        } catch {}
      }
      if (playing) {
        const p = v.play();
        if (p?.catch) {
          p.catch((err) => {
            if (err?.name === 'NotAllowedError') {
              setShowTapToPlay(true);
            }
          });
        }
      } else {
        try {
          v.pause();
        } catch {}
      }
    }
    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 400);
  }, []);

  useImperativeHandle(ref, () => ({
    play: () => {
      isApplyingRemoteRef.current = true;
      setShowTapToPlay(false);
      if (ytRef.current) {
        try {
          ytRef.current.playVideo();
        } catch {}
      } else if (videoRef.current) {
        const p = videoRef.current.play();
        if (p?.catch) {
          p.catch((err) => {
            if (err?.name === 'NotAllowedError') {
              setShowTapToPlay(true);
            }
          });
        }
      }
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 300);
    },
    pause: () => {
      isApplyingRemoteRef.current = true;
      if (ytRef.current) {
        try {
          ytRef.current.pauseVideo();
        } catch {}
      } else if (videoRef.current) {
        videoRef.current.pause();
      }
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 300);
    },
    seek: (time: number) => {
      isApplyingRemoteRef.current = true;
      if (ytRef.current) {
        try {
          ytRef.current.seekTo(Math.max(0, time), true);
        } catch {}
      } else if (videoRef.current) {
        try {
          videoRef.current.currentTime = Math.max(0, time);
        } catch {}
      }
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 400);
    },
    applySync: (playing: boolean, time: number, forceSeek = false) => {
      executeApplySync(playing, time, forceSeek);
    },
    time: () => {
      if (ytRef.current) {
        try {
          return ytRef.current.getCurrentTime() || 0;
        } catch {
          return 0;
        }
      }
      return videoRef.current?.currentTime || 0;
    },
    duration: () => {
      if (ytRef.current) {
        try {
          return ytRef.current.getDuration() || 0;
        } catch {
          return 0;
        }
      }
      return videoRef.current?.duration || 0;
    },
    playing: () => {
      if (ytRef.current) {
        try {
          const st = ytRef.current.getPlayerState();
          return st === 1 || st === 3;
        } catch {
          return false;
        }
      }
      const v = videoRef.current;
      return !!v && !v.paused && !v.ended;
    },
    setVolume: (val: number) => {
      setVolume(val);
      if (videoRef.current) videoRef.current.volume = val;
      if (ytRef.current) ytRef.current.setVolume(Math.round(val * 100));
    },
    setMuted: (muted: boolean) => {
      setIsMuted(muted);
      if (videoRef.current) videoRef.current.muted = muted;
      if (ytRef.current) {
        if (muted) ytRef.current.mute();
        else ytRef.current.unMute();
      }
    },
    destroy: () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (ytRef.current) {
        try {
          ytRef.current.destroy();
        } catch {}
        ytRef.current = null;
      }
      if (ytPollRef.current) {
        clearInterval(ytPollRef.current);
        ytPollRef.current = null;
      }
    },
  }));

  const destroyCurrentPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (ytRef.current) {
      try {
        ytRef.current.destroy();
      } catch {}
      ytRef.current = null;
    }
    if (ytPollRef.current) {
      clearInterval(ytPollRef.current);
      ytPollRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setLoadError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setShowTapToPlay(false);
  }, []);

  useEffect(() => {
    if (!url) {
      destroyCurrentPlayer();
      setKind(null);
      return;
    }
    destroyCurrentPlayer();
    const media = parseMediaUrl(url);
    setKind(media.kind);

    if (media.kind === 'yt') {
      let isMounted = true;
      const initYT = () => {
        const holder = document.getElementById('yt-player-slot');
        if (!holder || !window.YT || !window.YT.Player) return;
        try {
          const ytPlayer = new window.YT.Player(holder, {
            videoId: media.id,
            width: '100%',
            height: '100%',
            playerVars: {
              playsinline: 1,
              rel: 0,
              modestbranding: 1,
              controls: 1,
              autoplay: 0,
            },
            events: {
              onReady: () => {
                if (!isMounted) return;
                ytRef.current = ytPlayer;
                const d = ytPlayer.getDuration() || 0;
                setDuration(d);
                const initialTarget = getDesiredCurrentTime();
                const shouldPlay = desiredRef.current.playing;
                if (initialTarget > 0) {
                  try {
                    ytPlayer.seekTo(initialTarget, true);
                  } catch {}
                }
                if (shouldPlay) {
                  try {
                    ytPlayer.playVideo();
                  } catch {}
                }
                if (onReady) onReady();
                ytPollRef.current = setInterval(() => {
                  try {
                    const t = ytPlayer.getCurrentTime() || 0;
                    const dur = ytPlayer.getDuration() || 0;
                    setCurrentTime(t);
                    if (dur > 0) setDuration(dur);
                  } catch {}
                }, 500);
              },
              onStateChange: (e) => {
                if (!isMounted) return;
                const state = e.data;
                const curT = ytPlayer.getCurrentTime() || 0;
                setCurrentTime(curT);
                if (isApplyingRemoteRef.current) {
                  return;
                }
                if (state === 1) {
                  setIsPlaying(true);
                  setShowTapToPlay(false);
                  onLocalPlay(curT);
                } else if (state === 2) {
                  setIsPlaying(false);
                  onLocalPause(curT);
                }
              },
              onError: (err) => {
                setLoadError(`YouTube video playback restricted or unavailable (code ${err.data}).`);
              },
            },
          });
        } catch {
          setLoadError('Failed to initialize YouTube embedded player.');
        }
      };

      if (!window.YT || !window.YT.Player) {
        if (!document.getElementById('yt-iframe-api')) {
          const tag = document.createElement('script');
          tag.id = 'yt-iframe-api';
          tag.src = 'https://www.youtube.com/iframe_api';
          document.head.appendChild(tag);
        }
        const previousReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (previousReady) previousReady();
          if (isMounted) initYT();
        };
      } else {
        setTimeout(initYT, 60);
      }
      return () => {
        isMounted = false;
        destroyCurrentPlayer();
      };
    } else {
      const video = videoRef.current;
      if (!video) return;

      const handleInitialSync = () => {
        setDuration(video.duration || 0);
        const initialTarget = getDesiredCurrentTime();
        const shouldPlay = desiredRef.current.playing;
        isApplyingRemoteRef.current = true;
        if (initialTarget > 0) {
          try {
            video.currentTime = initialTarget;
          } catch {}
        }
        if (shouldPlay) {
          const p = video.play();
          if (p?.catch) {
            p.catch((err) => {
              if (err?.name === 'NotAllowedError') {
                setShowTapToPlay(true);
              }
            });
          }
        }
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 400);
        if (onReady) onReady();
      };

      video.addEventListener('loadedmetadata', handleInitialSync, { once: true });

      if (media.kind === 'hls') {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
          });
          hls.loadSource(media.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setLoadError('HLS stream loading failed. The host server might block cross-origin playback.');
            }
          });
          hlsRef.current = hls;
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = media.url;
        } else {
          setLoadError('HLS streams (.m3u8) are not natively supported in this browser.');
        }
      } else {
        video.src = media.url;
      }
    }
    return () => {
      destroyCurrentPlayer();
    };
  }, [url, destroyCurrentPlayer, getDesiredCurrentTime, onLocalPlay, onLocalPause, onReady]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement && !isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
      if (isFullscreen && (e.key === 'Enter' || e.key === 'c' || e.key === 'C')) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          setShowFsChat(true);
          setIsFsTyping(true);
          setIsControlsVisible(true);
          setTimeout(() => fsInputRef.current?.focus(), 50);
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const onVideoPlay = () => {
    setIsPlaying(true);
    setShowTapToPlay(false);
    if (isApplyingRemoteRef.current) return;
    if (videoRef.current) {
      onLocalPlay(videoRef.current.currentTime);
    }
  };

  const onVideoPause = () => {
    setIsPlaying(false);
    if (isApplyingRemoteRef.current) return;
    if (videoRef.current && !videoRef.current.ended) {
      onLocalPause(videoRef.current.currentTime);
    }
  };

  const onVideoTimeUpdate = () => {
    if (!videoRef.current || isSeekingRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
  };

  const onVideoSeeked = () => {
    if (!videoRef.current) return;
    if (isApplyingRemoteRef.current) return;
    const t = videoRef.current.currentTime;
    if (Math.abs(t - lastReportedTimeRef.current) > 0.5) {
      lastReportedTimeRef.current = t;
      onLocalSeek(t);
    }
  };

  const onVideoError = () => {
    setLoadError('Could not play video. Ensure the URL is an accessible, direct video file (.mp4, .webm, .m3u8).');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    setCurrentTime(target);
    lastReportedTimeRef.current = target;
    if (ytRef.current) {
      ytRef.current.seekTo(target, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onLocalSeek(target);
  };

  const handleSkip = (seconds: number) => {
    const target = Math.min(Math.max(0, currentTime + seconds), duration || Infinity);
    setCurrentTime(target);
    lastReportedTimeRef.current = target;
    if (ytRef.current) {
      ytRef.current.seekTo(target, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onLocalSeek(target);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    if (ytRef.current) {
      ytRef.current.setVolume(Math.round(val * 100));
      if (val === 0) ytRef.current.mute();
      else ytRef.current.unMute();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (ytRef.current) {
      if (nextMuted) ytRef.current.mute();
      else ytRef.current.unMute();
    }
  };

  const handlePlayPauseToggle = () => {
    if (isPlaying) {
      if (ytRef.current) ytRef.current.pauseVideo();
      else videoRef.current?.pause();
    } else {
      setShowTapToPlay(false);
      if (ytRef.current) ytRef.current.playVideo();
      else {
        const p = videoRef.current?.play();
        if (p?.catch) {
          p.catch(() => setShowTapToPlay(true));
        }
      }
    }
  };

  const handleTapToJoin = () => {
    setShowTapToPlay(false);
    const target = getDesiredCurrentTime();
    if (ytRef.current) {
      if (target > 0) ytRef.current.seekTo(target, true);
      ytRef.current.playVideo();
    } else if (videoRef.current) {
      if (target > 0) videoRef.current.currentTime = target;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleFullscreenChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = fsChatText.trim();
    if (!text) return;
    const time = Math.floor(currentTime);
    onSendMessage(text, time);
    setFsChatText('');
    addFullscreenToast({
      id: Math.random().toString(36).substring(2, 9),
      from: myName || 'You',
      text,
      mine: true,
      videoTime: time,
      timestamp: Date.now(),
    });
  };

  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hues = [220, 260, 290, 330, 160, 190, 35];
    const hue = hues[Math.abs(hash) % hues.length];
    return `hsl(${hue}, 70%, 45%)`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen rounded-none border-0 max-h-none'
          : theaterMode
          ? 'max-h-[82vh]'
          : 'max-h-[calc(100vh-210px)]'
      }`}
    >
      {url ? (
        <div className="absolute inset-0 w-full h-full">
          {kind === 'yt' ? (
            <div className="w-full h-full">
              <div id="yt-player-slot" className="w-full h-full" />
            </div>
          ) : (
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              playsInline
              preload="auto"
              onPlay={onVideoPlay}
              onPause={onVideoPause}
              onTimeUpdate={onVideoTimeUpdate}
              onSeeked={onVideoSeeked}
              onError={onVideoError}
              onClick={handlePlayPauseToggle}
            />
          )}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#12141c] to-[#0a0b0f]">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-3xl mb-4 shadow-lg shadow-indigo-500/5 text-indigo-400">
            🎬
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Video Loaded Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Paste any direct video link (<span className="text-indigo-300 font-mono text-xs">.mp4</span>,{' '}
            <span className="text-indigo-300 font-mono text-xs">.webm</span>,{' '}
            <span className="text-indigo-300 font-mono text-xs">.m3u8</span>) or a YouTube URL above. Everyone in the room will sync automatically!
          </p>
          <button
            onClick={onOpenLibrary}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            Browse Movie Library
          </button>
        </div>
      )}

      {/* Floating Reaction Emojis Burst Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {reactions.map((r) => (
          <div
            key={r.id}
            style={
              {
                left: `${r.x}%`,
                bottom: '18%',
                '--rot': `${r.rot}deg`,
              } as React.CSSProperties
            }
            className="absolute animate-float-reaction flex flex-col items-center gap-1 select-none"
          >
            <span className="text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transform-gpu">
              {r.emoji}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 border border-white/10 shadow">
              {r.from}
            </span>
          </div>
        ))}
      </div>

      {/* Fullscreen Floating Message Toasts Stack */}
      {isFullscreen && showFsChat && showFsToasts && fsToasts.length > 0 && (
        <div className="absolute bottom-28 left-6 z-40 flex flex-col gap-2 max-w-xs sm:max-w-md pointer-events-auto select-none">
          {fsToasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-3.5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-start gap-2.5 transition-all transform animate-in slide-in-from-bottom-2 fade-in duration-200 ${
                toast.mine
                  ? 'bg-gradient-to-r from-indigo-950/90 via-indigo-900/85 to-[#121422]/90 border-indigo-500/40 text-white shadow-indigo-500/10'
                  : 'bg-[#0e111a]/90 border-white/15 text-slate-100 shadow-black/70'
              }`}
            >
              <span
                className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md"
                style={{ backgroundColor: getAvatarColor(toast.from) }}
              >
                {toast.from.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-xs font-bold ${toast.mine ? 'text-indigo-300' : 'text-slate-200'}`}>
                    {toast.mine ? `${toast.from} (You)` : toast.from}
                  </span>
                  {toast.videoTime !== undefined && (
                    <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-500/15 border border-indigo-500/20 px-1.5 py-0.2 rounded">
                      {formatTime(toast.videoTime)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white break-words leading-relaxed">
                  {toast.text}
                </p>
              </div>
              <button
                onClick={() => setFsToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                title="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Movable Message Input Box */}
      {isFullscreen && showFsChat && (
        <div
          ref={fsChatBoxRef}
          onMouseEnter={() => setIsFsChatHovered(true)}
          onMouseLeave={() => setIsFsChatHovered(false)}
          style={
            fsChatPos
              ? {
                  left: `${fsChatPos.x}px`,
                  top: `${fsChatPos.y}px`,
                  transform: 'none',
                  bottom: 'auto',
                  transition: isDraggingFsChat ? 'none' : 'opacity 0.2s ease',
                }
              : {
                  left: '50%',
                  bottom: '5.2rem',
                  transform: 'translateX(-50%)',
                  transition: isDraggingFsChat ? 'none' : 'opacity 0.2s ease, transform 0.2s ease',
                }
          }
          className={`absolute z-40 max-w-lg w-[92vw] sm:w-[480px] pointer-events-auto select-none ${
            isControlsVisible || isFsTyping || isDraggingFsChat || isFsChatHovered
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <div
            className={`bg-[#0e111a]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2 transition-all ${
              isDraggingFsChat
                ? 'ring-2 ring-indigo-500 shadow-indigo-500/30 scale-[1.01]'
                : 'hover:border-white/30'
            }`}
          >
            {/* Movable Drag Handle Bar */}
            <div
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.preventDefault();
                handleDragStart(e.clientX, e.clientY);
              }}
              onTouchStart={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                if (e.touches.length > 0) {
                  handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
                }
              }}
              className="flex items-center justify-between px-2 py-1 -mt-0.5 -mx-0.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.12] cursor-grab active:cursor-grabbing border border-white/5 transition-colors select-none text-[11px] text-slate-400 group/handle"
              title="Click and drag to move chat input box anywhere"
            >
              <div className="flex items-center gap-1.5 font-medium pointer-events-none">
                <GripHorizontal className="w-4 h-4 text-slate-400 group-hover/handle:text-indigo-400 transition-colors" />
                <span className="text-[10px] uppercase tracking-wider text-slate-300 font-bold flex items-center gap-1">
                  <Move className="w-2.5 h-2.5 text-indigo-400" /> Movable Chat
                </span>
                <span className="text-[9px] text-slate-500 hidden sm:inline">(drag to move)</span>
              </div>
              <div className="flex items-center gap-1">
                {fsChatPos && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFsChatPos(null);
                    }}
                    className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors text-slate-400 cursor-pointer"
                    title="Reset to default position"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFsChat(false);
                  }}
                  className="p-1 hover:text-white hover:bg-white/10 rounded transition-colors text-slate-400 cursor-pointer"
                  title="Hide chat overlay"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleFullscreenChatSubmit} className="flex items-center gap-2">
              <input
                ref={fsInputRef}
                type="text"
                value={fsChatText}
                onChange={(e) => setFsChatText(e.target.value)}
                onFocus={() => setIsFsTyping(true)}
                onBlur={() => setIsFsTyping(false)}
                placeholder="Send a message (shows as floating toast)... [Enter]"
                maxLength={250}
                className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-400 focus:bg-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 outline-none transition-all select-text"
              />
              <button
                type="submit"
                disabled={!fsChatText.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 hover:brightness-110 active:scale-95 text-white text-xs font-bold shadow flex items-center gap-1.5 disabled:opacity-40 transition-all shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>

            {/* Quick Emojis Bar on Fullscreen Input */}
            <div className="flex items-center justify-between px-1 pt-1 border-t border-white/10 text-xs">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                <Smile className="w-3 h-3 text-indigo-400" /> React:
              </span>
              <div className="flex items-center gap-1">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      playReactionSound();
                      onSendReaction(emoji);
                    }}
                    className="p-1 hover:scale-125 active:scale-95 transition-transform text-sm cursor-pointer"
                    title={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Autoplay block overlay ("Tap to join playback") */}
      {showTapToPlay && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
          <div className="p-4 rounded-full bg-indigo-500/20 border border-indigo-500/40 mb-3 text-indigo-400 animate-pulse">
            <Play className="w-8 h-8 fill-indigo-400" />
          </div>
          <h4 className="text-lg font-bold text-white mb-1">Click to Sync Audio & Video</h4>
          <p className="text-xs text-slate-300 max-w-xs mb-4">
            The room is playing at {formatTime(getDesiredCurrentTime())}. Click below to enable browser audio and join!
          </p>
          <button
            onClick={handleTapToJoin}
            className="px-6 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
          >
            Join Playback ({formatTime(getDesiredCurrentTime())})
          </button>
        </div>
      )}

      {/* Load error banner */}
      {loadError && (
        <div className="absolute top-4 left-4 right-4 bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs px-4 py-3 rounded-xl backdrop-blur-md z-30 flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={onOpenLibrary}
            className="text-[11px] underline font-semibold text-rose-300 hover:text-white shrink-0 ml-3 cursor-pointer"
          >
            Choose from movie library
          </button>
        </div>
      )}

      {/* Top Overlay Bar: Sync Status Badge */}
      {url && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
          <div
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md border flex items-center gap-1.5 shadow-lg ${
              Math.abs(drift) > 1.5
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                Math.abs(drift) > 1.5 ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
              }`}
            />
            {Math.abs(drift) > 1.5 ? `Drift ${drift.toFixed(1)}s` : 'In Perfect Sync'}
          </div>
        </div>
      )}

      {/* Custom Video Controls Bar */}
      {url && kind !== 'yt' && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 z-20 transition-opacity duration-300 ${
            isControlsVisible || isFsTyping ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress / Seek bar */}
          <div className="relative flex items-center mb-2.5 group/seek">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              onMouseDown={() => (isSeekingRef.current = true)}
              onMouseUp={() => (isSeekingRef.current = false)}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:h-2 transition-all"
            />
          </div>

          <div className="flex items-center justify-between text-white text-xs">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPauseToggle}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>
              <button
                onClick={() => handleSkip(-10)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleSkip(10)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-400 opacity-60 group-hover/vol:opacity-100 transition-opacity"
                />
              </div>

              {/* Time display */}
              <span className="font-mono text-slate-300 text-[11px] ml-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              {!isHost && (
                <button
                  onClick={onResync}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Resync playback with host timestamp"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resync</span>
                </button>
              )}

              {/* Fullscreen Chat Toggle Button */}
              {isFullscreen && (
                <button
                  onClick={() => {
                    const next = !showFsChat;
                    setShowFsChat(next);
                    if (next) {
                      setIsControlsVisible(true);
                      setTimeout(() => fsInputRef.current?.focus(), 60);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showFsChat
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/50'
                      : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white'
                  }`}
                  title={showFsChat ? 'Hide Movable Chat Overlay' : 'Show Movable Chat Box'}
                >
                  {showFsChat ? <MessageSquare className="w-3.5 h-3.5" /> : <MessageSquareOff className="w-3.5 h-3.5" />}
                  <span>Chat</span>
                </button>
              )}

              <button
                onClick={onOpenLibrary}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Movie Library"
              >
                <Film className="w-4 h-4" />
              </button>
              <button
                onClick={onToggleTheater}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors hidden sm:block cursor-pointer"
                title={theaterMode ? 'Normal View' : 'Theater View'}
              >
                <Minimize className="w-4 h-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
