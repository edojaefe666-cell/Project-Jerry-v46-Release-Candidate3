import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Brain,
  Target,
  ListChecks,
  Briefcase,
  Wallet,
  Mic,
  Database,
  Code2,
  ShieldCheck,
  Menu,
  X,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  calculateUnifiedPortfolio,
  createAutonomousTask,
  evaluateDailyGrowthProgression,
  executeLearnedDiscovery,
  executeRevenueTask,
  mergeUniqueDailyDiscoveries,
  pickRotatingDailyWays,
  recoverInterruptedTasks,
  toggleExecutionStep,
} from './lib/jerryEngine';
import { normalizeJerryWalletState, SUPPORTED_CRYPTO_ASSET, SUPPORTED_CRYPTO_NETWORK } from './lib/walletPolicy';
import { INITIAL_JERRY_STATE } from './lib/seedData';
import { useAuth } from './lib/AuthContext';
import type {
  AutonomousTask,
  BusinessOpportunity,
  BusinessVenture,
  ChatMessage,
  CycleStageId,
  DailyMoneyDiscovery,
  DailySummaryReport,
  ExternalWalletConnection,
  Goal,
  HumanUnderstandingInsight,
  IncomeStream,
  InternetDominanceInsight,
  JerryState,
  MemoryEntry,
  OpportunityAlert,
  OwnerProfile,
  SelfUpgradeProposal,
  TaskExecutionStatus,
  VisionAnalysisRecord,
  WalletAsset,
  WalletTransaction,
  WorkspaceTab,
} from './lib/types';
import { OwnerAvatar } from './components/OwnerAvatar';
import { SecurityApprovals } from './components/SecurityApprovals';
import { apiFetch, checkBackendReadiness } from './lib/apiClient';
import { OverviewHub } from './components/OverviewHub';
import { BrainConsole } from './components/BrainConsole';
import { GoalsPlanner } from './components/GoalsPlanner';
import { TasksRecovery } from './components/TasksRecovery';
import { BusinessLab } from './components/BusinessLab';
import { WalletDashboard } from './components/WalletDashboard';
import { VoiceVisionStudio } from './components/VoiceVisionStudio';
import { SelfGrowthStudio } from './components/SelfGrowthStudio';
import { MemoryAndSystem } from './components/MemoryAndSystem';

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Command Hub', icon: LayoutDashboard },
  { id: 'brain', label: 'Jerry Brain', icon: Brain },
  { id: 'goals', label: 'Goals & 8-Level Plans', icon: Target },
  { id: 'tasks', label: 'Tasks & Recovery', icon: ListChecks },
  { id: 'business', label: 'Jerry Business', icon: Briefcase },
  { id: 'wallet', label: 'Jerry Wallet', icon: Wallet },
  { id: 'voice_vision', label: 'Voice & Vision', icon: Mic },
  { id: 'self_growth', label: 'Self-Growth & Code', icon: Code2 },
  { id: 'memory', label: 'Memory & System', icon: Database },
  { id: 'approvals', label: 'Approval Center', icon: ShieldCheck },
];

