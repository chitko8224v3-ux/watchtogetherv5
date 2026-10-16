import React, { useState, useRef, useEffect } from 'react';
import { Send, Users, Crown, Volume2, VolumeX, MessageSquare, Smile, Clock } from 'lucide-react';
import { ChatMessageItem, PeerUser } from '../types';
import { isSoundEnabled, setSoundEnabled, playReactionSound } from '../utils/sound';

const QUICK_EMOJIS = ['❤️', '😂', '🔥', '👏', '😮', '🎉', '🍿', '🚀'];

interface SidebarProps {
  peers: PeerUser[];
  messages: ChatMessageItem[];
  currentVideoTime: number;
  onSendMessage: (text: string, time?: number) => void;
  onSendReaction: (emoji: string) => void;
  onSeekTo: (time: number) => void;
}

export function Sidebar({
  peers,
  messages,
  currentVideoTime,
  onSendMessage,
  onSendReaction,
  onSeekTo,
}: SidebarProps) {
  const [chatText, setChatText] = useState('');
  const [tagVideoTime, setTagVideoTime] = useState(false);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    onSendMessage(text, tagVideoTime ? Math.floor(currentVideoTime) : undefined);
    setChatText('');
  };

  const handleEmojiClick = (emoji: string) => {
    playReactionSound();
    onSendReaction(emoji);
  };

  const formatVideoTime = (secs?: number) => {
    if (secs === undefined || isNaN(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Generate deterministic pastel avatar background from name
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hues = [220, 260, 290, 330, 160, 190, 35];
    const hue = hues[Math.abs(hash) % hues.length];
    return `hsl(${hue}, 70%, 45%)`;
  };

  return (
    <div className="flex flex-col h-full bg-[#13151f] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
      {/* Participants Header */}
      <div className="p-3.5 border-b border-white/10 bg-[#161824] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">In Room</h4>
            <p className="text-[11px] text-slate-400 font-medium">
              {peers.length} {peers.length === 1 ? 'member' : 'members'} online
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleSound}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={soundOn ? 'Sound effects enabled' : 'Sound effects muted'}
        >
          {soundOn ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* Peer Badges List */}
      <div className="p-3 border-b border-white/5 bg-[#141622] flex flex-wrap gap-1.5 max-h-28 overflow-y-auto shrink-0">
        {peers.map((peer, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              peer.host
                ? 'bg-gradient-to-r from-amber-500/15 to-orange-500/15 border-amber-500/30 text-amber-300 shadow-sm'
                : 'bg-white/5 border-white/10 text-slate-200'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: peer.host ? '#f59e0b' : getAvatarColor(peer.name) }}
            />
            {peer.host && <Crown className="w-3 h-3 text-amber-400 fill-amber-400 inline" />}
            <span className="truncate max-w-[110px]">{peer.name}</span>
          </span>
        ))}
      </div>

      {/* Chat Messages Feed */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2.5 min-h-0 text-sm">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs">
            <MessageSquare className="w-8 h-8 stroke-1 mb-2 text-slate-600" />
            <p className="font-semibold text-slate-400">Say hello!</p>
            <p>Chat messages and reactions sync live with everyone in this room.</p>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="text-center my-1.5">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 text-slate-400 border border-white/5">
                    {msg.text}
                  </span>
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.mine ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5 text-[11px] text-slate-400">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: getAvatarColor(msg.from) }}
                  />
                  <span className={`font-semibold ${msg.mine ? 'text-indigo-400' : 'text-slate-300'}`}>
                    {msg.from}
                  </span>
                  {msg.videoTime !== undefined && (
                    <button
                      onClick={() => onSeekTo(msg.videoTime!)}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 font-mono text-[10px] font-bold transition-colors cursor-pointer"
                      title="Click to jump to this moment in video"
                    >
                      <Clock className="w-2.5 h-2.5" />
                      {formatVideoTime(msg.videoTime)}
                    </button>
                  )}
                  <span className="text-[10px] text-slate-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl max-w-[88%] text-xs leading-relaxed break-words shadow-sm ${
                    msg.mine
                      ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none'
                      : 'bg-[#1e2230] text-slate-100 border border-white/10 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Bar */}
      <div className="px-3 py-2 bg-[#171926] border-t border-white/5 flex items-center justify-between gap-1 overflow-x-auto shrink-0">
        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1 shrink-0 mr-1">
          <Smile className="w-3 h-3 text-indigo-400" /> React:
        </span>
        <div className="flex items-center gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleEmojiClick(emoji)}
              className="p-1.5 text-base rounded-lg hover:bg-white/10 hover:scale-125 active:scale-95 transition-transform cursor-pointer"
              title={`Send ${emoji} reaction`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Input Box */}
      <form onSubmit={handleSubmit} className="p-3 bg-[#161824] border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Say something to the room..."
              maxLength={300}
              className="w-full bg-[#1d202e] border border-white/10 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none transition-all pr-12"
            />
            {currentVideoTime > 0 && (
              <button
                type="button"
                onClick={() => setTagVideoTime(!tagVideoTime)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                  tagVideoTime
                    ? 'bg-indigo-500 text-white shadow'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
                title="Tag current video timestamp in message"
              >
                {formatVideoTime(currentVideoTime)}
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!chatText.trim()}
            className="p-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 text-white font-semibold shadow hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
