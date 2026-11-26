import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Search, Plus, Upload, ShieldAlert, RotateCcw } from 'lucide-react';
import { filterMemories } from '../lib/jerryEngine';
import { apiFetch } from '../lib/apiClient';
import { memoryAreaForCategory } from '../lib/learningMemory';
import { ARCHITECTURE_MODULES, DEVELOPMENT_ROADMAP } from '../lib/seedData';
import type { JerryMemoryArea, MemoryEntry, OwnerProfile, PhoneIntegrationItem } from '../lib/types';
import { OwnerAvatar } from './OwnerAvatar';

interface MemoryAndSystemProps {
  owner: OwnerProfile;
  memories: MemoryEntry[];
  phoneIntegrations: PhoneIntegrationItem[];
  onAddMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => void;
  onUpdateOwner: (updates: Partial<OwnerProfile>) => void;
  onTogglePhoneIntegration: (id: string) => void;
  onResetDemoState: (approvalId: string) => Promise<void>;
}

export function MemoryAndSystem({
  owner,
  memories,
  phoneIntegrations,
  onAddMemory,
  onUpdateOwner,
  onTogglePhoneIntegration,
  onResetDemoState,
}: MemoryAndSystemProps) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [memoryAreaFilter, setMemoryAreaFilter] = useState<'all' | JerryMemoryArea>('all');
  const [persistentSearchResults, setPersistentSearchResults] = useState<MemoryEntry[] | null>(null);
  const [memorySearchStatus, setMemorySearchStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [memTitle, setMemTitle] = useState('');
  const [memContent, setMemContent] = useState('');
  const [memCategory, setMemCategory] = useState<MemoryEntry['category']>('lesson');
  const [memTags, setMemTags] = useState('operations, strategy');

  const [ownerNameInput, setOwnerNameInput] = useState(owner.name);
  const [thresholdInput, setThresholdInput] = useState(String(owner.autonomyThresholdUsd));
  const [dailyProfitInput, setDailyProfitInput] = useState(
    String(owner.dailyProfitThresholdUsd ?? 1000)
  );
  const [weeklyProfitInput, setWeeklyProfitInput] = useState(
    String(owner.weeklyProfitMinimumUsd ?? 5000)
  );
  const [monthlyProfitInput, setMonthlyProfitInput] = useState(
    String(owner.monthlyProfitMinimumUsd ?? 20000)
  );
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [resetApprovalId, setResetApprovalId] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (memoryAreaFilter !== 'all') params.set('area', memoryAreaFilter);
      params.set('limit', '100');
      setMemorySearchStatus('loading');
      apiFetch(`/api/memory?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { entries?: MemoryEntry[] };
          if (!response.ok || !Array.isArray(payload.entries)) throw new Error('Persistent memory search is unavailable.');
          if (active) {
            setPersistentSearchResults(payload.entries);
            setMemorySearchStatus('ready');
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted) {
            setPersistentSearchResults(null);
            setMemorySearchStatus('unavailable');
          }
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, categoryFilter, memoryAreaFilter]);

  const visibleMemories = persistentSearchResults ?? filterMemories(memories, query, categoryFilter).filter((entry) =>
    memoryAreaFilter === 'all' || (entry.area ?? memoryAreaForCategory(entry.category)) === memoryAreaFilter,
  );

  const handleSaveMemory = (e: FormEvent) => {
    e.preventDefault();
    if (!memTitle.trim() || !memContent.trim()) return;
    onAddMemory({
      category: memCategory,
      area: memoryAreaForCategory(memCategory),
      title: memTitle.trim(),
      content: memContent.trim(),
      outcome: memCategory === 'lesson' ? 'insight' : 'success',
      tags: memTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setMemTitle('');
    setMemContent('');
  };

  const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateOwner({ avatarUrl: reader.result });
        setIdentityMessage('Owner photograph updated across Jerry Visual Identity.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveIdentity = (e: FormEvent) => {
    e.preventDefault();
    onUpdateOwner({
      name: ownerNameInput.trim() || owner.name,
      autonomyThresholdUsd: Math.max(0, Number(thresholdInput) || 250),
      dailyProfitThresholdUsd: Math.max(1, Number(dailyProfitInput) || 1000),
      weeklyProfitMinimumUsd: Math.max(1, Number(weeklyProfitInput) || 5000),
      monthlyProfitMinimumUsd: Math.max(1, Number(monthlyProfitInput) || 20000),
    });
    setIdentityMessage('Owner preferences, autonomy cap, and profit minimums saved.');
  };

  return (
    <div className="space-y-6">
      {/* Persistent Memory & Continuous Learning */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              Jerry Memory &amp; Continuous Learning Engine
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Searchable persistent knowledge base storing goals, decisions, lessons learned, and workflow preferences across sessions.
            </p>
          </div>

          <p className="text-xs text-slate-500" role="status">
            {memorySearchStatus === 'loading'
              ? 'Searching Jerry’s owner-scoped persistent memory…'
              : memorySearchStatus === 'ready'
                ? 'Showing database-backed memory results.'
                : 'Persistent search is unavailable; showing locally available workspace memories.'}
          </p>

          <div className="flex flex-wrap gap-2" aria-label="Persistent memory areas">
            {([
              ['all', 'All memory'],
              ['owner_profile', 'Owner Profile'],
              ['mission_projects', 'Mission & Projects'],
              ['knowledge_experience', 'Knowledge & Experience'],
            ] as const).map(([area, label]) => (
              <button
                key={area}
                type="button"
                onClick={() => setMemoryAreaFilter(area)}
                aria-pressed={memoryAreaFilter === area}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer ${
                  memoryAreaFilter === area
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search Jerry Memory"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search decisions, lessons, workflows, or tags..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {['all', 'goal', 'decision', 'lesson', 'preference', 'workflow'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 text-xs font-medium capitalize rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {visibleMemories.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">No matching memory entries</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategoryFilter('all');
                  setMemoryAreaFilter('all');
                }}
                className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
              >
                Clear search and filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {visibleMemories.map((entry) => (
                <div key={entry.id} className="py-3.5 first:pt-1 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="capitalize font-medium text-blue-700">
                      {entry.area ?? memoryAreaForCategory(entry.category)} · {entry.category}
                      {entry.tags.length > 0 ? ` · ${entry.tags.join(' · ')}` : ''}
                    </span>
                    <span className="font-mono tabular-nums">{entry.createdAt.slice(0, 10)}</span>
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900">{entry.title}</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">{entry.content}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add Memory / Lesson Learned */}
          <form onSubmit={handleSaveMemory} className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Record Lesson Learned or Decision</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                aria-label="Memory title"
                value={memTitle}
                onChange={(e) => setMemTitle(e.target.value)}
                placeholder="Lesson or decision title"
                className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <select
                aria-label="Memory category"
                value={memCategory}
                onChange={(e) => setMemCategory(e.target.value as MemoryEntry['category'])}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="lesson">Lesson</option>
                <option value="decision">Decision</option>
                <option value="goal">Goal</option>
                <option value="preference">Preference</option>
                <option value="workflow">Workflow</option>
              </select>
            </div>
            <textarea
              rows={2}
              required
              aria-label="Memory details"
              value={memContent}
              onChange={(e) => setMemContent(e.target.value)}
              placeholder="What happened, what worked, and how Jerry should apply this next time..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                type="text"
                aria-label="Memory tags"
                value={memTags}
                onChange={(e) => setMemTags(e.target.value)}
                placeholder="Comma-separated tags"
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Commit to Memory
              </button>
            </div>
          </form>
        </section>

        {/* Owner Visual Identity & Governance */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Visual Identity &amp; Owner Control
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jerry uses your real photograph rather than a generic mascot, connecting the assistant directly to its owner.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <OwnerAvatar src={owner.avatarUrl} name={owner.name} size="xl" />
            <div className="space-y-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload Real Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="sr-only"
                />
              </label>
              <p className="text-xs text-slate-500">Applied across Header, Brain &amp; Profile</p>
            </div>
          </div>

          <form onSubmit={handleSaveIdentity} className="space-y-3 pt-2 border-t border-slate-200">
            <div>
              <label htmlFor="owner-name-input" className="block text-xs font-medium text-slate-700 mb-1">
                Owner Display Name
              </label>
              <input
                id="owner-name-input"
                type="text"
                value={ownerNameInput}
                onChange={(e) => setOwnerNameInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="owner-threshold-input" className="block text-xs font-medium text-slate-700 mb-1">
                Autonomous Financial Gate (USD)
              </label>
              <input
                id="owner-threshold-input"
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="owner-monthly-profit-input" className="block text-xs font-medium text-slate-700 mb-1">
                Top Priority Monthly Profit Minimum (USD/mo)
              </label>
              <input
                id="owner-monthly-profit-input"
                type="number"
                min="1"
                value={monthlyProfitInput}
                onChange={(e) => setMonthlyProfitInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="owner-weekly-profit-input" className="block text-xs font-medium text-slate-700 mb-1">
                Top Priority Weekly Profit Minimum (USD/wk)
              </label>
              <input
                id="owner-weekly-profit-input"
                type="number"
                min="1"
                value={weeklyProfitInput}
                onChange={(e) => setWeeklyProfitInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="owner-daily-profit-input" className="block text-xs font-medium text-slate-700 mb-1">
                Daily Portfolio Profit Goal (USD/day)
              </label>
              <input
                id="owner-daily-profit-input"
                type="number"
                min="1"
                value={dailyProfitInput}
                onChange={(e) => setDailyProfitInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              Save Identity &amp; Thresholds
            </button>
          </form>

          {identityMessage && <p className="text-xs text-emerald-700">{identityMessage}</p>}

          <div className="pt-4 border-t border-slate-200 space-y-2">
            <label htmlFor="reset-approval-id" className="block text-[11px] font-medium text-slate-600">Approved high-impact change ID</label>
            <input
              id="reset-approval-id"
              type="text"
              value={resetApprovalId}
              onChange={(e) => setResetApprovalId(e.target.value)}
              placeholder="Approve in Security → Approvals, then paste the ID"
              className="w-full max-w-xl px-3 py-2 text-xs border border-amber-300 rounded-lg font-mono"
            />
            <button
              type="button"
              disabled={!resetApprovalId.trim()}
              onClick={() => void onResetDemoState(resetApprovalId.trim())}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore Blueprint Seed State
            </button>
          </div>
        </section>
      </div>

      {/* Android Phone Integration Permissions */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Jerry Phone Integration &amp; Access Controls
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Standard Android capabilities and explicitly authorized advanced access with clear security and warranty disclosures.
          </p>
        </div>

        <div className="divide-y divide-slate-200">
          {phoneIntegrations.map((item) => (
            <div key={item.id} className="py-4 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-900 text-sm">{item.area}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      item.accessTier === 'Advanced Access' ? 'text-amber-700 font-medium' : 'text-slate-500'
                    }
                  >
                    {item.accessTier}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{item.capabilities}</p>
                <p className="text-xs text-slate-500 inline-flex items-start gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span>{item.securityImplication}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => onTogglePhoneIntegration(item.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  item.enabled
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {item.enabled ? 'Authorized' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 13-Component Modular Architecture & 12-Stage Roadmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Modular Technical Architecture (13 Components)
          </h2>
          <div className="divide-y divide-slate-200 text-xs">
            {ARCHITECTURE_MODULES.map((mod) => (
              <div key={mod.name} className="py-2.5 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{mod.name}</p>
                  <p className="text-slate-600 mt-0.5">{mod.responsibility}</p>
                </div>
                <span className="font-mono text-slate-500 whitespace-nowrap shrink-0">{mod.stage}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Incremental Development Roadmap (12 Stages)
          </h2>
          <div className="divide-y divide-slate-200 text-xs">
            {DEVELOPMENT_ROADMAP.map((item) => (
              <div key={item.stage} className="py-2.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-slate-500 w-6">
                    {String(item.stage).padStart(2, '0')}.
                  </span>
                  <span className="text-slate-800 font-medium">{item.deliverable}</span>
                </div>
                <span
                  className={`font-medium whitespace-nowrap shrink-0 ${
                    item.status === 'Active'
                      ? 'text-emerald-700'
                      : item.status === 'Configured'
                        ? 'text-blue-700'
                        : 'text-slate-500'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
