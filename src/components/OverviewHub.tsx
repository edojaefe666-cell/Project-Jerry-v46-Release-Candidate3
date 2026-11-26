import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Play,
  Loader2,
  Bell,
  FileBarChart2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  buildDailyProfitPlan,
  computeGoalProgress,
  calculateUnifiedPortfolio,
  evaluateDailyGrowthProgression,
  evaluateDailyLearningVelocity,
  evaluateDailyProfitGoal,
  evaluateHumanUnderstandingProgress,
  evaluateInternetDominanceProgress,
  evaluateMonthlyProfitGoal,
  evaluateWeeklyProfitGoal,
} from '../lib/jerryEngine';
import { OPERATING_CYCLE_STAGES } from '../lib/seedData';
import type { CycleStageId, JerryState, WorkspaceTab } from '../lib/types';
import { OwnerAvatar } from './OwnerAvatar';

interface OverviewHubProps {
  state: JerryState;
  onNavigate: (tab: WorkspaceTab) => void;
  onSelectCycleStage: (stageId: CycleStageId) => void;
  onRespondDiscussion: (id: string, status: 'adopted' | 'dismissed' | 'discussed') => void;
  onApproveTask: (taskId: string) => void;
  onRunDailyProfitAutopilot: () => Promise<string>;
  onDiscoverDailyWays: (focusHint?: string) => Promise<string>;
  onExecuteDifferentDailyMix: () => Promise<string>;
  onCompileDailySummary: (force?: boolean) => Promise<string>;
  onMarkSummaryRead: (id: string) => void;
}

