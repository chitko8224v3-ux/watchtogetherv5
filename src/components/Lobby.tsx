import React, { useState, useEffect } from 'react';
import { ActiveRoomInfo } from '../types';
import { RecentRoom } from '../utils/roomRegistry';
import { Film, Users, RefreshCw, Plus, ArrowRight } from 'lucide-react';

interface LobbyProps {
  initialCode?: string;
  initialName: string;
  isConnecting: boolean;
  errorMessage: string | null;
  activeRooms: ActiveRoomInfo[];
  recentRooms: RecentRoom[];
  isLoadingRooms: boolean;
  currentUser?: { displayName?: string | null; email?: string | null; photoURL?: string | null } | null;
  onSignOut?: () => void;
  onRefreshRooms: () => void;
  onClearRecentRooms: () => void;
  onCreateRoom: (name: string, initialMediaUrl?: string) => void;
  onJoinRoom: (name: string, code: string) => void;
  onOpenLibrary?: () => void;
}

export function Lobby({
  initialCode = '',
  initialName,
  isConnecting,
  errorMessage,
  activeRooms,
  recentRooms = [],
  isLoadingRooms = false,
  currentUser,
  onRefreshRooms,
  onClearRecentRooms,
  onCreateRoom,
  onJoinRoom,
}: LobbyProps) {
  const [name, setName] = useState(initialName || '');
  const [code, setCode] = useState(initialCode || '');

  // Sync display name if user was logged in
  useEffect(() => {
    if (currentUser?.displayName && !name) {
      setName(currentUser.displayName);
    }
  }, [currentUser, name]);

  const getFinalName = () => name.trim() || `Guest ${Math.floor(100 + Math.random() * 900)}`;

  const getRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  // Always show latest available rooms at the top
  const sortedRooms = [...activeRooms].sort((a, b) => {
    const timeB = b.createdAt || b.lastSeen || 0;
    const timeA = a.createdAt || a.lastSeen || 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });

  const handleCreate = () => {
    onCreateRoom(getFinalName());
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length < 3) return;
    onJoinRoom(getFinalName(), cleanCode);
  };

  const handleDirectJoinRoom = (roomCode: string) => {
    const cleanCode = roomCode.trim().toUpperCase();
    setCode(cleanCode);
    onJoinRoom(getFinalName(), cleanCode);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[#090b10] text-[#eceef5]">
      {/* Soft ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[480px] h-[300px] bg-indigo-600/[0.08] rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-[420px] z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25 mb-3">
            <Film className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Watch Together</h1>
          <p className="text-xs text-slate-400 mt-1">
            Synchronized video watch parties in real time
          </p>
        </div>

        {/* Minimalist Unified Card */}
        <div className="bg-[#11131b] border border-white/[0.08] rounded-2xl p-5 shadow-2xl shadow-black/50 backdrop-blur-md space-y-4">
          {/* User Display Name */}
          <div>
            <label
              htmlFor="name-input"
              className="block text-[11px] font-medium text-slate-400 mb-1.5"
            >
              Your Name
            </label>
            <input
              id="name-input"
              type="text"
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full bg-[#161924] border border-white/[0.08] focus:border-indigo-500/70 focus:bg-[#181c29] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all font-medium"
            />
          </div>

          {/* Create Room Button */}
          <button
            onClick={handleCreate}
            disabled={isConnecting}
            className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isConnecting ? 'Creating Room...' : 'Create Room'}
          </button>

          {/* Divider */}
          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-semibold tracking-wider text-slate-500">
              <span className="bg-[#11131b] px-3">or join</span>
            </div>
          </div>

          {/* Available Rooms Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      activeRooms.length > 0 ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  />
                </span>
                <span className="text-xs font-medium text-slate-300">
                  Available Rooms
                </span>
                {activeRooms.length > 0 && (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                    {activeRooms.length}
                  </span>
                )}
              </div>
              <button
                onClick={onRefreshRooms}
                disabled={isLoadingRooms}
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-md cursor-pointer disabled:opacity-50 flex items-center gap-1 text-[11px]"
                title="Refresh available rooms"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isLoadingRooms ? 'animate-spin text-indigo-400' : ''}`}
                />
                <span className="text-[10px] text-slate-400 hover:text-slate-200">Refresh</span>
              </button>
            </div>

            {sortedRooms.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {sortedRooms.map((r, idx) => (
                  <div
                    key={r.code}
                    onClick={() => handleDirectJoinRoom(r.code)}
                    className="group flex items-center justify-between p-2.5 rounded-xl bg-[#161924] hover:bg-[#1c2130] border border-white/[0.06] hover:border-indigo-500/40 transition-all cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-xs text-sky-400 group-hover:text-indigo-300">
                          {r.code}
                        </span>
                        {idx === 0 && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.2 rounded">
                            Latest
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 truncate">
                          by {r.hostName}
                        </span>
                        {(r.createdAt || r.lastSeen) && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            • {getRelativeTime(r.createdAt || r.lastSeen)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 truncate mt-0.5">
                        {r.movieTitle || 'In Lobby'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                        <Users className="w-3 h-3" />
                        {r.viewerCount || 1}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectJoinRoom(r.code);
                        }}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg bg-indigo-600/30 group-hover:bg-indigo-600 text-indigo-200 group-hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>Join</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 px-3 rounded-xl bg-[#161924]/50 border border-white/[0.04] text-center">
                <p className="text-xs text-slate-400">No rooms active right now</p>
              </div>
            )}
          </div>

          {/* Join with Code (Inline minimal row) */}
          <form onSubmit={handleJoin} className="flex gap-2 pt-1">
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="Enter room code"
              className="flex-1 bg-[#161924] border border-white/[0.08] focus:border-indigo-500/70 rounded-xl px-3 py-2 text-xs font-mono font-medium tracking-wider text-center text-white uppercase outline-none placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal transition-all"
            />
            <button
              type="submit"
              disabled={isConnecting || code.trim().length < 3}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-white/10 hover:bg-white/15 active:scale-[0.98] transition-all disabled:opacity-40 cursor-pointer"
            >
              Join Code
            </button>
          </form>

          {/* Recent Rooms Chips */}
          {recentRooms.length > 0 && (
            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1 scrollbar-none">
                <span className="text-[10px] text-slate-500 font-medium shrink-0">Recent:</span>
                {recentRooms.map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => handleDirectJoinRoom(r.code)}
                    className="px-2 py-0.5 rounded-md bg-[#161924] hover:bg-indigo-950/40 border border-white/[0.06] text-[10px] font-mono text-sky-400 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    {r.code}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClearRecentRooms}
                className="text-[10px] text-slate-500 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                title="Clear recent rooms"
              >
                Clear
              </button>
            </div>
          )}

          {/* Error notification */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center font-medium">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="text-center mt-4">
          <p className="text-[11px] text-slate-500">
            Peer-to-peer sync • No sign-up required
          </p>
        </div>
      </div>
    </div>
  );
}
