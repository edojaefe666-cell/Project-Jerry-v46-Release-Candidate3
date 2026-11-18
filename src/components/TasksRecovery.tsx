import { useState, type FormEvent } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Play,
  PauseOctagon,
  Plus,
  DollarSign,
  Loader2,
} from 'lucide-react';
import { buildDailyProfitPlan } from '../lib/jerryEngine';
import type { AutonomousTask, Goal, TaskExecutionStatus } from '../lib/types';

interface TasksRecoveryProps {
  tasks: AutonomousTask[];
  goals: Goal[];
  autonomyThresholdUsd: number;
  dailyProfitThresholdUsd?: number;
  monthlyNetProfitUsd?: number;
  profitReserveUsd?: number;
  lastDailyProfitRunDate?: string;
  onCreateTask: (input: {
    goalId: string;
    title: string;
    description: string;
    category: AutonomousTask['category'];
    financialImpactUsd: number;
    expectedRevenueUsd?: number;
    backgroundEligible: boolean;
  }) => { ok: boolean; error?: string };
  onRecoverInterrupted: () => number;
  onUpdateTaskStatus: (taskId: string, status: TaskExecutionStatus, checkpoint?: string) => void;
  onExecuteTaskForIncome: (taskId: string, expectedRevenueUsd: number, approvalId?: string) => Promise<string>;
  onRunDailyProfitAutopilot: () => Promise<string>;
}

const FILTER_OPTIONS: Array<{ id: 'all' | TaskExecutionStatus; label: string }> = [
  { id: 'all', label: 'All Tasks' },
  { id: 'awaiting_approval', label: 'Awaiting Approval' },
  { id: 'running', label: 'Running' },
  { id: 'interrupted', label: 'Interrupted' },
  { id: 'completed', label: 'Completed' },
];

const INCOME_PRESETS = [
  {
    title: 'Deliver Carrier Invoice Variance Audit for Pilot Client',
    description: 'Run automated OCR audit on 25 carrier bills of lading and bill fixed pilot fee.',
    category: 'operations' as const,
    expectedRevenueUsd: 295,
  },
  {
    title: 'Process Document Extraction API Overage Settlement',
    description: 'Reconcile monthly API metered usage and settle invoice to Bitcoin settlement record.',
    category: 'operations' as const,
    expectedRevenueUsd: 180,
  },
  {
    title: 'Complete B2B Workflow Automation Milestone Deliverable',
    description: 'Ship automated ledger sync module for retainer client and record milestone payout.',
    category: 'engineering' as const,
    expectedRevenueUsd: 650,
  },
];

