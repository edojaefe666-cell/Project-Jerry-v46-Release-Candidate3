import { useState, type FormEvent } from 'react';
import { Send, Volume2, Loader2 } from 'lucide-react';
import type { ChatMessage, JerryState } from '../lib/types';
import { OwnerAvatar } from './OwnerAvatar';
import { apiFetch } from '../lib/apiClient';

interface BrainConsoleProps {
  state: JerryState;
  onAppendMessages: (newMessages: ChatMessage[]) => void;
  onSpeakText: (text: string) => void;
}

const STRATEGIC_PROMPTS = [
  'Compare our active goals and suggest the fastest path to our first $2,000 MRR.',
  'Identify a low-capital automation opportunity we can validate in 10 days.',
  'Audit our current wallet exposure and recommend safer treasury allocation.',
];

export function BrainConsole({ state, onAppendMessages, onSpeakText }: BrainConsoleProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildContextSummary = () => {
    const goalLines = state.goals.map((g) => `- ${g.title} (${g.status})`).join('\n');
    const taskLines = state.tasks.map((t) => `- ${t.title} [${t.status}]`).join('\n');
    const waysCount = (state.dailyDiscoveries ?? []).length;
    const prevDay = (state.dailyProfitHistory ?? []).slice(-1)[0];
    const topInsights = (state.humanInsights ?? []).slice(0, 2).map((h) => h.title).join('; ');
    return `Owner: ${state.owner.name}, TOP PRIORITY DAILY TASK & GOAL: Generate and save at least $${state.owner.dailyProfitThresholdUsd}/day in non-investment Profit Reserve AND earn MORE than previous day ($${prevDay?.profitUsd ?? 1085} on ${prevDay?.date ?? 'yesterday'}), Weekly min: $${state.owner.weeklyProfitMinimumUsd}/week, Monthly min: $${state.owner.monthlyProfitMinimumUsd}/month, Learned Ways: ${waysCount}, Understanding Records: ${state.memories.length}, Human Understanding Principles: ${topInsights || 'Clarity, empathy, verifiable facts'}, Autonomy threshold: $${state.owner.autonomyThresholdUsd}\nGoals:\n${goalLines}\nTasks:\n${taskLines}`;
  };

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      mode: 'text',
    };

    onAppendMessages([userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/jerry/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: state.messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          contextSummary: buildContextSummary(),
        }),
      });

      const data = (await response.json()) as { reply?: string; modelUsed?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Jerry Brain could not process the request.');
      }

      const jerryMsg: ChatMessage = {
        id: `msg-${Date.now()}-j`,
        role: 'jerry',
        content: data.reply,
        timestamp: new Date().toISOString(),
        mode: 'text',
        modelUsed: data.modelUsed,
      };
      onAppendMessages([userMsg, jerryMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach Jerry Brain.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Main Conversational Partner Thread */}
      <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[580px]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <OwnerAvatar src={state.owner.avatarUrl} name={state.owner.name} size="sm" />
            <div>
              <h1 className="text-base font-semibold text-slate-900">Jerry Brain — Executive Partner</h1>
              <p className="text-xs text-slate-500">
                Context-aware reasoning linked to your goals, tasks, wallet, and persistent memory
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[460px]">
          {state.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'jerry' && (
                <OwnerAvatar src={state.owner.avatarUrl} name={state.owner.name} size="sm" className="mt-0.5" />
              )}
              <div
                className={`max-w-[82%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1 text-xs opacity-75">
                  <span className="font-medium">{msg.role === 'user' ? state.owner.name : 'Jerry'}</span>
                  <span className="font-mono tabular-nums">
                    {msg.timestamp.slice(11, 16)}
                    {msg.modelUsed ? ` · ${msg.modelUsed}` : ''}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.role === 'jerry' && (
                  <div className="mt-2 pt-2 border-t border-slate-200/70 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onSpeakText(msg.content)}
                      aria-label={`Read Jerry message aloud`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Speak Update
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
              <span>Jerry Brain is analyzing goals, constraints, and market context...</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 border-t border-slate-200 flex items-center gap-3">
          <label htmlFor="jerry-brain-input" className="sr-only">
            Message Jerry Brain
          </label>
          <input
            id="jerry-brain-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jerry to analyze an opportunity, evaluate risks, or refine strategy..."
            className="flex-1 px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </section>

      {/* Strategic Prompt Sidebar */}
      <aside className="lg:col-span-4 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Strategic Discussions</h2>
          <p className="text-xs text-slate-500">
            Start a focused commercial or operational review with one click.
          </p>
          <div className="space-y-2 pt-1">
            {STRATEGIC_PROMPTS.map((promptText, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => void sendMessage(promptText)}
                className="w-full text-left p-3 text-xs text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {promptText}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Active Reasoning Boundaries</h2>
          <ul className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <li>Distinguishes verified market facts from model estimates.</li>
            <li>Never guarantees investment or commercial returns.</li>
            <li>
              Requires owner approval above{' '}
              <span className="font-mono tabular-nums font-medium text-slate-900">
                ${state.owner.autonomyThresholdUsd}
              </span>{' '}
              or for contracts and confidential data sharing.
            </li>
            <li>Blocks fraudulent, deceptive, or harmful workflows unconditionally.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
