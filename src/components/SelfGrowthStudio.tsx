import { useState, type FormEvent } from 'react';
import {
  BookOpen,
  Code2,
  FlaskConical,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  Play,
  ListPlus,
  Compass,
} from 'lucide-react';
import {
  ALL_PROGRAMMING_LANGUAGES,
  canDeploySelfUpgrade,
  evaluateDailyGrowthProgression,
  evaluateDailyLearningVelocity,
  evaluateHumanUnderstandingProgress,
  evaluateInternetDominanceProgress,
} from '../lib/jerryEngine';
import { ARCHITECTURE_MODULES } from '../lib/seedData';
import { apiFetch } from '../lib/apiClient';
import type {
  DailyMoneyDiscovery,
  DailyProfitRecord,
  HumanUnderstandingInsight,
  InternetDominanceInsight,
  MemoryEntry,
  SelfUpgradeProposal,
  WalletTransaction,
} from '../lib/types';

interface SelfGrowthStudioProps {
  memories: MemoryEntry[];
  selfUpgrades: SelfUpgradeProposal[];
  dailyDiscoveries: DailyMoneyDiscovery[];
  humanInsights: HumanUnderstandingInsight[];
  internetMastery: InternetDominanceInsight[];
  transactions: WalletTransaction[];
  dailyProfitHistory: DailyProfitRecord[];
  dailyProfitThresholdUsd: number;
  onDiscoverDailyWays: (focusHint?: string) => Promise<string>;
  onExecuteLearnedDiscovery: (discoveryId: string) => Promise<string>;
  onExecuteDifferentDailyMix: () => Promise<string>;
  onQueueDiscoveryTask: (discovery: DailyMoneyDiscovery) => { ok: boolean; error?: string };
  onLearnHumanInsight: (observationHint?: string) => Promise<string>;
  onLearnInternetGrowth: (focusHint?: string) => Promise<string>;
  onAddLearnedMemory: (entry: MemoryEntry) => void;
  onAddUpgradeProposal: (proposal: SelfUpgradeProposal) => void;
  onUpdateUpgradeProposal: (id: string, updates: Partial<SelfUpgradeProposal>) => void;
}