export default function App() {
  const { user, idToken, loading: authLoading, authError, signInWithGoogle, signOutUser } = useAuth();
  const [state, setState] = useState<JerryState>(INITIAL_JERRY_STATE);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [backendProbeAttempt, setBackendProbeAttempt] = useState(0);
  const [workspaceLoadError, setWorkspaceLoadError] = useState(false);
  const autoSummaryTriggeredRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!idToken) {
      setBackendReady(null);
      return () => { active = false; };
    }
    setBackendReady(null);
    void checkBackendReadiness().then((ready) => {
      if (active) setBackendReady(ready);
    });
    return () => { active = false; };
  }, [idToken, backendProbeAttempt]);

  useEffect(() => {
    let active = true;
    if (!idToken) {
      setLoaded(true);
      return () => { active = false; };
    }
    if (backendReady !== true) {
      setLoaded(false);
      return () => { active = false; };
    }

    setLoaded(false);
    setWorkspaceLoadError(false);
    apiFetch('/api/state', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('State load failed'))))
      .then((data: JerryState) => {
        if (!data || !data.owner) throw new Error('Authenticated workspace response was invalid.');
        if (active) {
          setState(normalizeJerryWalletState({
            ...INITIAL_JERRY_STATE,
            ...data,
            owner: {
              ...INITIAL_JERRY_STATE.owner,
              ...data.owner,
            },
          }));
        }
      })
      .catch(() => {
        if (active) setWorkspaceLoadError(true);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, [idToken, backendReady]);

  useEffect(() => {
    if (!idToken) return;
    let active = true;
    apiFetch('/api/cloudsql/workspace', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Workspace sync skipped'))))
      .then((payload: { state?: JerryState }) => {
        if (active && payload.state && payload.state.owner) {
          setState(normalizeJerryWalletState({
            ...INITIAL_JERRY_STATE,
            ...payload.state,
            owner: {
              ...INITIAL_JERRY_STATE.owner,
              ...payload.state.owner,
            },
          }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [idToken]);

  useEffect(() => {
    if (!idToken) return;
    let active = true;
    apiFetch('/api/memory')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Persistent memory load failed'))))
      .then((payload: { entries?: MemoryEntry[] }) => {
        if (!active || !Array.isArray(payload.entries)) return;
        setState((previous) => {
          const merged = new Map<string, MemoryEntry>();
          for (const entry of previous.memories ?? []) merged.set(entry.id, entry);
          for (const entry of payload.entries ?? []) merged.set(entry.id, entry);
          return { ...previous, memories: [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
        });
      })
      .catch(() => {
        // Keep the existing workspace snapshot if the dedicated memory service is unavailable.
      });
    return () => { active = false; };
  }, [idToken]);

  const commitState = useCallback(
    (updater: (prev: JerryState) => JerryState) => {
      setState((prev) => {
        const next = normalizeJerryWalletState(updater(prev));
        void apiFetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        }).catch(() => {});
        if (idToken) {
          void apiFetch('/api/cloudsql/workspace', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(next),
          }).catch(() => {});
        }
        return next;
      });
    },
    [idToken]
  );

  const handleSpeakText = useCallback(
    async (text: string) => {
      try {
        const res = await apiFetch('/api/jerry/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceName: state.owner.preferredVoice,
            voiceStyle:
              state.owner.voiceProfile ??
              'Male, 32 years old, American — clear, energetic, confident executive strategist',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
          if (data.audioBase64) {
            const safeMimeType = data.mimeType && /^audio\/[a-z0-9.+-]+$/i.test(data.mimeType) ? data.mimeType : 'audio/mpeg';
            const audio = new Audio(`data:${safeMimeType};base64,${data.audioBase64}`);
            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to browser speechSynthesis
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        const voices = window.speechSynthesis.getVoices();
        const usMaleVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith('en-us') &&
              /alex|david|mark|matthew|guy|ryan|andrew|christopher|eric|male/i.test(v.name)
          ) ??
          voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith('en') &&
              /alex|david|mark|matthew|guy|ryan|andrew|male/i.test(v.name)
          );
        if (usMaleVoice) {
          utterance.voice = usMaleVoice;
        }
        utterance.pitch = 1.0;
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
      }
    },
    [state.owner.preferredVoice, state.owner.voiceProfile]
  );

  const handleSelectCycleStage = (stageId: CycleStageId) => {
    commitState((prev) => ({ ...prev, activeCycleStep: stageId }));
  };

  const handleRespondDiscussion = (
    id: string,
    status: 'adopted' | 'dismissed' | 'discussed'
  ) => {
    const disc = state.proactiveDiscussions.find((d) => d.id === id);
    commitState((prev) => ({
      ...prev,
      proactiveDiscussions: prev.proactiveDiscussions.map((d) =>
        d.id === id ? { ...d, status } : d
      ),
      memories:
        status === 'adopted' && disc
          ? [
              {
                id: `mem-${Date.now()}`,
                category: 'decision',
                title: `Adopted Proactive Recommendation: ${disc.topic}`,
                content: disc.recommendation,
                outcome: 'success',
                tags: ['proactive', 'strategy'],
                createdAt: new Date().toISOString(),
              },
              ...prev.memories,
            ]
          : prev.memories,
    }));

    if (status === 'discussed' && disc) {
      setActiveTab('brain');
      commitState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: `Let's review your proactive proposal: "${disc.topic}". Walk me through the implementation details.`,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
    }
  };

  const handleApproveTaskFromOverview = (taskId: string) => {
    commitState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'running',
              lastCheckpoint: 'Explicitly authorized by owner; executing under idempotency lock.',
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
      memories: [
        {
          id: `mem-${Date.now()}`,
          category: 'decision',
          title: 'Authorized Financial Task Gate',
          content: `Owner authorized task ${taskId} after reviewing financial commitment.`,
          outcome: 'success',
          tags: ['approval', 'governance'],
          createdAt: new Date().toISOString(),
        },
        ...prev.memories,
      ],
    }));
  };

  const handleAppendMessages = (newMessages: ChatMessage[]) => {
    commitState((prev) => {
      const existingIds = new Set(prev.messages.map((m) => m.id));
      const toAdd = newMessages.filter((m) => !existingIds.has(m.id));
      return {
        ...prev,
        messages: [...prev.messages, ...toAdd],
      };
    });
  };

  const handleAddGoal = (goal: Goal) => {
    commitState((prev) => ({
      ...prev,
      goals: [goal, ...prev.goals],
      memories: [
        {
          id: `mem-${Date.now()}`,
          category: 'goal',
          title: `Created 8-Level Plan: ${goal.title}`,
          content: goal.strategy,
          outcome: 'insight',
          tags: ['goal-engine', '8-level-plan'],
          createdAt: new Date().toISOString(),
        },
        ...prev.memories,
      ],
    }));
  };

  const handleToggleGoalStep = (goalId: string, actionStepId: string) => {
    commitState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.id === goalId ? toggleExecutionStep(g, actionStepId) : g)),
    }));
  };

  const handleAuthorizeGoal = (goalId: string) => {
    commitState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) =>
        g.id === goalId ? { ...g, status: 'in_progress' } : g
      ),
      activeCycleStep: 'execute',
    }));
  };

  const handleCreateTask = (input: {
    goalId: string;
    title: string;
    description: string;
    category: AutonomousTask['category'];
    financialImpactUsd: number;
    expectedRevenueUsd?: number;
    backgroundEligible: boolean;
  }) => {
    const result = createAutonomousTask(state.tasks, {
      ...input,
      autonomyThresholdUsd: state.owner.autonomyThresholdUsd,
    });
    if (result.duplicateBlocked || !result.task) {
      return {
        ok: false,
        error: 'Duplicate active task prevented by Jerry Task Engine idempotency guard.',
      };
    }
    const created: AutonomousTask = {
      ...result.task,
      expectedRevenueUsd: input.expectedRevenueUsd ?? 0,
    };
    commitState((prev) => ({
      ...prev,
      tasks: [created, ...prev.tasks],
    }));
    return { ok: true };
  };

  const handleExecuteTaskForIncome = async (taskId: string, expectedRevenueUsd: number, approvalId?: string) => {
    const target = state.tasks.find((t) => t.id === taskId);
    if (!target) return 'Task not found.';
    try {
      const res = await apiFetch('/api/jerry/execute-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: target.title, description: target.description, category: target.category, expectedRevenueUsd, ...(approvalId ? { approvalId } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return typeof data?.error === 'string' ? data.error : `Task execution was blocked (${res.status}).`;
      const projectedRevenueUsd = typeof data.revenueGeneratedUsd === 'number' ? data.revenueGeneratedUsd : expectedRevenueUsd;
      const output = data.deliverableOutput || `Executed "${target.title}". Any revenue amount remains projected until settlement is independently verified.`;
      const { updatedTask } = executeRevenueTask(target, projectedRevenueUsd, output);
      commitState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => t.id === taskId ? updatedTask : t),
        memories: [{ id: `mem-${Date.now()}`, category: 'workflow', title: `Completed Task: ${target.title}`, content: `${output} Projected revenue: $${projectedRevenueUsd.toLocaleString()} USD. No wallet settlement was created by this execution path.`, outcome: 'success', tags: ['task-execution', 'projected-revenue'], createdAt: new Date().toISOString() }, ...prev.memories],
      }));
      return output;
    } catch {
      return 'Task execution is unavailable right now; no local financial or completion fallback was applied.';
    }
  };

  const handleExecuteLearnedDiscovery = async (discoveryId: string): Promise<string> => {
    const target = (state.dailyDiscoveries ?? []).find((d) => d.id === discoveryId);
    if (!target) return 'Discovery method not found.';
    const { updatedDiscovery, earnedUsd } = executeLearnedDiscovery(target);
    const nowIso = new Date().toISOString();
    commitState((prev) => ({
      ...prev,
      dailyDiscoveries: (prev.dailyDiscoveries ?? []).map((d) => d.id === discoveryId ? updatedDiscovery : d),
      memories: [{ id: `mem-${Date.now()}`, category: 'workflow', title: `Executed Learned Way: ${target.title}`, content: `${target.whyEasierAndFaster} Shortcut executed: ${target.executionShortcut} Estimated daily profit potential: +$${earnedUsd.toLocaleString()} USD. No wallet settlement was recorded.`, outcome: 'success', tags: ['new-way-execution', 'estimated-profit', 'daily-learning'], createdAt: nowIso }, ...prev.memories],
    }));
    return `Executed "${target.title}" (estimated +$${earnedUsd.toLocaleString()}/day potential; no settlement recorded).`;
  };

  const handleExecuteDifferentDailyMix = async (): Promise<string> => {
    const nowIso = new Date().toISOString();
    const todayIso = nowIso.slice(0, 10);
    const currentDiscoveries = state.dailyDiscoveries ?? [];
    const growth = evaluateDailyGrowthProgression(
      state.transactions,
      state.dailyProfitHistory ?? [],
      state.owner.dailyProfitThresholdUsd,
      nowIso
    );
    const dynamicMixTargetUsd = Math.max(
      state.owner.dailyProfitThresholdUsd,
      growth.targetToBeatPreviousDayUsd
    );
    const chosen = pickRotatingDailyWays(
      currentDiscoveries,
      dynamicMixTargetUsd,
      todayIso
    );

    if (chosen.length === 0) {
      return 'No learned ways available yet. Run "Discover New Ways Today" first.';
    }

    const results = chosen.map((item) => executeLearnedDiscovery(item, nowIso));
    const totalEarnedUsd = results.reduce((sum, r) => sum + r.earnedUsd, 0);
    const updatedMap = new Map(results.map((r) => [r.updatedDiscovery.id, r.updatedDiscovery]));
    const combinedTodayUsd = Math.round((growth.todayProfitUsd + totalEarnedUsd) * 100) / 100;
    const beatByUsd = Math.round((combinedTodayUsd - growth.previousDayProfitUsd) * 100) / 100;

    commitState((prev) => ({
      ...prev,
      lastDailyProfitRunDate: todayIso,
      dailyDiscoveries: (prev.dailyDiscoveries ?? []).map((d) => updatedMap.get(d.id) ?? d),
      memories: [{ id: `mem-${Date.now()}`, category: 'workflow', title: `Executed ${chosen.length} Different Ways Today (+$${totalEarnedUsd.toLocaleString()} estimated)`, content: `Completed diversified learned mix: ${chosen.map((c) => c.title).join(' + ')}. Estimated daily profit potential is +$${totalEarnedUsd.toLocaleString()} USD (${beatByUsd >= 0 ? `+$${beatByUsd.toLocaleString()} above previous-day benchmark` : 'progressing toward daily growth target'}). No wallet settlement was recorded.`, outcome: 'success', tags: ['daily-execution', 'new-ways', 'estimated-profit'], createdAt: nowIso }, ...prev.memories],
    }));
    return `Executed ${chosen.length} learned ways (estimated +$${totalEarnedUsd.toLocaleString()}/day potential; no settlement recorded).`;
  };

  const handleQueueDiscoveryTask = (discovery: DailyMoneyDiscovery): { ok: boolean; error?: string } => {
    const res = handleCreateTask({
      goalId: state.goals[0]?.id ?? 'goal-daily-1k-profit',
      title: `Execute Learned Way: ${discovery.title}`,
      description: `${discovery.whyEasierAndFaster} Shortcut: ${discovery.executionShortcut}`,
      category: 'operations',
      financialImpactUsd: discovery.startupCapitalUsd,
      expectedRevenueUsd: discovery.estimatedDailyProfitUsd,
      backgroundEligible: true,
    });
    if (res.ok) {
      commitState((prev) => ({
        ...prev,
        dailyDiscoveries: (prev.dailyDiscoveries ?? []).map((d) =>
          d.id === discovery.id ? { ...d, status: 'adopted_into_daily_routine' } : d
        ),
      }));
    }
    return res;
  };

  const handleLearnHumanInsight = async (observationHint = ''): Promise<string> => {
    const existing = state.humanInsights ?? [];
    const res = await apiFetch('/api/jerry/learn-human-insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        observationHint,
        existingTitles: existing.map((i) => i.title),
        ownerName: state.owner.name,
      }),
    });
    const data = (await res.json()) as {
      insight?: HumanUnderstandingInsight;
      modelUsed?: string;
      error?: string;
    };
    if (!res.ok || !data.insight) {
      throw new Error(data.error || 'Could not record new human insight.');
    }

    const insight = data.insight;
    commitState((prev) => ({
      ...prev,
      humanInsights: [insight, ...(prev.humanInsights ?? [])],
      memories: [
        {
          id: `mem-${Date.now()}`,
          category: 'lesson',
          title: `Human Understanding (+${insight.clarityScoreGain} pts): ${insight.title}`,
          content: `${insight.observation} Application: ${insight.practicalApplication}`,
          outcome: 'insight',
          tags: ['human-understanding', insight.domain.toLowerCase().replace(/\s+/g, '-')],
          createdAt: new Date().toISOString(),
        },
        ...prev.memories,
      ],
    }));

    return `Learned deeper human insight: "${insight.title}" (+${insight.clarityScoreGain} pts clarity over yesterday).`;
  };

  const handleLearnInternetGrowth = async (focusHint = ''): Promise<string> => {
    const existing = state.internetMastery ?? [];
    const res = await apiFetch('/api/jerry/learn-internet-growth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        focusHint,
        existingTitles: existing.map((i) => i.title),
      }),
    });
    const data = (await res.json()) as {
      playbook?: InternetDominanceInsight;
      error?: string;
    };
    if (!res.ok || !data.playbook) {
      throw new Error(data.error || 'Could not learn Internet growth playbook.');
    }

    const playbook = data.playbook;
    commitState((prev) => ({
      ...prev,
      internetMastery: [playbook, ...(prev.internetMastery ?? [])],
      memories: [
        {
          id: `mem-${Date.now()}`,
          category: 'lesson',
          title: `Internet Authority (+${playbook.authorityGainPts} pts): ${playbook.title}`,
          content: `${playbook.tactic} Expected impact: ${playbook.expectedImpact}`,
          outcome: 'insight',
          tags: ['internet-mastery', 'distribution', playbook.pillar.toLowerCase().replace(/\s+/g, '-')],
          createdAt: new Date().toISOString(),
        },
        ...prev.memories,
      ],
    }));

    return `Mastered new Internet distribution playbook: "${playbook.title}" (+${playbook.authorityGainPts} pts authority over yesterday).`;
  };

  const handleCompileDailySummary = useCallback(
    async (force = false): Promise<string> => {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (!force && state.lastDailySummaryDate === todayIso && (state.dailySummaryReports ?? []).length > 0) {
        return `Today's daily summary report (${todayIso}) is already compiled.`;
      }

      const activeTasksCount = state.tasks.filter(
        (t) => t.status === 'queued' || t.status === 'running'
      ).length;
      const completedTasksCount = state.tasks.filter((t) => t.status === 'completed').length;
      const interruptedTasksCount = state.tasks.filter((t) => t.status === 'interrupted').length;
      const awaitingApprovalCount = state.tasks.filter((t) => t.status === 'awaiting_approval').length;

      const res = await apiFetch('/api/jerry/daily-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeTasksCount,
          completedTasksCount,
          interruptedTasksCount,
          awaitingApprovalCount,
          newRevenueInsightsCount: (state.dailyDiscoveries ?? []).length,
        }),
      });
      const data = (await res.json()) as { report?: DailySummaryReport; error?: string };
      if (!res.ok || !data.report) {
        throw new Error(data.error || 'Could not compile automated daily summary.');
      }

      const report = data.report;
      commitState((prev) => ({
        ...prev,
        lastDailySummaryDate: todayIso,
        dailySummaryReports: [report, ...(prev.dailySummaryReports ?? [])].slice(0, 14),
      }));

      if (idToken) {
        void apiFetch('/api/cloudsql/daily-summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(report),
        }).catch(() => {});
      }

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(report.notificationTitle, { body: report.headline });
        } catch {
          // Ignore browser notification errors in restricted contexts
        }
      }

      return `Compiled daily summary notification: "${report.headline}".`;
    },
    [commitState, idToken, state.dailyDiscoveries, state.dailyProfitHistory, state.dailySummaryReports, state.internetMastery, state.lastDailySummaryDate, state.owner.dailyProfitThresholdUsd, state.tasks, state.transactions]
  );

  useEffect(() => {
    if (!loaded || autoSummaryTriggeredRef.current) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (
      state.lastDailySummaryDate !== todayIso ||
      (state.dailySummaryReports ?? []).length === 0
    ) {
      autoSummaryTriggeredRef.current = true;
      void handleCompileDailySummary(false).catch(() => {});
    }
  }, [loaded, state.lastDailySummaryDate, state.dailySummaryReports, handleCompileDailySummary]);

  const handleMarkSummaryRead = (id: string) => {
    commitState((prev) => ({
      ...prev,
      dailySummaryReports: (prev.dailySummaryReports ?? []).map((r) =>
        r.id === id ? { ...r, notificationRead: true } : r
      ),
    }));
  };

  const handleRecoverInterrupted = () => {
    const { updatedTasks, recoveredCount } = recoverInterruptedTasks(state.tasks);
    if (recoveredCount > 0) {
      commitState((prev) => ({
        ...prev,
        tasks: updatedTasks,
        memories: [
          {
            id: `mem-${Date.now()}`,
            category: 'workflow',
            title: `Recovered ${recoveredCount} Interrupted Background Task(s)`,
            content: 'Resumed from idempotent checkpoints without duplicate side effects.',
            outcome: 'success',
            tags: ['recovery', 'tasks'],
            createdAt: new Date().toISOString(),
          },
          ...prev.memories,
        ],
      }));
    }
    return recoveredCount;
  };

  const handleUpdateTaskStatus = (
    taskId: string,
    status: TaskExecutionStatus,
    checkpoint?: string
  ) => {
    commitState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              attempts: status === 'running' ? t.attempts + 1 : t.attempts,
              lastCheckpoint: checkpoint ?? t.lastCheckpoint,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  };

  const handlePromoteToGoal = async (title: string, strategy: string, capitalUsd: number) => {
    try {
      const response = await apiFetch('/api/jerry/plan-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: title,
          availableCapitalUsd: capitalUsd,
          weeklyHours: 8,
        }),
      });
      const data = (await response.json()) as { goal?: Goal };
      if (response.ok && data.goal) {
        const enrichedGoal: Goal = {
          ...data.goal,
          strategy: data.goal.strategy || strategy,
        };
        handleAddGoal(enrichedGoal);
        setActiveTab('goals');
      }
    } catch {
      // Ignore network errors silently
    }
  };

  const handleSyncWalletReal = async (): Promise<string> => {
    const res = await apiFetch('/api/wallet/sync-onchain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: state.walletAssets }),
    });
    const data = (await res.json()) as {
      prices?: Record<'BTC', number>;
      priceSource?: string;
      fetchedAt?: string;
      onChainBalances?: Record<
        string,
        { onChainBalance: number | null; rpcSource: string; verified: boolean }
      >;
      error?: string;
    };
    if (!res.ok || !data.prices) {
      throw new Error(data.error || 'Unable to sync live crypto prices.');
    }

    const fetchedAt = data.fetchedAt ?? new Date().toISOString();
    const prices = data.prices;
    const onChain = data.onChainBalances ?? {};

    commitState((prev) => ({
      ...prev,
      lastWalletSyncAt: fetchedAt,
      walletAssets: prev.walletAssets.map((a) => {
        const liveChain = onChain[a.id];
        const nextBalance =
          a.isLiveOnChainBalance && liveChain && liveChain.onChainBalance !== null
            ? liveChain.onChainBalance
            : a.balance;
        return {
          ...a,
          usdPrice: prices[a.symbol] ?? a.usdPrice,
          priceSource: data.priceSource ?? 'Coinbase Live Spot API',
          lastSyncedAt: fetchedAt,
          balance: nextBalance,
        };
      }),
    }));

    return `Synced live Bitcoin spot price via ${data.priceSource ?? 'Coinbase Live Spot API'} (BTC $${prices.BTC.toLocaleString()}).`;
  };

  const handleAttachPublicAddress = async (assetId: string, address: string, useLiveOnChain: boolean): Promise<string> => {
    const cleanAddr = address.trim();
    const res = await apiFetch('/api/wallet/sync-onchain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: state.walletAssets.map((a) => a.id === assetId ? { ...a, address: cleanAddr, isLiveOnChainBalance: useLiveOnChain } : a) }),
    });
    const data = (await res.json()) as { state?: JerryState; onChainBalances?: Record<string, { onChainBalance: number | null; rpcSource: string; verified: boolean }>; error?: string };
    if (!res.ok || !data.state) throw new Error(data.error || 'Unable to update Bitcoin receiving address.');
    setState(normalizeJerryWalletState(data.state));
    const chainEntry = data.onChainBalances?.[assetId];
    return chainEntry?.verified
      ? `Attached ${cleanAddr.slice(0, 8)}... (${chainEntry.rpcSource}: ${chainEntry.onChainBalance} live balance).`
      : `Updated public Bitcoin receiving address ${cleanAddr.slice(0, 10)}...`;
  };

  const handleRecordRealIncome = async (input: {
    asset: WalletAsset['symbol']; network: string; amount: number; counterparty: string; note: string; txHash?: string; isVerifiedOnChain: boolean;
  }): Promise<string> => {
    if (input.asset !== SUPPORTED_CRYPTO_ASSET || input.network !== SUPPORTED_CRYPTO_NETWORK) {
      return `Jerry Wallet records ${SUPPORTED_CRYPTO_ASSET} on ${SUPPORTED_CRYPTO_NETWORK} only.`;
    }
    if (!input.txHash || !input.isVerifiedOnChain) {
      return 'Settlement not recorded: Jerry requires a confirmed Bitcoin transaction before adding funds to financial truth or Profit Reserve.';
    }
    const res = await apiFetch('/api/wallet/commands/record-income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: input.asset, network: input.network, txHash: input.txHash, amount: input.amount, counterparty: input.counterparty, note: input.note }),
    });
    const data = (await res.json()) as { state?: JerryState; transaction?: WalletTransaction; error?: string };
    if (!res.ok || !data.state) throw new Error(data.error || 'Unable to record verified Bitcoin settlement.');
    setState(normalizeJerryWalletState(data.state));
    return `Recorded verified Bitcoin settlement of +${input.amount} BTC. It remains subject to the server approval lifecycle before any Profit Reserve credit.`;
  };

  const handleRunDailyProfitAutopilot = async (): Promise<string> => {
    const todayIso = new Date().toISOString().slice(0, 10);
    if (state.lastDailyProfitRunDate === todayIso) {
      return `Today's daily profit execution plan (${todayIso}) has already been generated.`;
    }
    const dailyRevenueUsd = 1125;
    const response = await apiFetch('/api/jerry/execute-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Daily Profit Deliverable Bundle',
        description: 'Prepare the daily B2B, freight audit, workflow monitoring, and API settlement deliverables. Track projected revenue only; do not create financial settlement truth.',
        category: 'operations',
        expectedRevenueUsd: 0,
      }),
    });
    const data = (await response.json()) as { deliverableOutput?: string; error?: string };
    if (!response.ok) throw new Error(data.error || 'Daily profit execution plan could not be generated.');
    const nowIso = new Date().toISOString();
    commitState((prev) => ({
      ...prev,
      lastDailyProfitRunDate: todayIso,
      tasks: prev.tasks.map((t) => t.id === 'task-daily-100' ? { ...t, status: 'completed', attempts: t.attempts + 1, projectedRevenueUsd: dailyRevenueUsd, deliverableOutput: data.deliverableOutput, lastCheckpoint: `Completed ${todayIso}: generated projected $${dailyRevenueUsd.toLocaleString()} opportunity plan; settlement requires separate verified Bitcoin receipt.`, updatedAt: nowIso } : t),
      memories: [{ id: `mem-${Date.now()}`, category: 'workflow', title: `Daily Profit Plan Generated (${todayIso})`, content: `${data.deliverableOutput ?? 'Daily operational plan generated.'} Projected opportunity: $${dailyRevenueUsd.toLocaleString()}. No wallet or Profit Reserve credit was created.`, outcome: 'success', tags: ['daily-profit', 'projected-revenue', 'no-settlement'], createdAt: nowIso }, ...prev.memories],
    }));
    return `${data.deliverableOutput ?? 'Daily operational plan generated.'} Projected $${dailyRevenueUsd.toLocaleString()} opportunity; no financial settlement was recorded.`;
  };

  const handleDiscoverDailyWays = async (focusHint = ''): Promise<string> => {
    const existing = state.dailyDiscoveries ?? [];
    const growth = evaluateDailyGrowthProgression(state.transactions, state.dailyProfitHistory ?? [], state.owner.dailyProfitThresholdUsd);
    const response = await apiFetch('/api/jerry/discover-daily-ways', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusHint, existingTitles: existing.map((d) => d.title), dailyTargetUsd: state.owner.dailyProfitThresholdUsd, previousDayProfitUsd: Math.max(growth.previousDayProfitUsd, growth.todayProfitUsd), targetToBeatUsd: growth.nextDayMinimumToBeatTodayUsd }),
    });
    const data = (await response.json()) as { discoveries?: DailyMoneyDiscovery[]; error?: string };
    if (!response.ok || !data.discoveries) throw new Error(data.error || 'Could not discover new ways today.');
    const incoming = data.discoveries;
    const todayIso = new Date().toISOString().slice(0, 10);
    const batchPotentialUsd = incoming.reduce((sum, d) => sum + d.estimatedDailyProfitUsd, 0);
    commitState((prev) => ({
      ...prev,
      lastDailyDiscoveryDate: todayIso,
      dailyDiscoveries: mergeUniqueDailyDiscoveries(prev.dailyDiscoveries ?? [], incoming),
      memories: [{ id: `mem-${Date.now()}`, category: 'lesson', title: `Learned ${incoming.length} New Daily Opportunities`, content: incoming.map((d) => `${d.title} (+$${d.estimatedDailyProfitUsd}/day estimate, ${d.estimatedHoursSavedPerWeek} hrs/wk saved)`).join(' · ') + ' Advisory projections only; no financial settlement was recorded.', outcome: 'insight', tags: ['daily-learning', 'new-ways', 'projected-revenue'], createdAt: new Date().toISOString() }, ...prev.memories],
    }));
    return `Discovered ${incoming.length} new opportunities (+$${batchPotentialUsd.toLocaleString()}/day combined estimated potential). These are advisory projections, not realized revenue.`;
  };

  const handleSubmitTransaction = async (tx: WalletTransaction, approvalId: string): Promise<string> => {
    const res = await apiFetch('/api/wallet/commands/submit-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: tx.amount, fee: tx.fee, counterparty: tx.counterparty, note: tx.note, approvalId }),
    });
    const data = (await res.json()) as { state?: JerryState; error?: string };
    if (!res.ok || !data.state) throw new Error(data.error || 'Unable to record Bitcoin transfer.');
    setState(normalizeJerryWalletState(data.state));
    return 'Bitcoin transfer authorization recorded and awaits independent on-chain confirmation.';
  };

  const handleResolveTransaction = async (txId: string, decision: 'confirmed' | 'rejected') => {
    const tx = state.transactions.find((item) => item.id === txId);
    const approvalId = tx?.approvalId;
    if (!approvalId) {
      window.alert('Transaction has no server-owned approval record.');
      return;
    }
    const res = await apiFetch(`/api/approvals/${encodeURIComponent(approvalId)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: decision === 'confirmed' ? 'approved' : 'rejected' }),
    });
    const data = (await res.json()) as { state?: JerryState; error?: string };
    if (!res.ok || !data.state) {
      window.alert(data.error || 'Transaction decision rejected by Jerry security policy.');
      return;
    }
    setState(normalizeJerryWalletState(data.state));
  };

  const handleAddMemory = async (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) => {
    const memoryEntry: MemoryEntry = {
      ...entry,
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      const response = await apiFetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: memoryEntry }),
      });
      const payload = await response.json() as { entry?: MemoryEntry; error?: string };
      if (!response.ok || !payload.entry) {
        throw new Error(payload.error || 'Jerry could not persist this memory.');
      }
      commitState((previous) => ({
        ...previous,
        memories: [payload.entry!, ...previous.memories.filter((item) => item.id !== payload.entry!.id)],
      }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Jerry memory could not be saved. Please retry.');
    }
  };

  const activeNavLabel = NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? 'Command Hub';
  const pendingCount =
    state.tasks.filter((t) => t.status === 'awaiting_approval').length +
    state.transactions.filter((t) => t.status === 'pending_approval').length;

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <Brain className="w-12 h-12 mx-auto text-blue-400" />
          <h1 className="text-2xl font-bold">JERRY</h1>
          <p className="text-sm text-slate-300">Checking your secure owner session...</p>
        </div>
      </main>
    );
  }

  if (!user || !idToken) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
          <div className="flex justify-center mb-5">
            <Brain className="w-14 h-14 text-blue-400" />
          </div>
          <h1 className="text-center text-3xl font-bold tracking-wide">JERRY</h1>
          <p className="mt-3 text-center text-sm text-slate-300">
            Your private business, productivity and technology partner.
          </p>
          <div className="mt-6 rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
            Sign in with the owner's Google account to unlock Jerry. Workspace data and protected actions are unavailable until authentication succeeds.
          </div>
          {authError && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-800 bg-rose-950 p-3 text-sm text-rose-200">
              {authError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Sign in securely with Google
          </button>
          {user && (
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="mt-3 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Reset sign-in session
            </button>
          )}
          <p className="mt-5 text-center text-xs text-slate-500">
            Owner-only access · No paid services are activated by signing in
          </p>
        </section>
      </main>
    );
  }

  if (backendReady === null) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <Brain className="w-12 h-12 mx-auto text-blue-400" />
          <h1 className="text-2xl font-bold">JERRY</h1>
          <p className="text-sm text-slate-300">Checking secure backend connection...</p>
        </div>
      </main>
    );
  }

  if (!backendReady) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7">
          <div className="flex justify-center mb-5"><Brain className="w-14 h-14 text-blue-400" /></div>
          <h1 className="text-center text-3xl font-bold">JERRY</h1>
          <h2 className="mt-4 text-center text-lg font-semibold">Backend not connected</h2>
          <p className="mt-3 text-center text-sm text-slate-300">
            Jerry has not loaded your owner workspace. Connect a verified HTTPS backend with the required database migrations before using live memory, business or execution features.
          </p>
          <p role="status" className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
            No demo workspace will be presented as live owner data. Paid services remain disabled.
          </p>
          <button
            type="button"
            onClick={() => setBackendProbeAttempt((value) => value + 1)}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Retry backend connection
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="mt-3 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </section>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Loading your encrypted owner workspace...</p>
      </main>
    );
  }

  if (workspaceLoadError) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7">
          <h1 className="text-center text-2xl font-bold">JERRY</h1>
          <h2 className="mt-4 text-center text-lg font-semibold">Owner workspace unavailable</h2>
          <p className="mt-3 text-center text-sm text-slate-300">
            The backend is responding, but Jerry could not load the authenticated owner workspace. Check owner authorization and database readiness. No local demo data has been substituted.
          </p>
          <button
            type="button"
            onClick={() => { setWorkspaceLoadError(false); setBackendReady(null); setBackendProbeAttempt((value) => value + 1); }}
            className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Retry secure workspace loading
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-r border-slate-200">
        <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
          <OwnerAvatar src={state.owner.avatarUrl} name={state.owner.name} size="md" />
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight text-slate-900 font-display truncate">
              JERRY
            </p>
            <p className="text-xs text-slate-500 truncate">{state.owner.name}</p>
          </div>
        </div>

        <nav aria-label="Primary Workspace" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-700">Partner Governance</p>
          <p className="font-mono tabular-nums font-medium text-slate-900">
            Top priority: ${state.owner.monthlyProfitMinimumUsd.toLocaleString()}/mo
          </p>
          <p className="font-mono tabular-nums">
            Weekly min: ${state.owner.weeklyProfitMinimumUsd.toLocaleString()}/wk
          </p>
          <p className="font-mono tabular-nums">
            Daily goal: ${state.owner.dailyProfitThresholdUsd.toLocaleString()}/day
          </p>
          <p className="font-mono tabular-nums text-emerald-700 font-medium">
            Profit reserve: ${(state.profitReserveUsd ?? 0).toLocaleString()}
          </p>
          <p className="font-mono tabular-nums">
            Auto-cap: ${state.owner.autonomyThresholdUsd.toLocaleString()}
          </p>
          <p className="font-mono tabular-nums">
            Pending gates: {pendingCount}
          </p>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <OwnerAvatar src={state.owner.avatarUrl} name={state.owner.name} size="sm" />
                <span className="text-base font-bold font-display text-slate-900">JERRY</span>
              </div>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Mobile Workspace" className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb Left — Primary Action Right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-600 truncate">
              <span className="text-slate-400">Jerry</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900 font-semibold">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {user.email?.split('@')[0] ?? 'Signed In'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'brain' ? 'goals' : 'brain')}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'brain' ? 'Open 8-Level Plans' : 'Ask Jerry'}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto">
          {authError && (
            <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {authError}
            </div>
          )}
          {!loaded ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-sm text-slate-500">
              Loading Jerry workspace memory...
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewHub
                  state={state}
                  onNavigate={setActiveTab}
                  onSelectCycleStage={handleSelectCycleStage}
                  onRespondDiscussion={handleRespondDiscussion}
                  onApproveTask={handleApproveTaskFromOverview}
                  onRunDailyProfitAutopilot={handleRunDailyProfitAutopilot}
                  onDiscoverDailyWays={handleDiscoverDailyWays}
                  onExecuteDifferentDailyMix={handleExecuteDifferentDailyMix}
                  onCompileDailySummary={handleCompileDailySummary}
                  onMarkSummaryRead={handleMarkSummaryRead}
                />
              )}

              {activeTab === 'brain' && (
                <BrainConsole
                  state={state}
                  onAppendMessages={handleAppendMessages}
                  onSpeakText={(t) => void handleSpeakText(t)}
                />
              )}

              {activeTab === 'goals' && (
                <GoalsPlanner
                  goals={state.goals}
                  onAddGoal={handleAddGoal}
                  onToggleStep={handleToggleGoalStep}
                  onAuthorizeGoal={handleAuthorizeGoal}
                />
              )}

              {activeTab === 'tasks' && (
                <TasksRecovery
                  tasks={state.tasks}
                  goals={state.goals}
                  autonomyThresholdUsd={state.owner.autonomyThresholdUsd}
                  dailyProfitThresholdUsd={state.owner.dailyProfitThresholdUsd}
                  monthlyNetProfitUsd={calculateUnifiedPortfolio(state.walletAssets, state.incomeStreams, state.profitReserveUsd).monthlyNetProfitUsd}
                  profitReserveUsd={state.profitReserveUsd ?? 0}
                  lastDailyProfitRunDate={state.lastDailyProfitRunDate}
                  onCreateTask={handleCreateTask}
                  onRecoverInterrupted={handleRecoverInterrupted}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                  onExecuteTaskForIncome={handleExecuteTaskForIncome}
                  onRunDailyProfitAutopilot={handleRunDailyProfitAutopilot}
                />
              )}

              {activeTab === 'business' && (
                <BusinessLab
                  interestTopics={state.interestTopics}
                  opportunityAlerts={state.opportunityAlerts}
                  ventures={state.ventures}
                  salesReports={state.salesReports}
                  opportunities={state.opportunities}
                  incomeStreams={state.incomeStreams}
                  availableCapitalUsd={
                    state.walletAssets.reduce((sum, a) => sum + a.balance * a.usdPrice, 0) * 0.25
                  }
                  monthlyProfitMinimumUsd={state.owner.monthlyProfitMinimumUsd}
                  weeklyProfitMinimumUsd={state.owner.weeklyProfitMinimumUsd}
                  onUpdateInterests={(topics) =>
                    commitState((prev) => ({ ...prev, interestTopics: topics }))
                  }
                  onAddOpportunityAlerts={(alerts: OpportunityAlert[]) =>
                    commitState((prev) => ({
                      ...prev,
                      opportunityAlerts: [...alerts, ...prev.opportunityAlerts],
                    }))
                  }
                  onUpdateAlertStatus={(alertId, status) =>
                    commitState((prev) => ({
                      ...prev,
                      opportunityAlerts: prev.opportunityAlerts.map((a) =>
                        a.id === alertId ? { ...a, status } : a
                      ),
                    }))
                  }
                  onAddOpportunity={(opp: BusinessOpportunity) =>
                    commitState((prev) => ({
                      ...prev,
                      opportunities: [opp, ...prev.opportunities],
                    }))
                  }
                  onUpdateOpportunityStatus={(id, status) =>
                    commitState((prev) => ({
                      ...prev,
                      opportunities: prev.opportunities.map((o) =>
                        o.id === id ? { ...o, status } : o
                      ),
                    }))
                  }
                  onAddIncomeStream={(stream: IncomeStream) =>
                    commitState((prev) => ({
                      ...prev,
                      incomeStreams: [stream, ...prev.incomeStreams],
                    }))
                  }
                  onAddVenture={(venture: BusinessVenture) =>
                    commitState((prev) => ({
                      ...prev,
                      ventures: [venture, ...prev.ventures],
                    }))
                  }
                  onPromoteToGoal={handlePromoteToGoal}
                />
              )}

              {activeTab === 'wallet' && (
                <WalletDashboard
                  assets={state.walletAssets}
                  externalWallets={state.externalWallets}
                  transactions={state.transactions}
                  incomeStreams={state.incomeStreams}
                  dailyProfitThresholdUsd={state.owner.dailyProfitThresholdUsd}
                  weeklyProfitMinimumUsd={state.owner.weeklyProfitMinimumUsd}
                  monthlyProfitMinimumUsd={state.owner.monthlyProfitMinimumUsd}
                  profitReserveUsd={state.profitReserveUsd ?? 0}
                  lastWalletSyncAt={state.lastWalletSyncAt}
                  onSubmitTransaction={handleSubmitTransaction}
                  onResolveTransaction={handleResolveTransaction}
                  onSyncWalletReal={handleSyncWalletReal}
                  onAttachPublicAddress={handleAttachPublicAddress}
                  onRecordRealIncome={handleRecordRealIncome}
                />
              )}

              {activeTab === 'voice_vision' && (
                <VoiceVisionStudio
                  owner={state.owner}
                  visionHistory={state.visionHistory}
                  onAddVisionRecord={(record: VisionAnalysisRecord) =>
                    commitState((prev) => ({
                      ...prev,
                      visionHistory: [record, ...prev.visionHistory],
                    }))
                  }
                  onSaveMemory={(title, content, tags) =>
                    handleAddMemory({
                      category: 'lesson',
                      title,
                      content,
                      outcome: 'insight',
                      tags,
                    })
                  }
                  onUpdateVoice={(preferredVoice) =>
                    commitState((prev) => ({
                      ...prev,
                      owner: { ...prev.owner, preferredVoice },
                    }))
                  }
                  onUpdateVoiceProfile={(voiceProfile) =>
                    commitState((prev) => ({
                      ...prev,
                      owner: { ...prev.owner, voiceProfile },
                    }))
                  }
                  onSpeakText={handleSpeakText}
                />
              )}

              {activeTab === 'self_growth' && (
                <SelfGrowthStudio
                  memories={state.memories}
                  selfUpgrades={state.selfUpgrades}
                  dailyDiscoveries={state.dailyDiscoveries ?? []}
                  humanInsights={state.humanInsights ?? []}
                  internetMastery={state.internetMastery ?? []}
                  transactions={state.transactions}
                  dailyProfitHistory={state.dailyProfitHistory ?? []}
                  dailyProfitThresholdUsd={state.owner.dailyProfitThresholdUsd}
                  onDiscoverDailyWays={handleDiscoverDailyWays}
                  onExecuteLearnedDiscovery={handleExecuteLearnedDiscovery}
                  onExecuteDifferentDailyMix={handleExecuteDifferentDailyMix}
                  onQueueDiscoveryTask={handleQueueDiscoveryTask}
                  onLearnHumanInsight={handleLearnHumanInsight}
                  onLearnInternetGrowth={handleLearnInternetGrowth}
                  onAddLearnedMemory={(entry) =>
                    commitState((prev) => ({
                      ...prev,
                      memories: [entry, ...prev.memories],
                    }))
                  }
                  onAddUpgradeProposal={(proposal: SelfUpgradeProposal) =>
                    commitState((prev) => ({
                      ...prev,
                      selfUpgrades: [proposal, ...prev.selfUpgrades],
                    }))
                  }
                  onUpdateUpgradeProposal={(id, updates) =>
                    commitState((prev) => {
                      const target = prev.selfUpgrades.find((u) => u.id === id);
                      const isDeploying =
                        updates.approvalStatus === 'approved_deployed' &&
                        target &&
                        target.approvalStatus !== 'approved_deployed';
                      return {
                        ...prev,
                        selfUpgrades: prev.selfUpgrades.map((u) =>
                          u.id === id ? { ...u, ...updates } : u
                        ),
                        memories: isDeploying
                          ? [
                              {
                                id: `mem-${Date.now()}`,
                                category: 'workflow',
                                title: `Deployed Permitted Self-Upgrade (${target.language}): ${target.title}`,
                                content: target.summary,
                                outcome: 'success',
                                tags: ['self-programming', target.language.toLowerCase()],
                                createdAt: new Date().toISOString(),
                              },
                              ...prev.memories,
                            ]
                          : prev.memories,
                      };
                    })
                  }
                />
              )}

              {activeTab === 'approvals' && <SecurityApprovals />}

              {activeTab === 'memory' && (
                <MemoryAndSystem
                  owner={state.owner}
                  memories={state.memories}
                  phoneIntegrations={state.phoneIntegrations}
                  onAddMemory={handleAddMemory}
                  onUpdateOwner={(updates: Partial<OwnerProfile>) =>
                    commitState((prev) => ({
                      ...prev,
                      owner: { ...prev.owner, ...updates },
                    }))
                  }
                  onTogglePhoneIntegration={(id) =>
                    commitState((prev) => ({
                      ...prev,
                      phoneIntegrations: prev.phoneIntegrations.map((p) =>
                        p.id === id ? { ...p, enabled: !p.enabled } : p
                      ),
                    }))
                  }
                  onResetDemoState={async (approvalId: string) => {
                    const res = await apiFetch('/api/state/reset', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ approvalId }),
                    });
                    if (res.ok) {
                      const resetData = (await res.json()) as JerryState;
                      setState(resetData);
                    }
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
