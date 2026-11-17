import React from 'react';
import { Bell, ChevronRight, Download, PauseCircle, Plus } from 'lucide-react';
import type { GmailAccountSlot, WorkspaceTab } from '../types';

interface TopBarProps {
  activeTab: WorkspaceTab;
  slots: GmailAccountSlot[];
  activeSlotIndex: 0 | 1 | 2;
  unreadAlertCount: number;
  onSwitchSlot: (slotIndex: 0 | 1 | 2) => void;
  onConnectSlotRedirect: () => void;
  onReviewAlerts: () => void;
  onDownloadExtension: () => void;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  overview: 'Command Overview',
  scraper: 'AI Lead Scraper',
  sequences: 'Sequence Studio',
  campaigns: 'Tracking & Send',
  accounts: 'Mailboxes & DNS',
  extension: 'Chrome Extension',
  guide: 'Email Guide',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  slots,
  activeSlotIndex,
  unreadAlertCount,
  onSwitchSlot,
  onConnectSlotRedirect,
  onReviewAlerts,
  onDownloadExtension,
}) => {
  return (
    <header className="h-16 px-6 border-b border-white/[0.08] bg-[#09090B] flex items-center justify-between gap-6 shrink-0">
      {/* Zone 1: Breadcrumb context */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-zinc-500 whitespace-nowrap shrink-0">Workspace</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        <h1 className="font-display font-semibold text-white truncate">
          {TAB_TITLES[activeTab]}
        </h1>
      </div>

      {/* Zone 2: Seamless 3-Account Gmail Switcher */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg bg-[#121317] border border-white/[0.08] shrink-0"
        role="group"
        aria-label="Gmail Sender Switcher"
      >
        {slots.map((slot) => {
          const isActive = slot.slotIndex === activeSlotIndex;
          if (!slot.connected && !slot.email) {
            return (
              <button
                key={slot.slotIndex}
                type="button"
                onClick={onConnectSlotRedirect}
                className="px-2.5 py-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                title={`Connect Gmail Slot ${slot.slotIndex + 1}`}
              >
                <Plus className="w-3 h-3" />
                <span>Slot {slot.slotIndex + 1}</span>
              </button>
            );
          }

          return (
            <button
              key={slot.slotIndex}
              type="button"
              onClick={() => onSwitchSlot(slot.slotIndex)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${
                slot.paused
                  ? isActive
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-medium'
                    : 'text-amber-300/90 hover:bg-amber-500/10'
                  : isActive
                  ? 'bg-white text-[#09090B] font-medium'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
              }`}
              title={
                slot.paused && slot.pauseReason
                  ? `Paused: ${slot.pauseReason}`
                  : slot.email ?? `Slot ${slot.slotIndex + 1}`
              }
            >
              {slot.paused && <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
              <span className="max-w-[140px] truncate font-mono">{slot.email}</span>
              <span
                className={`font-mono tabular-nums text-[11px] ${
                  slot.paused
                    ? 'text-amber-300'
                    : isActive
                    ? 'text-[#09090B]/70'
                    : 'text-zinc-500'
                }`}
              >
                {slot.paused
                  ? 'Paused'
                  : slot.needsReconnect
                  ? 'Reauth'
                  : `${slot.sentToday}/${slot.dailyLimit}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Zone 3: Guardrail Alerts & Extension Download */}
      <div className="flex items-center gap-2.5 shrink-0">
        {unreadAlertCount > 0 && (
          <button
            type="button"
            onClick={onReviewAlerts}
            className="px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/15 text-red-200 text-xs font-medium hover:bg-red-500/25 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Review Google Spam & Auto-Pause Notifications"
          >
            <Bell className="w-3.5 h-3.5 text-red-300" />
            <span className="font-mono">{unreadAlertCount} Alert{unreadAlertCount > 1 ? 's' : ''}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onDownloadExtension}
          className="px-4 py-2 rounded-lg bg-white text-[#09090B] text-xs font-semibold hover:bg-zinc-200 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Get Chrome Extension</span>
        </button>
      </div>
    </header>
  );
};