export function SelfGrowthStudio({
  memories,
  selfUpgrades,
  dailyDiscoveries,
  humanInsights,
  internetMastery,
  transactions,
  dailyProfitHistory,
  dailyProfitThresholdUsd,
  onDiscoverDailyWays,
  onExecuteLearnedDiscovery,
  onExecuteDifferentDailyMix,
  onQueueDiscoveryTask,
  onLearnHumanInsight,
  onLearnInternetGrowth,
  onAddLearnedMemory,
  onAddUpgradeProposal,
  onUpdateUpgradeProposal,
}: SelfGrowthStudioProps) {
  // Daily Faster & Easier Money Discovery State
  const [focusHint, setFocusHint] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [executingMix, setExecutingMix] = useState(false);
  const [executingWayId, setExecutingWayId] = useState<string | null>(null);
  const [discoveryNotice, setDiscoveryNotice] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  // Human Understanding State
  const [insightHint, setInsightHint] = useState('');
  const [learningHuman, setLearningHuman] = useState(false);
  const [humanNotice, setHumanNotice] = useState<string | null>(null);

  // Internet Dominance & Distribution State
  const [internetHint, setInternetHint] = useState('');
  const [learningInternet, setLearningInternet] = useState(false);
  const [internetNotice, setInternetNotice] = useState<string | null>(null);

  // Direct Learning & Growth Prompt Box
  const [learningInput, setLearningInput] = useState('');
  const [learningCategory, setLearningCategory] = useState<MemoryEntry['category']>('lesson');
  const [teaching, setTeaching] = useState(false);
  const [teachNotice, setTeachNotice] = useState<string | null>(null);
  const [teachError, setTeachError] = useState<string | null>(null);

  // Polyglot Self-Programming Form
  const [codePrompt, setCodePrompt] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('TypeScript');
  const [customLanguage, setCustomLanguage] = useState('');
  const [targetModule, setTargetModule] = useState('Jerry Business');
  const [drafting, setDrafting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [selfProgramApprovalId, setSelfProgramApprovalId] = useState('');

  const learningVelocity = evaluateDailyLearningVelocity(dailyDiscoveries);
  const growthProgression = evaluateDailyGrowthProgression(
    transactions,
    dailyProfitHistory,
    dailyProfitThresholdUsd
  );
  const humanUnderstanding = evaluateHumanUnderstandingProgress(humanInsights, memories);
  const internetProgress = evaluateInternetDominanceProgress(internetMastery);
  const recentLearned = memories.slice(0, 4);
  const effectiveLanguage =
    selectedLanguage === '__custom__' ? customLanguage.trim() || 'Python' : selectedLanguage;

  const handleDiscoverWaysSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (discovering) return;
    setDiscovering(true);
    setDiscoveryError(null);
    setDiscoveryNotice(null);
    try {
      const msg = await onDiscoverDailyWays(focusHint);
      setDiscoveryNotice(msg);
      setFocusHint('');
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Discovery failed.');
    } finally {
      setDiscovering(false);
    }
  };

  const handleRunDifferentMix = async () => {
    if (executingMix) return;
    setExecutingMix(true);
    setDiscoveryError(null);
    try {
      const msg = await onExecuteDifferentDailyMix();
      setDiscoveryNotice(msg);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Execution failed.');
    } finally {
      setExecutingMix(false);
    }
  };

  const handleRunSingleWay = async (discoveryId: string) => {
    setExecutingWayId(discoveryId);
    setDiscoveryError(null);
    try {
      const msg = await onExecuteLearnedDiscovery(discoveryId);
      setDiscoveryNotice(msg);
    } finally {
      setExecutingWayId(null);
    }
  };

  const handleQueueWayTask = (item: DailyMoneyDiscovery) => {
    const res = onQueueDiscoveryTask(item);
    setDiscoveryNotice(
      res.ok
        ? `Queued "${item.title}" in Tasks & Recovery (unverified revenue scenario only; no income earned).`
        : (res.error ?? 'This method is already queued in Tasks & Recovery.')
    );
  };

  const handleLearnHumanSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (learningHuman) return;
    setLearningHuman(true);
    setHumanNotice(null);
    try {
      const msg = await onLearnHumanInsight(insightHint);
      setHumanNotice(msg);
      setInsightHint('');
    } catch (err) {
      setHumanNotice(err instanceof Error ? err.message : 'Unable to record insight.');
    } finally {
      setLearningHuman(false);
    }
  };

  const handleLearnInternetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (learningInternet) return;
    setLearningInternet(true);
    setInternetNotice(null);
    try {
      const msg = await onLearnInternetGrowth(internetHint);
      setInternetNotice(msg);
      setInternetHint('');
    } catch (err) {
      setInternetNotice(err instanceof Error ? err.message : 'Unable to learn Internet growth playbook.');
    } finally {
      setLearningInternet(false);
    }
  };

  const handleTeachSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!learningInput.trim() || teaching) return;
    setTeaching(true);
    setTeachError(null);
    setTeachNotice(null);

    try {
      const response = await apiFetch('/api/jerry/teach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          information: learningInput.trim(),
          category: learningCategory,
        }),
      });
      const data = (await response.json()) as {
        entry?: MemoryEntry;
        summary?: string;
        error?: string;
      };
      if (!response.ok || !data.entry) {
        throw new Error(data.error || 'Failed to add learning entry.');
      }
      onAddLearnedMemory(data.entry);
      setTeachNotice(data.summary ?? 'Added to Jerry persistent learning and memory.');
      setLearningInput('');
    } catch (err) {
      setTeachError(err instanceof Error ? err.message : 'Unable to save learning directive.');
    } finally {
      setTeaching(false);
    }
  };

  const handleDraftUpgrade = async (e: FormEvent) => {
    e.preventDefault();
    if (!codePrompt.trim() || drafting) return;
    setDrafting(true);
    setCodeError(null);

    try {
      const response = await apiFetch('/api/jerry/self-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: codePrompt.trim(),
          language: effectiveLanguage,
          targetModule,
          approvalId: selfProgramApprovalId.trim(),
        }),
      });
      const data = (await response.json()) as {
        proposal?: SelfUpgradeProposal;
        error?: string;
      };
      if (!response.ok || !data.proposal) {
        throw new Error(data.error || 'Self-programming request failed.');
      }
      onAddUpgradeProposal(data.proposal);
      setCodePrompt('');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Unable to draft self-upgrade.');
    } finally {
      setDrafting(false);
    }
  };

  const handleVerifyProposal = async (proposal: SelfUpgradeProposal) => {
    setVerifyingId(proposal.id);
    try {
      const response = await apiFetch('/api/jerry/verify-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: proposal.code,
          testCode: proposal.testCode,
          language: proposal.language,
        }),
      });
      const data = (await response.json()) as {
        securityAuditPassed: boolean;
        securityAuditNotes: string;
        testStatus: 'passed' | 'failed';
        testReport: string;
      };
      onUpdateUpgradeProposal(proposal.id, {
        securityAuditPassed: data.securityAuditPassed,
        securityAuditNotes: data.securityAuditNotes,
        testStatus: data.testStatus,
        testReport: data.testReport,
      });
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Daily Money Discovery & Varied Execution Lab */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Daily Growth &amp; Learning Lab — Beat Yesterday Every Day
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Jerry constantly learns from outcomes, deepens domain understanding, discovers higher-yield ways without touching investment capital, and executes a different mix daily to earn more than the previous day.
            </p>
          </div>
          <button
            type="button"
            disabled={executingMix || dailyDiscoveries.length === 0}
            onClick={() => void handleRunDifferentMix()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {executingMix ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Executing Learned Mix...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Execute Different Ways Today
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">Previous Day Profit ({growthProgression.previousDayDate})</p>
            <p className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
              ${growthProgression.previousDayProfitUsd.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Today&apos;s Profit vs Yesterday</p>
            <p className={`text-xl font-semibold font-mono tabular-nums mt-0.5 ${growthProgression.beatPreviousDay ? 'text-emerald-700' : 'text-blue-700'}`}>
              ${growthProgression.todayProfitUsd.toLocaleString()}
              <span className="text-xs font-medium ml-1.5">
                {growthProgression.beatPreviousDay
                  ? `(+${growthProgression.deltaVsPreviousDayPct}%)`
                  : `(Target $${growthProgression.targetToBeatPreviousDayUsd.toLocaleString()})`}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Ways Learned · Hours Saved</p>
            <p className="text-xl font-semibold text-slate-900 font-mono tabular-nums mt-0.5">
              {learningVelocity.totalLearned} ways · {learningVelocity.hoursSavedPerWeek}h/wk
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Understanding · Growth Streak</p>
            <p className="text-xl font-semibold text-emerald-700 font-mono tabular-nums mt-0.5">
              {memories.length} lessons · {growthProgression.growthStreakDays}d streak
            </p>
          </div>
        </div>

        {/* Multi-Day Compounding Progression Strip */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {growthProgression.dailyTrend.map((point) => (
              <div
                key={point.date}
                className={`px-2.5 py-1 rounded border ${
                  point.isToday
                    ? 'bg-white border-blue-300 text-slate-900 font-semibold'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <span className="font-mono tabular-nums">{point.isToday ? 'Today' : point.date.slice(5)}</span>:{' '}
                <span className={`font-mono tabular-nums ${point.isToday && growthProgression.beatPreviousDay ? 'text-emerald-700' : 'text-slate-900'}`}>
                  ${point.profitUsd.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <span className="font-mono tabular-nums font-medium text-slate-700">
            Next Day Escalation Floor: ${growthProgression.nextDayMinimumToBeatTodayUsd.toLocaleString()}/day
          </span>
        </div>

        <form onSubmit={handleDiscoverWaysSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            id="daily-discovery-focus"
            type="text"
            aria-label="Focus area for discovering faster ways to make money"
            value={focusHint}
            onChange={(e) => setFocusHint(e.target.value)}
            placeholder="Optional focus (e.g., automated SaaS templates, B2B data feeds, recurring upsells)..."
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={discovering}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {discovering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Discovering Faster Ways...
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5" />
                Discover New Ways Today
              </>
            )}
          </button>
        </form>

        {discoveryNotice && <p className="text-xs font-medium text-emerald-700">{discoveryNotice}</p>}
        {discoveryError && <p className="text-xs font-medium text-rose-700">{discoveryError}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {dailyDiscoveries.map((item) => {
            const isRunning = executingWayId === item.id;
            return (
              <div
                key={item.id}
                className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-blue-700">{item.methodCategory}</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      Hypothetical scenario: ${item.estimatedDailyProfitUsd}/day
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900">{item.title}</h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-800">Why easier &amp; faster:</span>{' '}
                    {item.whyEasierAndFaster}
                  </p>
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">Shortcut:</span>{' '}
                    {item.executionShortcut}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-500 pt-1">
                    <span>{item.estimatedHoursSavedPerWeek} hrs/wk saved</span>
                    <span>${item.startupCapitalUsd} capital</span>
                    {(item.executionCount ?? 0) > 0 && (
                      <span className="text-emerald-700 font-medium">
                        Ran {item.executionCount}x · ${(item.totalEarnedUsd ?? 0).toLocaleString()} saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => void handleRunSingleWay(item.id)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Execute Way (+${item.estimatedDailyProfitUsd})
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQueueWayTask(item)}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md whitespace-nowrap cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    Queue Task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Human Understanding & Daily Cognitive Growth */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Human Understanding &amp; Empathy — Better Each Day Than Yesterday
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jerry studies buyer psychology, communication clarity, trust signals, and your executive style daily so every interaction and offer resonates better than the previous day.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
            <span className="text-slate-500">Yesterday: {humanUnderstanding.previousDayScore}%</span>
            <span className="font-semibold text-emerald-700">
              Today: {humanUnderstanding.todayScore}% (+{humanUnderstanding.improvementDeltaPts} pts)
            </span>
          </div>
        </div>

        <form onSubmit={handleLearnHumanSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            id="human-insight-hint"
            type="text"
            aria-label="Human behavior or client feedback to synthesize"
            value={insightHint}
            onChange={(e) => setInsightHint(e.target.value)}
            placeholder="Optional observation (e.g., prospects respond faster when given a 2-week guarantee before pricing)..."
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={learningHuman}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {learningHuman ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Learning Human Pattern...
              </>
            ) : (
              'Deepen Human Understanding Today'
            )}
          </button>
        </form>

        {humanNotice && <p className="text-xs font-medium text-emerald-700">{humanNotice}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {humanInsights.slice(0, 6).map((insight) => (
            <div key={insight.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-700">{insight.domain}</span>
                <span className="font-mono tabular-nums text-emerald-700 font-medium">
                  +{insight.clarityScoreGain} pts · {insight.learnedDate}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{insight.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{insight.observation}</p>
              <p className="text-xs text-slate-700 pt-1 border-t border-slate-200">
                <span className="font-medium text-slate-900">Applied:</span> {insight.practicalApplication}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Internet Authority & Distribution Mastery */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Internet Authority &amp; Distribution Mastery — Better Each Day Than Yesterday
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jerry studies search distribution, viral product loops, developer ecosystems, and conversion mechanics each day to command compounding web reach and authority.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
            <span className="text-slate-500">Yesterday: {internetProgress.previousDayAuthorityScore}%</span>
            <span className="font-semibold text-emerald-700">
              Today: {internetProgress.todayAuthorityScore}% (+{internetProgress.improvementDeltaPts} pts)
            </span>
          </div>
        </div>

        <form onSubmit={handleLearnInternetSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            id="internet-growth-hint"
            type="text"
            aria-label="Focus area for Internet growth and distribution mastery"
            value={internetHint}
            onChange={(e) => setInternetHint(e.target.value)}
            placeholder="Optional focus (e.g., programmatic SEO hubs, API developer onboarding, viral referral loops)..."
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={learningInternet}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {learningInternet ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Mastering Internet Reach...
              </>
            ) : (
              'Learn Internet Growth Playbook Today'
            )}
          </button>
        </form>

        {internetNotice && <p className="text-xs font-medium text-emerald-700">{internetNotice}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
          {internetMastery.slice(0, 6).map((item) => (
            <div key={item.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-700">{item.pillar}</span>
                <span className="font-mono tabular-nums text-emerald-700 font-medium">
                  +{item.authorityGainPts} pts · {item.learnedDate}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{item.tactic}</p>
              <p className="text-xs text-slate-700 pt-1 border-t border-slate-200">
                <span className="font-medium text-slate-900">Impact:</span> {item.expectedImpact}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Direct Learning & Growth Prompt Box */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Teach &amp; Grow Jerry — Direct Learning Prompt Box
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Key in business rules, domain knowledge, client insights, or operational lessons to expand Jerry&rsquo;s persistent memory and judgment.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {memories.length} learned records stored
          </span>
        </div>

        <form onSubmit={handleTeachSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
            <div className="md:col-span-9">
              <label htmlFor="teach-jerry-prompt" className="block text-xs font-medium text-slate-700 mb-1">
                Information to Add to Jerry&rsquo;s Learning
              </label>
              <textarea
                id="teach-jerry-prompt"
                rows={3}
                required
                value={learningInput}
                onChange={(e) => setLearningInput(e.target.value)}
                placeholder="Key in facts, pricing rules, technical patterns, or lessons learned (e.g., Always prioritize recurring B2B SaaS retainers over one-off builds, or use verified Bitcoin settlements)..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="md:col-span-3 space-y-3">
              <div>
                <label htmlFor="teach-category-select" className="block text-xs font-medium text-slate-700 mb-1">
                  Knowledge Type
                </label>
                <select
                  id="teach-category-select"
                  value={learningCategory}
                  onChange={(e) => setLearningCategory(e.target.value as MemoryEntry['category'])}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
                >
                  <option value="lesson">Lesson Learned</option>
                  <option value="decision">Strategic Rule</option>
                  <option value="workflow">Operational Workflow</option>
                  <option value="preference">Owner Preference</option>
                  <option value="goal">Growth Objective</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={teaching || !learningInput.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {teaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                Teach &amp; Grow Jerry
              </button>
            </div>
          </div>
        </form>

        {teachNotice && (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
            {teachNotice}
          </p>
        )}
        {teachError && (
          <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
            {teachError}
          </p>
        )}

        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-2">Recently Integrated Learning</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recentLearned.map((item) => (
              <div key={item.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-xs font-medium text-blue-700 capitalize">
                  {item.category} · <span className="font-mono tabular-nums text-slate-500">{item.createdAt.slice(0, 10)}</span>
                </p>
                <p className="text-xs font-semibold text-slate-900 mt-0.5">{item.title}</p>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{item.content}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Permission-Gated Polyglot Self-Programming Engine */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Self-Programming Studio (All Programming Languages)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Jerry writes and tests capability upgrades across any programming language. Security policies cannot be altered, and deployment requires verified tests plus your explicit permission.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
            {ALL_PROGRAMMING_LANGUAGES.length}+ Languages Supported
          </span>
        </div>

        <form onSubmit={handleDraftUpgrade} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label htmlFor="self-program-prompt" className="block text-xs font-medium text-slate-700 mb-1">
              Capability or Code Upgrade to Program
            </label>
            <input
              id="self-program-prompt"
              type="text"
              required
              value={codePrompt}
              onChange={(e) => setCodePrompt(e.target.value)}
              placeholder="e.g., Write a Rust risk-adjusted position sizer for treasury alerts"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-3">
            <label htmlFor="self-program-language" className="block text-xs font-medium text-slate-700 mb-1">
              Programming Language
            </label>
            <select
              id="self-program-language"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {ALL_PROGRAMMING_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
              <option value="__custom__">Other / Custom Language...</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="self-program-module" className="block text-xs font-medium text-slate-700 mb-1">
              Target Module
            </label>
            <select
              id="self-program-module"
              value={targetModule}
              onChange={(e) => setTargetModule(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              {ARCHITECTURE_MODULES.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <label htmlFor="self-program-approval" className="block text-xs font-medium text-slate-700 mb-1">
              Approved High-Impact Change ID
            </label>
            <input
              id="self-program-approval"
              type="text"
              required
              value={selfProgramApprovalId}
              onChange={(e) => setSelfProgramApprovalId(e.target.value)}
              placeholder="Approve in Security → Approvals, then paste the ID"
              className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={drafting || !codePrompt.trim() || !selfProgramApprovalId.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
              Draft Upgrade
            </button>
          </div>

          {selectedLanguage === '__custom__' && (
            <div className="md:col-span-4">
              <label htmlFor="custom-language-input" className="block text-xs font-medium text-slate-700 mb-1">
                Specify Any Programming Language
              </label>
              <input
                id="custom-language-input"
                type="text"
                value={customLanguage}
                onChange={(e) => setCustomLanguage(e.target.value)}
                placeholder="e.g., Zig, Julia, Clojure, Erlang, Assembly..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}
        </form>

        {codeError && (
          <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5">
            {codeError}
          </p>
        )}

        {/* Self-Upgrade Proposals Queue */}
        <div className="space-y-4 pt-2">
          {selfUpgrades.map((proposal) => {
            const deployCheck = canDeploySelfUpgrade(proposal);
            const isVerifying = verifyingId === proposal.id;
            return (
              <article
                key={proposal.id}
                className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-blue-700">{proposal.language}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{proposal.targetModule}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="capitalize">{proposal.approvalStatus.replace('_', ' ')}</span>
                    </p>
                    <h3 className="text-base font-semibold text-slate-900 mt-0.5">{proposal.title}</h3>
                    <p className="text-xs text-slate-600 mt-1">{proposal.summary}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {proposal.approvalStatus === 'awaiting_permission' && (
                      <>
                        <button
                          type="button"
                          disabled={isVerifying}
                          onClick={() => void handleVerifyProposal(proposal)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isVerifying ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <FlaskConical className="w-3.5 h-3.5" />
                          )}
                          Run Verification Tests
                        </button>
                        <button
                          type="button"
                          disabled={!deployCheck.allowed}
                          onClick={() =>
                            onUpdateUpgradeProposal(proposal.id, {
                              approvalStatus: 'approved_deployed',
                              deployedAt: new Date().toISOString(),
                            })
                          }
                          title={deployCheck.reason}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Grant Permission &amp; Deploy
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateUpgradeProposal(proposal.id, {
                              approvalStatus: 'rejected',
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </>
                    )}
                    {proposal.approvalStatus === 'approved_deployed' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        Deployed with Owner Permission
                      </span>
                    )}
                  </div>
                </div>

                {/* Code & Tests Inspection */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">Generated {proposal.language} Implementation</p>
                    <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
                      <code>{proposal.code}</code>
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-700">Verification Test Suite</p>
                    <pre className="p-3.5 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
                      <code>{proposal.testCode}</code>
                    </pre>
                  </div>
                </div>

                {/* Security Policy & Test Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 font-medium ${
                      proposal.securityAuditPassed ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {proposal.securityAuditPassed ? (
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                    )}
                    {proposal.securityAuditNotes}
                  </span>
                  <span
                    className={`font-medium ${
                      proposal.testStatus === 'passed'
                        ? 'text-emerald-700'
                        : proposal.testStatus === 'failed'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                    }`}
                  >
                    Tests ({proposal.testStatus}): {proposal.testReport}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
