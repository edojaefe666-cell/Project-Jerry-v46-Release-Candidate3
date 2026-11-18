import { useState, type FormEvent } from 'react';
import { CheckSquare, Square, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { computeGoalProgress } from '../lib/jerryEngine';
import type { Goal } from '../lib/types';
import { apiFetch } from '../lib/apiClient';

interface GoalsPlannerProps {
  goals: Goal[];
  onAddGoal: (goal: Goal) => void;
  onToggleStep: (goalId: string, actionStepId: string) => void;
  onAuthorizeGoal: (goalId: string) => void;
}

export function GoalsPlanner({
  goals,
  onAddGoal,
  onToggleStep,
  onAuthorizeGoal,
}: GoalsPlannerProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(goals[0]?.id ?? '');
  const [objective, setObjective] = useState('');
  const [capitalUsd, setCapitalUsd] = useState('1000');
  const [weeklyHours, setWeeklyHours] = useState('10');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? goals[0];

  const handleGenerateGoal = async (e: FormEvent) => {
    e.preventDefault();
    if (!objective.trim() || creating) return;

    setCreating(true);
    setError(null);
    try {
      const response = await apiFetch('/api/jerry/plan-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objective: objective.trim(),
          availableCapitalUsd: Number(capitalUsd) || 1000,
          weeklyHours: Number(weeklyHours) || 10,
        }),
      });
      const data = (await response.json()) as { goal?: Goal; error?: string };
      if (!response.ok || !data.goal) {
        throw new Error(data.error || 'Failed to build eight-level plan.');
      }
      onAddGoal(data.goal);
      setSelectedGoalId(data.goal.id);
      setObjective('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate goal.');
    } finally {
      setCreating(false);
    }
  };

  const togglePhase = (phaseId: string) => {
    setCollapsedPhases((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  return (
    <div className="space-y-6">
      {/* Independent Goal Development Form */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-4">
          <h1 className="text-base font-semibold text-slate-900">
            Goal Engine &amp; Eight-Level Planning System
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Jerry evaluates capital, skills, time, technology, demand, and profitability before generating an 8-level operational plan.
          </p>
        </div>

        <form onSubmit={handleGenerateGoal} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label htmlFor="goal-objective-input" className="block text-xs font-medium text-slate-700 mb-1">
              Objective or Business Idea
            </label>
            <input
              id="goal-objective-input"
              type="text"
              required
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="e.g., Launch recurring AI compliance audit service for clinics"
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="goal-capital-input" className="block text-xs font-medium text-slate-700 mb-1">
              Capital (USD)
            </label>
            <input
              id="goal-capital-input"
              type="number"
              min="0"
              value={capitalUsd}
              onChange={(e) => setCapitalUsd(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="goal-hours-input" className="block text-xs font-medium text-slate-700 mb-1">
              Hours / Week
            </label>
            <input
              id="goal-hours-input"
              type="number"
              min="1"
              max="80"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating || !objective.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Build 8-Level Plan
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {/* Master-Detail 8-Level Goal Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List of Established & Recommended Goals */}
        <aside className="lg:col-span-4 space-y-3">
          {goals.map((goal) => {
            const progress = computeGoalProgress(goal);
            const active = selectedGoal?.id === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                onClick={() => setSelectedGoalId(goal.id)}
                className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-white border-blue-600 ring-1 ring-blue-600'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {goal.category} · {goal.status.replace('_', ' ')}
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {progress.percentage}%
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-slate-900 mt-1.5 leading-snug">{goal.title}</h2>
                <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-700 transition-all"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-2">
                  {progress.completedSteps}/{progress.totalSteps} Level-8 execution checks complete
                </p>
              </button>
            );
          })}
        </aside>

        {/* Right 8-Level Plan Detail */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {!selectedGoal ? (
            <p className="text-sm text-slate-500">Select or generate a goal to inspect its eight-level plan.</p>
          ) : (
            <>
              {/* Level 1 & Level 2 Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-slate-200">
                <div className="space-y-1.5">
                  <p className="text-xs font-mono text-slate-500">
                    Level 1 Goal · {selectedGoal.origin.replace('_', ' ')} · {selectedGoal.status.replace('_', ' ')}
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900">{selectedGoal.title}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    <span className="font-medium text-slate-900">Level 2 Strategy: </span>
                    {selectedGoal.strategy}
                  </p>
                </div>

                {selectedGoal.status === 'proposed' && (
                  <button
                    type="button"
                    onClick={() => onAuthorizeGoal(selectedGoal.id)}
                    className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Authorize Goal
                  </button>
                )}
              </div>

              {/* Resource & Feasibility Evaluation (Section 3) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-200 text-xs">
                <div>
                  <p className="text-slate-500">Capital &amp; Time Budget</p>
                  <p className="font-medium text-slate-900 font-mono tabular-nums mt-1">
                    ${selectedGoal.evaluation.availableCapitalUsd.toLocaleString()} ·{' '}
                    {selectedGoal.evaluation.weeklyHoursRequired} hrs/wk
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Skills &amp; Technology</p>
                  <p className="font-medium text-slate-900 mt-1">{selectedGoal.evaluation.technologyStack}</p>
                </div>
                <div>
                  <p className="text-slate-500">Demand &amp; Profitability Estimate</p>
                  <p className="font-medium text-slate-900 mt-1">
                    {selectedGoal.evaluation.profitabilityPotential}
                  </p>
                </div>
              </div>

              {/* Levels 3 to 8 Hierarchical Execution Tree */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Levels 3–8 Execution Breakdown
                  </h3>
                  <span className="text-xs text-slate-500">
                    Click any Level 7/8 step to toggle verification
                  </span>
                </div>

                {selectedGoal.phases.map((phase) => {
                  const isCollapsed = Boolean(collapsedPhases[phase.id]);
                  return (
                    <div key={phase.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => togglePhase(phase.id)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left cursor-pointer"
                      >
                        <div>
                          <span className="text-xs font-mono text-slate-500 mr-2">Level 3 Phase</span>
                          <span className="text-sm font-semibold text-slate-900">{phase.title}</span>
                        </div>
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                      </button>

                      {!isCollapsed && (
                        <div className="p-4 space-y-5 bg-white">
                          {phase.milestones.map((milestone) => (
                            <div key={milestone.id} className="space-y-3">
                              <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-1.5">
                                <span className="font-semibold text-slate-800">
                                  Level 4 Milestone: {milestone.title}
                                </span>
                                <span className="font-mono tabular-nums text-slate-500">
                                  Target {milestone.targetDate}
                                </span>
                              </div>

                              {milestone.tasks.map((task) => (
                                <div key={task.id} className="pl-3 space-y-3">
                                  <p className="text-xs font-medium text-slate-800">
                                    Level 5 Task: {task.title}
                                  </p>

                                  {task.subtasks.map((subtask) => (
                                    <div key={subtask.id} className="pl-3 space-y-2.5">
                                      <p className="text-xs text-slate-600">
                                        Level 6 Subtask: {subtask.title}
                                      </p>

                                      <div className="space-y-2.5">
                                        {subtask.actionSteps.map((step) => (
                                          <div
                                            key={step.id}
                                            className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2"
                                          >
                                            <button
                                              type="button"
                                              onClick={() => onToggleStep(selectedGoal.id, step.id)}
                                              className="w-full flex items-start gap-2.5 text-left cursor-pointer"
                                            >
                                              {step.execution.completed ? (
                                                <CheckSquare className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                                              ) : (
                                                <Square className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                              )}
                                              <span
                                                className={`text-sm font-medium ${
                                                  step.execution.completed
                                                    ? 'line-through text-slate-500'
                                                    : 'text-slate-900'
                                                }`}
                                              >
                                                Level 7 Action: {step.title}
                                              </span>
                                            </button>

                                            {/* Level 8 Execution Details */}
                                            <div className="pl-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
                                              <div>
                                                <span className="font-medium text-slate-700">Level 8 Tools: </span>
                                                {step.execution.tools.join(', ')}
                                              </div>
                                              <div>
                                                <span className="font-medium text-slate-700">Resources: </span>
                                                {step.execution.resources.join(', ')}
                                              </div>
                                              <div>
                                                <span className="font-medium text-slate-700">Dependencies: </span>
                                                {step.execution.dependencies.join(', ')}
                                              </div>
                                              <div className="font-mono tabular-nums">
                                                <span className="font-sans font-medium text-slate-700">Deadline: </span>
                                                {step.execution.deadline}
                                              </div>
                                              <div className="sm:col-span-2">
                                                <span className="font-medium text-slate-700">Instructions: </span>
                                                {step.execution.instructions}
                                              </div>
                                              <div className="sm:col-span-2">
                                                <span className="font-medium text-slate-700">Completion Check: </span>
                                                {step.execution.completionCheck}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