export function OverviewHub({
  state,
  onNavigate,
  onSelectCycleStage,
  onRespondDiscussion,
  onApproveTask,
  onRunDailyProfitAutopilot,
  onDiscoverDailyWays,
  onExecuteDifferentDailyMix,
  onCompileDailySummary,
  onMarkSummaryRead,
}: OverviewHubProps) {
  const [runningDaily, setRunningDaily] = useState(false);
  const [dailyStatusMsg, setDailyStatusMsg] = useState<string | null>(null);
  const [discoveringWays, setDiscoveringWays] = useState(false);
  const [executingVariedMix, setExecutingVariedMix] = useState(false);
  const [compilingSummary, setCompilingSummary] = useState(false);
  const [summaryNotice, setSummaryNotice] = useState<string | null>(null);
  const [learningNotice, setLearningNotice] = useState<string | null>(null);
  const portfolio = calculateUnifiedPortfolio(
    state.walletAssets,
    state.incomeStreams,
    state.profitReserveUsd ?? 0
  );
  const learningVelocity = evaluateDailyLearningVelocity(state.dailyDiscoveries ?? []);
  const growthProgression = evaluateDailyGrowthProgression(
    state.transactions,
    state.dailyProfitHistory ?? [],
    state.owner.dailyProfitThresholdUsd
  );
  const humanUnderstanding = evaluateHumanUnderstandingProgress(
    state.humanInsights ?? [],
    state.memories
  );
  const internetProgress = evaluateInternetDominanceProgress(state.internetMastery ?? []);
  const latestSummary = (state.dailySummaryReports ?? [])[0] ?? null;
  const unreadSummariesCount = (state.dailySummaryReports ?? []).filter((r) => !r.notificationRead).length;
  const monthlyProfitGoal = evaluateMonthlyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    state.transactions,
    state.owner.monthlyProfitMinimumUsd
  );
  const weeklyProfitGoal = evaluateWeeklyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    state.transactions,
    state.owner.weeklyProfitMinimumUsd
  );
  const dailyProfitGoal = evaluateDailyProfitGoal(
    portfolio.monthlyNetProfitUsd,
    state.transactions,
    state.owner.dailyProfitThresholdUsd
  );
  const dailyPlan = buildDailyProfitPlan(
    state.owner.dailyProfitThresholdUsd,
    portfolio.monthlyNetProfitUsd,
    state.lastDailyProfitRunDate
  );

  const handleTriggerDailyRoutine = async () => {
    setRunningDaily(true);
    try {
      const msg = await onRunDailyProfitAutopilot();
      setDailyStatusMsg(msg);
    } catch (err) {
      setDailyStatusMsg(err instanceof Error ? err.message : 'Unable to execute daily routine.');
    } finally {
      setRunningDaily(false);
    }
  };

  const handleManualCompileSummary = async () => {
    setCompilingSummary(true);
    try {
      const msg = await onCompileDailySummary(true);
      setSummaryNotice(msg);
    } catch (err) {
      setSummaryNotice(err instanceof Error ? err.message : 'Unable to compile daily summary.');
    } finally {
      setCompilingSummary(false);
    }
  };

  const handleRequestBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') {
      setSummaryNotice('Desktop browser notifications are not supported in this context; in-hub daily alerts remain active.');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setSummaryNotice(
        perm === 'granted'
          ? 'Daily desktop notifications enabled for newly compiled executive reports.'
          : 'Desktop alert permission declined; automated notifications will display inside Overview Hub.'
      );
    } catch {
      setSummaryNotice('Automated daily notifications remain active inside Overview Hub.');
    }
  };
  const pendingApprovals = state.tasks.filter((t) => t.status === 'awaiting_approval');
  const interruptedTasks = state.tasks.filter((t) => t.status === 'interrupted');
  const openDiscussions = state.proactiveDiscussions.filter((d) => d.status === 'awaiting_response');
  const newAlerts = state.opportunityAlerts.filter((a) => a.status === 'new');

  const totalGoalSteps = state.goals.reduce((sum, g) => sum + computeGoalProgress(g).totalSteps, 0);
  const completedGoalSteps = state.goals.reduce((sum, g) => sum + computeGoalProgress(g).completedSteps, 0);
  const overallProgress = totalGoalSteps === 0 ? 0 : Math.round((completedGoalSteps / totalGoalSteps) * 100);

  return (
    <div className="space-y-8">
      {/* Executive Partner Hero Briefing */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-start gap-4">
            <OwnerAvatar src={state.owner.avatarUrl} name={state.owner.name} size="lg" />
            <div className="space-y-1.5 max-w-2xl">
              <p className="text-xs font-medium text-slate-500">
                Jerry Core · Partner Workspace · {state.owner.name}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ textWrap: 'balance' }}>
                Turn opportunities into eight-level plans and measurable revenue
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                {state.owner.missionFocus} Autonomous threshold is capped at{' '}
                <span className="font-mono tabular-nums font-medium text-slate-900">
                  ${state.owner.autonomyThresholdUsd.toLocaleString()}
                </span>
                ; financial commitments above this limit wait for your explicit approval.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('brain')}
              className="px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Jerry Brain
            </button>
            <button
              type="button"
              onClick={() => onNavigate('goals')}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              View 8-Level Plans
            </button>
          </div>
        </div>

        {/* 4-Column KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-slate-200">
          <div>
            <p className="text-xs font-medium text-slate-500">Unified Treasury Balance</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              ${portfolio.totalBalanceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Invested ${portfolio.investedPrincipalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Saved Reserve ${portfolio.savedProfitReserveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">Monthly Net Profit</p>
            <p className="text-2xl font-semibold text-emerald-700 font-mono tabular-nums mt-1">
              ${portfolio.monthlyNetProfitUsd.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Gross ${portfolio.monthlyGrossRevenueUsd.toLocaleString()} across {state.incomeStreams.length} streams
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">Goal Execution Progress</p>
            <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums mt-1">
              {overallProgress}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {completedGoalSteps} of {totalGoalSteps} action steps verified across {state.goals.length} goals
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500">Authorization &amp; Recovery</p>
            <p className="text-2xl font-semibold text-amber-700 font-mono tabular-nums mt-1">
              {pendingApprovals.length} pending
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {interruptedTasks.length} interrupted batch{interruptedTasks.length === 1 ? '' : 'es'} ready to resume
            </p>
          </div>
        </div>

        {/* Top Priority Profit Minimums ($20k/mo, $5k/wk) & Daily Goal ($1k/day) */}
        <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Top Priority · Monthly Minimum
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${monthlyProfitGoal.currentMonthlyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / $
                {monthlyProfitGoal.monthlyMinimumUsd.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  monthlyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${monthlyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Run-rate ${monthlyProfitGoal.monthlyRunRateUsd.toLocaleString()}/mo
                {monthlyProfitGoal.monthSettledUsd > 0
                  ? ` + $${monthlyProfitGoal.monthSettledUsd.toLocaleString()}`
                  : ''}
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  monthlyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {monthlyProfitGoal.achieved
                  ? 'Monthly Minimum Met'
                  : `${monthlyProfitGoal.progressPct}% ($${monthlyProfitGoal.remainingUsd.toLocaleString()} left)`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Top Priority · Weekly Minimum
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${weeklyProfitGoal.currentWeeklyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $
                {weeklyProfitGoal.weeklyMinimumUsd.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  weeklyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${weeklyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Run-rate ${weeklyProfitGoal.weeklyRunRateUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/wk
                {weeklyProfitGoal.weekSettledUsd > 0
                  ? ` + $${weeklyProfitGoal.weekSettledUsd.toLocaleString()}`
                  : ''}
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  weeklyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {weeklyProfitGoal.achieved
                  ? 'Weekly Minimum Met'
                  : `${weeklyProfitGoal.progressPct}% ($${weeklyProfitGoal.remainingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} left)`}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                Daily Portfolio Profit Goal
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ${dailyProfitGoal.currentDailyProfitUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $
                {dailyProfitGoal.dailyThresholdUsd.toLocaleString()}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  dailyProfitGoal.achieved ? 'bg-emerald-600' : 'bg-blue-700'
                }`}
                style={{ width: `${dailyProfitGoal.progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                Run-rate ${dailyProfitGoal.dailyRunRateUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/day
                {dailyProfitGoal.todaySettledUsd > 0
                  ? ` + $${dailyProfitGoal.todaySettledUsd.toLocaleString()}`
                  : ''}
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  dailyProfitGoal.achieved ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {dailyProfitGoal.achieved
                  ? 'Threshold Met'
                  : `${dailyProfitGoal.progressPct}% ($${dailyProfitGoal.remainingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to go)`}
              </span>
            </div>
          </div>
        </div>

        {/* Daily $1,000+ Non-Investment Profit Autopilot Strip */}
        <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-900">
              Top-Most Priority Daily Routine · Generate &amp; Save ${dailyPlan.playbookTotalUsd.toLocaleString()}/Day Outside Investment Capital
            </p>
            <p className="text-xs text-slate-600">
              Zero investment drawdown ($0 capital risk): executes 4 recurring B2B retainer, freight audit, workflow &amp; API settlements (+${dailyPlan.playbookTotalUsd.toLocaleString()}) and saves net profit straight into your Bitcoin Profit Reserve.
            </p>
            {dailyStatusMsg && (
              <p className="text-xs font-medium text-emerald-700">{dailyStatusMsg}</p>
            )}
          </div>
          <button
            type="button"
            disabled={runningDaily || dailyPlan.executedToday}
            onClick={() => void handleTriggerDailyRoutine()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              dailyPlan.executedToday
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
          >
            {runningDaily ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Executing Daily Routine...
              </>
            ) : dailyPlan.executedToday ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved +${dailyPlan.playbookTotalUsd.toLocaleString()} Profit Today
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Run Today&apos;s $1,000+ Profit Routine
              </>
            )}
          </button>
        </div>
      </section>

      {/* Automated Daily Summary Report & Notification System */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileBarChart2 className="w-4 h-4 text-blue-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Automated Daily Summary Report &amp; Notification
              </h2>
              {latestSummary && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded border ${
                    latestSummary.notificationRead
                      ? 'bg-slate-50 text-slate-600 border-slate-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  {latestSummary.notificationRead
                    ? 'Notification Read'
                    : `Daily Notification (${unreadSummariesCount} unread)`}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Compiled automatically each day using Gemini from live daily profit, active tasks, learned revenue insights, and Internet distribution growth.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {latestSummary && !latestSummary.notificationRead && (
              <button
                type="button"
                onClick={() => onMarkSummaryRead(latestSummary.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                Mark Notification Read
              </button>
            )}
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <button
                type="button"
                onClick={() => void handleRequestBrowserAlerts()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-blue-700" />
                Enable Desktop Alerts
              </button>
            )}
            <button
              type="button"
              disabled={compilingSummary}
              onClick={() => void handleManualCompileSummary()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              {compilingSummary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Compiling Report...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Compile Daily Summary Now
                </>
              )}
            </button>
          </div>
        </div>

        {summaryNotice && <p className="text-xs font-medium text-emerald-700">{summaryNotice}</p>}

        {latestSummary ? (
          <div className="space-y-5 pt-4 border-t border-slate-200">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                  <Bell className="w-3.5 h-3.5" />
                  {latestSummary.notificationTitle}
                </span>
                <span className="font-mono tabular-nums">
                  {latestSummary.modelUsed} · {latestSummary.generatedAt.slice(0, 16).replace('T', ' ')} UTC
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{latestSummary.headline}</h3>
              <p className="text-xs text-slate-700 leading-relaxed">{latestSummary.summaryText}</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500">Today Profit</span>
                  <p className="font-mono tabular-nums font-semibold text-slate-600">
                    {latestSummary.metrics.todayProfitUsd === null
                      ? 'Not verified'
                      : `${latestSummary.metrics.todayProfitUsd.toLocaleString()}`}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Active Tasks</span>
                  <p className="font-mono tabular-nums font-semibold text-slate-900">
                    {latestSummary.metrics.activeTasksCount}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Completed</span>
                  <p className="font-mono tabular-nums font-semibold text-slate-900">
                    {latestSummary.metrics.completedTasksCount}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Revenue Insights</span>
                  <p className="font-mono tabular-nums font-semibold text-blue-700">
                    {latestSummary.metrics.newRevenueInsightsCount} learned
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Internet Authority</span>
                  <p className="font-mono tabular-nums font-semibold text-slate-600">
                    {latestSummary.metrics.internetAuthorityScore === null
                      ? 'Not measured'
                      : `${latestSummary.metrics.internetAuthorityScore}%`}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-900">Financial reporting status</p>
              <p className="text-xs text-slate-600">
                Profit and revenue-potential charts are withheld until figures can be loaded from Jerry's verified financial ledger. Revenue ideas are not income, and no historical profit or target is assumed.
              </p>
              <p className="text-xs font-medium text-slate-700">Workspace task counts below are a current client snapshot, not an audited execution record.</p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latestSummary.taskBreakdown} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Workspace tasks" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
            Preparing today&apos;s automated summary briefing and charts...
          </div>
        )}
      </section>

      {/* Continuous Daily Learning & Varied Execution Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Continuous Daily Learning · Make More Than Yesterday Every Day
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {learningVelocity.totalLearned} ways learned
              </span>{' '}
              ·{' '}
              <span className="font-mono tabular-nums text-slate-700">
                {learningVelocity.hoursSavedPerWeek} hrs/wk saved
              </span>{' '}
              ·{' '}
              <span className="font-mono tabular-nums text-slate-700">
                Human understanding {humanUnderstanding.todayScore}% (+{humanUnderstanding.improvementDeltaPts}% vs yesterday)
              </span>{' '}
              ·{' '}
              <span className="font-mono tabular-nums text-slate-700">
                Internet authority {internetProgress.todayAuthorityScore}% (+{internetProgress.improvementDeltaPts} pts)
              </span>{' '}
              ·{' '}
              <span
                className={`font-mono tabular-nums font-medium ${
                  growthProgression.beatPreviousDay ? 'text-emerald-700' : 'text-blue-700'
                }`}
              >
                {growthProgression.beatPreviousDay
                  ? `Beating Yesterday (+$${growthProgression.deltaVsPreviousDayUsd.toLocaleString()} · ${growthProgression.growthStreakDays}-day streak)`
                  : `Yesterday $${growthProgression.previousDayProfitUsd.toLocaleString()} → Target $${growthProgression.targetToBeatPreviousDayUsd.toLocaleString()}/day`}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={discoveringWays}
              onClick={async () => {
                setDiscoveringWays(true);
                try {
                  const msg = await onDiscoverDailyWays();
                  setLearningNotice(msg);
                } finally {
                  setDiscoveringWays(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              {discoveringWays ? 'Learning New Ways...' : 'Learn New Ways Today'}
            </button>
            <button
              type="button"
              disabled={executingVariedMix}
              onClick={async () => {
                setExecutingVariedMix(true);
                try {
                  const msg = await onExecuteDifferentDailyMix();
                  setLearningNotice(msg);
                } finally {
                  setExecutingVariedMix(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {executingVariedMix ? 'Executing Mix...' : 'Execute New Ways Today'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('self_growth')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 px-2 py-1.5 whitespace-nowrap cursor-pointer"
            >
              Open Lab <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {learningNotice && <p className="text-xs font-medium text-emerald-700">{learningNotice}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
          {(state.dailyDiscoveries ?? []).slice(0, 3).map((way) => (
            <div key={way.id} className="space-y-1">
              <p className="text-xs font-mono tabular-nums text-blue-700 font-semibold">
                {way.methodCategory} · +${way.estimatedDailyProfitUsd}/day · {way.estimatedHoursSavedPerWeek}h/wk saved
              </p>
              <h3 className="text-sm font-semibold text-slate-900">{way.title}</h3>
              <p className="text-xs text-slate-600 line-clamp-2">{way.whyEasierAndFaster}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 20: Complete 8-Step Operating Cycle */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Operating Cycle</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Continuous partnership loop from opportunity discovery through execution and learning
            </p>
          </div>
          <span className="text-xs font-medium text-blue-700 font-mono tabular-nums">
            Active Stage: {OPERATING_CYCLE_STAGES.find((s) => s.id === state.activeCycleStep)?.stepNumber} ·{' '}
            {OPERATING_CYCLE_STAGES.find((s) => s.id === state.activeCycleStep)?.label}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {OPERATING_CYCLE_STAGES.map((stage) => {
            const isActive = stage.id === state.activeCycleStep;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onSelectCycleStage(stage.id)}
                className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 border-blue-600 text-slate-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-500">
                  <span>0{stage.stepNumber}</span>
                  {isActive && <span className="text-blue-700 font-semibold">Active</span>}
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1.5">{stage.label}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{stage.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Proactive Opportunity Radar Alerts Summary */}
      {newAlerts.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Proactive Opportunity Alerts ({newAlerts.length} new)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitored interests: {state.interestTopics.join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('business')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Opportunity Radar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 pt-2 border-t border-slate-200">
            {newAlerts.slice(0, 2).map((alert, idx) => (
              <div
                key={alert.id}
                className={`py-3 md:py-1 space-y-1.5 ${idx === 0 ? 'md:pr-6' : 'md:pl-6'}`}
              >
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-blue-700">{alert.interestTopic}</span>
                  <span aria-hidden="true"> · </span>
                  <span>{alert.kind}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums">
                    ${alert.estimatedCapitalUsd.toLocaleString()} est. capital
                  </span>
                </p>
                <h3 className="text-sm font-semibold text-slate-900">{alert.title}</h3>
                <p className="text-xs text-slate-600 line-clamp-2">{alert.profitabilityAnalysis}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Two-Column Operational View: Proactive Intelligence & Owner Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Proactive Intelligence */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Proactive Intelligence</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Jerry initiates meaningful discussions when opportunities or risks emerge
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('brain')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Discuss in Brain <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {openDiscussions.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm font-medium text-slate-700">All proactive proposals reviewed</p>
              <p className="text-xs text-slate-500 mt-1">
                Jerry will surface new discussions as market research and tasks progress.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {openDiscussions.map((disc) => (
                <div key={disc.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span className="capitalize">{disc.triggerType.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{disc.createdAt.slice(0, 10)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{disc.topic}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{disc.summary}</p>
                  <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    Recommendation: {disc.recommendation}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onRespondDiscussion(disc.id, 'adopted')}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Adopt Recommendation
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespondDiscussion(disc.id, 'discussed')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Discuss with Jerry
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespondDiscussion(disc.id, 'dismissed')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Defer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Authorization & Interruption Recovery Queue */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Owner Authorization &amp; Recovery</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Routine work runs independently; financial commitments and checkpoints stay under your control
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Tasks <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {pendingApprovals.map((task) => (
              <div key={task.id} className="py-4 first:pt-0 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Explicit Approval Required
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    ${task.financialImpactUsd.toLocaleString()}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
                <p className="text-xs text-slate-600">{task.approvalReason ?? task.description}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onApproveTask(task.id)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Authorize &amp; Execute
                  </button>
                </div>
              </div>
            ))}

            {interruptedTasks.map((task) => (
              <div key={task.id} className="py-4 last:pb-0 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Interrupted · Safe Checkpoint Saved
                  </span>
                  <span className="font-mono tabular-nums text-slate-500">Attempt #{task.attempts}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
                <p className="text-xs text-slate-600">{task.lastCheckpoint}</p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('tasks')}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Task Recovery
                  </button>
                </div>
              </div>
            ))}

            {pendingApprovals.length === 0 && interruptedTasks.length === 0 && (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-800">All queues nominal</p>
                <p className="text-xs text-slate-500 mt-1">
                  No financial commitments or interrupted background tasks require attention.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