export function TasksRecovery({
  tasks,
  goals,
  autonomyThresholdUsd,
  dailyProfitThresholdUsd = 1000,
  monthlyNetProfitUsd = 4731,
  profitReserveUsd = 1450,
  lastDailyProfitRunDate,
  onCreateTask,
  onRecoverInterrupted,
  onUpdateTaskStatus,
  onExecuteTaskForIncome,
  onRunDailyProfitAutopilot,
}: TasksRecoveryProps) {
  const [filter, setFilter] = useState<'all' | TaskExecutionStatus>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState(goals[0]?.id ?? 'goal-b2b-invoicing');
  const [category, setCategory] = useState<AutonomousTask['category']>('operations');
  const [financialImpact, setFinancialImpact] = useState('0');
  const [expectedRevenue, setExpectedRevenue] = useState('0');
  const [approvalId, setApprovalId] = useState('');
  const [backgroundEligible, setBackgroundEligible] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [runningDailyRoutine, setRunningDailyRoutine] = useState(false);

  const dailyPlan = buildDailyProfitPlan(
    dailyProfitThresholdUsd,
    monthlyNetProfitUsd,
    lastDailyProfitRunDate
  );

  const handleRunDailyRoutine = async () => {
    setRunningDailyRoutine(true);
    try {
      const msg = await onRunDailyProfitAutopilot();
      setFeedback(msg);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Unable to complete daily routine right now.'
      );
    } finally {
      setRunningDailyRoutine(false);
    }
  };

  const interruptedCount = tasks.filter((t) => t.status === 'interrupted').length;
  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);
  const totalTaskRevenue = tasks.reduce((sum, t) => sum + (t.realizedRevenueUsd ?? 0), 0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const result = onCreateTask({
      goalId,
      title: title.trim(),
      description: description.trim() || 'Autonomous operational work unit.',
      category,
      financialImpactUsd: Number(financialImpact) || 0,
      expectedRevenueUsd: Number(expectedRevenue) || 0,
      backgroundEligible,
    });
    if (!result.ok) {
      setFeedback(result.error ?? 'Duplicate task blocked by idempotency guard.');
      return;
    }
    setFeedback('Task queued with idempotency lock.');
    setTitle('');
    setDescription('');
    setFinancialImpact('0');
    setExpectedRevenue('0');
    setApprovalId('');
  };

  const handleResumeAll = () => {
    const recovered = onRecoverInterrupted();
    setFeedback(
      recovered > 0
        ? `Resumed ${recovered} interrupted task${recovered === 1 ? '' : 's'} cleanly from saved checkpoints without duplicate actions.`
        : 'No interrupted tasks needed recovery.'
    );
  };

  const handleRunTask = async (task: AutonomousTask, customRevenue?: number) => {
    setExecutingId(task.id);
    try {
      const rev = customRevenue ?? task.expectedRevenueUsd ?? 0;
      const summary = await onExecuteTaskForIncome(task.id, rev, approvalId.trim() || undefined);
      setFeedback(summary);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Task execution encountered a network error.'
      );
    } finally {
      setExecutingId(null);
    }
  };

  const handleQueuePresetIncomeTask = (preset: (typeof INCOME_PRESETS)[number]) => {
    const result = onCreateTask({
      goalId: goals[0]?.id ?? 'goal-b2b-invoicing',
      title: preset.title,
      description: preset.description,
      category: preset.category,
      financialImpactUsd: 0,
      expectedRevenueUsd: preset.expectedRevenueUsd,
      backgroundEligible: true,
    });
    if (!result.ok) {
      setFeedback(result.error ?? 'This revenue task is already active in your queue.');
      return;
    }
    setFeedback(
      `Queued income task "${preset.title}" ($${preset.expectedRevenueUsd} expected revenue). Click Execute & Generate Income to run it.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Recovery Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Autonomous Task Engine, Execution &amp; Income Generation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Routine tasks and revenue deliverables execute under idempotent checkpoints; commitments above{' '}
            <span className="font-mono tabular-nums font-medium text-slate-900">
              ${autonomyThresholdUsd.toLocaleString()}
            </span>{' '}
            pause for explicit approval. Task-generated income:{' '}
            <span className="font-mono tabular-nums font-semibold text-emerald-700">
              ${totalTaskRevenue.toLocaleString()}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleResumeAll}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Resume Interrupted Tasks ({interruptedCount})
        </button>
      </section>

      {feedback && (
        <div className="bg-slate-900 text-white text-xs px-4 py-3 rounded-lg flex items-center justify-between gap-4">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-300 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top-Most Priority Daily $1,000+ Profit Playbook (Separated from Investment) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Top-Most Priority Daily Routine · Minimum ${dailyPlan.dailyMinimumUsd.toLocaleString()}/Day Profit (Non-Investment Reserve)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Zero investment drawdown ($0 capital risk). Daily profit generated here is saved directly into your Bitcoin Profit Reserve (current reserve:{' '}
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                ${profitReserveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              ) and kept separate from investment capital.
            </p>
          </div>
          <button
            type="button"
            disabled={runningDailyRoutine || dailyPlan.executedToday}
            onClick={() => void handleRunDailyRoutine()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              dailyPlan.executedToday
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
          >
            {runningDailyRoutine ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Running Daily Routine...
              </>
            ) : dailyPlan.executedToday ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Daily +${dailyPlan.playbookTotalUsd.toLocaleString()} Saved Today
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Carry Out Daily ${dailyPlan.playbookTotalUsd.toLocaleString()} Routine
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {dailyPlan.steps.map((step) => (
            <div key={step.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                <span className="font-semibold text-emerald-700">+${step.netProfitUsd}</span>
                <span className="text-slate-500">${step.capitalRiskUsd} investment</span>
              </div>
              <p className="text-xs font-semibold text-slate-900">{step.title}</p>
              <p className="text-xs text-slate-500">{step.channel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* One-Click Income-Generating Tasks */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Ready-to-Execute Revenue Tasks
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Queue a legitimate client deliverable or billing task for Jerry to carry out and settle into Jerry Wallet.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {INCOME_PRESETS.map((preset) => (
            <div
              key={preset.title}
              className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <p className="text-xs font-mono tabular-nums font-semibold text-emerald-700">
                  +${preset.expectedRevenueUsd} USD Projected Revenue
                </p>
                <p className="text-xs font-semibold text-slate-900">{preset.title}</p>
                <p className="text-xs text-slate-600">{preset.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleQueuePresetIncomeTask(preset)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                Queue Income Task
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Queue Custom Task Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Dispatch Custom Task</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label htmlFor="task-title-input" className="block text-xs font-medium text-slate-700 mb-1">
              Task Title
            </label>
            <input
              id="task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Audit Q4 carrier pricing tier"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="task-goal-select" className="block text-xs font-medium text-slate-700 mb-1">
              Linked Goal
            </label>
            <select
              id="task-goal-select"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title.slice(0, 32)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="task-category-select" className="block text-xs font-medium text-slate-700 mb-1">
              Category
            </label>
            <select
              id="task-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as AutonomousTask['category'])}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="research">Research</option>
              <option value="operations">Operations</option>
              <option value="engineering">Engineering</option>
              <option value="outreach">Outreach</option>
              <option value="financial">Financial</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label htmlFor="task-impact-input" className="block text-xs font-medium text-slate-700 mb-1">
              Cost ($)
            </label>
            <input
              id="task-impact-input"
              type="number"
              min="0"
              value={financialImpact}
              onChange={(e) => setFinancialImpact(e.target.value)}
              className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-1">
            <label htmlFor="task-revenue-input" className="block text-xs font-medium text-slate-700 mb-1">
              Rev ($)
            </label>
            <input
              id="task-revenue-input"
              type="number"
              min="0"
              value={expectedRevenue}
              onChange={(e) => setExpectedRevenue(e.target.value)}
              className="w-full px-2.5 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!title.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Queue Task
            </button>
          </div>
          <div className="md:col-span-9">
            <label htmlFor="task-desc-input" className="block text-xs font-medium text-slate-700 mb-1">
              Execution Scope
            </label>
            <input
              id="task-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Checkpoint instructions or deliverable details"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-3 flex items-center gap-2 pb-2">
            <input
              id="task-bg-eligible"
              type="checkbox"
              checked={backgroundEligible}
              onChange={(e) => setBackgroundEligible(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-700"
            />
            <label htmlFor="task-bg-eligible" className="text-xs text-slate-700">
              Eligible for background WorkManager execution
            </label>
          </div>
        </form>
      </section>

      {/* Filter Bar & Task Queue */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </span>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg">
            <p className="text-sm font-medium text-slate-700">No tasks match this status filter</p>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
            >
              Show all tasks
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredTasks.map((task) => {
              const isExecuting = executingId === task.id;
              return (
                <div
                  key={task.id}
                  className="py-4 first:pt-2 last:pb-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="capitalize font-medium text-slate-700">{task.category}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium inline-flex items-center gap-1 ${
                          task.status === 'completed'
                            ? 'text-emerald-700'
                            : task.status === 'awaiting_approval'
                              ? 'text-amber-700'
                              : task.status === 'interrupted' || task.status === 'rejected'
                                ? 'text-rose-700'
                                : 'text-blue-700'
                        }`}
                      >
                        {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {task.status === 'awaiting_approval' && <ShieldAlert className="w-3.5 h-3.5" />}
                        {task.status === 'interrupted' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {task.status.replace('_', ' ')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        ${task.financialImpactUsd.toLocaleString()} cost
                      </span>
                      {(task.expectedRevenueUsd ?? 0) > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-emerald-700 font-medium">
                            +${(task.realizedRevenueUsd ?? task.expectedRevenueUsd ?? 0).toLocaleString()} revenue
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Attempts: {task.attempts}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
                    <p className="text-xs text-slate-600">{task.description}</p>
                    <p className="text-xs text-slate-500">Checkpoint: {task.lastCheckpoint}</p>
                    {task.deliverableOutput && (
                      <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1.5">
                        Deliverable: {task.deliverableOutput}
                      </p>
                    )}
                    {task.approvalReason && task.status === 'awaiting_approval' && (
                      <p className="text-xs text-amber-800 font-medium">
                        Gate reason: {task.approvalReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(task.expectedRevenueUsd ?? 0) > 0 && (
                      <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-amber-300">Approved financial commitment ID</label>
                        <input value={approvalId} onChange={e => setApprovalId(e.target.value)} placeholder="Paste approval ID from Approval Center" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200" />
                      </div>
                    )}
                    {task.status === 'awaiting_approval' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTaskStatus(
                              task.id,
                              'running',
                              'Authorized by owner; running under idempotency guard.'
                            )
                          }
                          aria-label={`Approve ${task.title}`}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Approve &amp; Run
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTaskStatus(task.id, 'rejected', 'Rejected by owner at authorization gate.')
                          }
                          aria-label={`Reject ${task.title}`}
                          className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {(task.status === 'queued' || task.status === 'running') && (
                      <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => void handleRunTask(task)}
                        aria-label={`Execute ${task.title}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isExecuting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {(task.expectedRevenueUsd ?? 0) > 0
                          ? `Execute & Generate $${task.expectedRevenueUsd}`
                          : 'Execute Task'}
                      </button>
                    )}

                    {task.status === 'interrupted' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTaskStatus(task.id, 'running', 'Resumed execution from checkpoint.')
                        }
                        aria-label={`Resume ${task.title}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}

                    {task.status === 'running' && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTaskStatus(
                            task.id,
                            'interrupted',
                            'Paused cleanly at checkpoint due to simulated background restriction.'
                          )
                        }
                        aria-label={`Interrupt ${task.title}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PauseOctagon className="w-3.5 h-3.5" />
                        Simulate Interruption
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
