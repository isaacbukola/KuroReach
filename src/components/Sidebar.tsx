import React from 'react';
import {
  Activity,
  BookOpen,
  Bot,
  Chrome,
  LayoutGrid,
  Mail,
  Send,
  Sparkles,
} from 'lucide-react';
import type { GmailAccountSlot, WorkspaceTab } from '../types';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  slots: GmailAccountSlot[];
  leadCount: number;
  sentCount: number;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Command Overview', icon: LayoutGrid },
  { id: 'scraper', label: 'AI Lead Scraper', icon: Bot },
  { id: 'sequences', label: 'Sequence Studio', icon: Sparkles },
  { id: 'campaigns', label: 'Tracking & Send', icon: Send },
  { id: 'accounts', label: 'Mailboxes & DNS', icon: Mail },
  { id: 'extension', label: 'Chrome Extension', icon: Chrome },
  { id: 'guide', label: 'Email Guide', icon: BookOpen },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  slots,
  leadCount,
  sentCount,
}) => {
  const connectedSlots = slots.filter((s) => s.connected);
  const totalDailyCapacity = connectedSlots.reduce((acc, s) => acc + s.dailyLimit, 0);
  const totalSentToday = connectedSlots.reduce((acc, s) => acc + s.sentToday, 0);

  return (
    <aside className="w-64 shrink-0 border-r border-white/[0.08] bg-[#0B0B0E] flex flex-col justify-between min-h-screen select-none">
      <div>
        <div className="h-16 px-5 flex items-center gap-3 border-b border-white/[0.08]">
          <BrandMark size={30} />
          <span className="font-display text-base font-semibold tracking-tight text-white whitespace-nowrap">
            KuroReach
          </span>
        </div>

        <nav className="p-3 space-y-1" aria-label="Primary Workspace Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white ${
                  active
                    ? 'bg-white text-[#09090B] font-medium'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'scraper' && leadCount > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-[#09090B]/70' : 'text-zinc-500'
                    }`}
                  >
                    {leadCount}
                  </span>
                )}
                {item.id === 'campaigns' && sentCount > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-[#09090B]/70' : 'text-zinc-500'
                    }`}
                  >
                    {sentCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-zinc-300" />
            <span>Sending Pool</span>
          </span>
          <span className="font-mono text-zinc-200 tabular-nums">
            {connectedSlots.length}/3 Slots
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-zinc-500">Daily Throughput</span>
            <span className="font-mono text-zinc-200 tabular-nums">
              {totalSentToday.toLocaleString()} / {Math.max(totalDailyCapacity, 2000).toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  Math.round((totalSentToday / Math.max(totalDailyCapacity, 2000)) * 100)
                )}%`,
              }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('accounts')}
          className="w-full py-2 px-3 rounded-lg border border-white/[0.1] text-xs font-medium text-zinc-200 hover:bg-white/[0.05] transition-colors whitespace-nowrap"
        >
          Manage Gmail Slots
        </button>
      </div>
    </aside>
  );
};
