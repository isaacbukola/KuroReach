import React, { useState } from 'react';
import { AlertTriangle, Send, X } from 'lucide-react';
import type { PendingSendConfirmation } from '../types';

interface ConfirmSendModalProps {
  confirmation: PendingSendConfirmation | null;
  onCancel: () => void;
}

export const ConfirmSendModal: React.FC<ConfirmSendModalProps> = ({ confirmation, onCancel }) => {
  const [isExecuting, setIsExecuting] = useState(false);

  if (!confirmation) return null;

  const handleConfirm = async () => {
    setIsExecuting(true);
    try {
      await confirmation.onConfirm();
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-send-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#121317] border border-white/[0.12] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 id="confirm-send-title" className="font-display text-base font-semibold text-white">
                {confirmation.mode === 'batch'
                  ? `Confirm Dispatch of ${confirmation.recipients.length} Emails`
                  : 'Confirm Gmail Dispatch'}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                This action sends real emails through your connected Gmail account(s).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="text-zinc-500 hover:text-zinc-200 p-1 rounded-md transition-colors"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg bg-[#09090B] border border-white/[0.08] p-4 space-y-2.5 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Sender Mailbox(es)</span>
            <span className="font-mono text-zinc-200 text-right">
              {confirmation.senderEmails.join(', ')}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Sequence</span>
            <span className="text-zinc-200 text-right">{confirmation.sequenceName}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Subject Line</span>
            <span className="text-zinc-200 text-right truncate max-w-[260px]">
              {confirmation.subject}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Pacing Estimate</span>
            <span className="font-mono text-zinc-200">{confirmation.estimatedDurationLabel}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs text-zinc-400">
            Recipients ({confirmation.recipients.length})
          </div>
          <div className="max-h-36 overflow-y-auto rounded-lg bg-[#09090B] border border-white/[0.08] divide-y divide-white/[0.06]">
            {confirmation.recipients.slice(0, 25).map((r) => (
              <div key={r.email} className="px-3 py-2 flex items-center justify-between text-xs gap-3">
                <span className="text-zinc-200 truncate">{r.name} · {r.company}</span>
                <span className="font-mono text-zinc-400 shrink-0">{r.email}</span>
              </div>
            ))}
            {confirmation.recipients.length > 25 && (
              <div className="px-3 py-2 text-xs text-zinc-500">
                + {confirmation.recipients.length - 25} more recipients in queue
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isExecuting}
            className="px-4 py-2 rounded-lg border border-white/[0.12] text-xs font-medium text-zinc-300 hover:bg-white/[0.05] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isExecuting}
            className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isExecuting ? 'Dispatching...' : 'Confirm & Send via Gmail'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
