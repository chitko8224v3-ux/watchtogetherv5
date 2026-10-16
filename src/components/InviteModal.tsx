import React, { useState } from 'react';
import { X, Copy, Check, Share2 } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export function InviteModal({ isOpen, onClose, roomCode }: InviteModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#${roomCode}`
      : `https://...#${roomCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#141622] border border-white/10 rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Invite Friends</h3>
              <p className="text-xs text-slate-400">Anyone with this code can join the watch party</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Code Display */}
        <div className="p-4 rounded-xl bg-[#1b1e2c] border border-white/10 text-center mb-4">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block mb-1">
            Room Code
          </span>
          <div className="text-3xl font-mono font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-sky-400">
            {roomCode}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={handleCopyLink}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-500 to-sky-500 hover:brightness-110 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
          >
            {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? 'Invite Link Copied to Clipboard!' : 'Copy Direct Invite Link'}</span>
          </button>
          <button
            onClick={handleCopyCode}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCode ? 'Code Copied!' : 'Copy Room Code Only'}</span>
          </button>
        </div>

        {/* Friendly instruction */}
        <div className="mt-4 pt-4 border-t border-white/5 text-[11px] text-slate-400 leading-relaxed text-center">
          Opening the invite link automatically fills in the room code so your friends can jump right into the party.
        </div>
      </div>
    </div>
  );
}
