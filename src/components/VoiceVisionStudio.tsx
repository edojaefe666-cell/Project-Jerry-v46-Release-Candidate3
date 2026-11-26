import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Eye, Mic, Volume2, Upload, Loader2, BookmarkPlus } from 'lucide-react';
import type { OwnerProfile, VisionAnalysisRecord } from '../lib/types';
import { apiFetch } from '../lib/apiClient';

interface VoiceVisionStudioProps {
  owner: OwnerProfile;
  visionHistory: VisionAnalysisRecord[];
  onAddVisionRecord: (record: VisionAnalysisRecord) => void;
  onSaveMemory: (title: string, content: string, tags: string[]) => void;
  onUpdateVoice: (voice: OwnerProfile['preferredVoice']) => void;
  onUpdateVoiceProfile: (profile: string) => void;
  onSpeakText: (text: string) => Promise<void>;
}

const SAMPLE_DOC_PATH = '/src/assets/images/vision_sample_document_1794533353073.jpg';

export function VoiceVisionStudio({
  owner,
  visionHistory,
  onAddVisionRecord,
  onSaveMemory,
  onUpdateVoice,
  onUpdateVoiceProfile,
  onSpeakText,
}: VoiceVisionStudioProps) {
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(SAMPLE_DOC_PATH);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [visionPrompt, setVisionPrompt] = useState(
    'Extract revenue metrics, operating expenses, and actionable business takeaways from this document.'
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);

  const [speechText, setSpeechText] = useState(
    'Briefing ready. Monthly net profit is tracking positively, and two opportunity alerts are waiting for your review.'
  );
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [transcribing, setTranscribing] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedDataUrl(reader.result);
        setSelectedImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeVision = async (e: FormEvent) => {
    e.preventDefault();
    if (analyzing) return;
    setAnalyzing(true);
    setVisionError(null);
    try {
      const response = await apiFetch('/api/jerry/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: uploadedDataUrl ?? undefined,
          sampleImagePath: uploadedDataUrl ? undefined : selectedImageUrl,
          prompt: visionPrompt,
        }),
      });
      const data = (await response.json()) as {
        analysis?: string;
        extractedActions?: string[];
        error?: string;
      };
      if (!response.ok || !data.analysis) {
        throw new Error(data.error || 'Jerry Vision analysis failed.');
      }

      const record: VisionAnalysisRecord = {
        id: `vis-${Date.now()}`,
        title: uploadedDataUrl ? 'Uploaded Document / Screenshot' : 'Sample Q3 SaaS Revenue Statement',
        imageUrl: selectedImageUrl,
        prompt: visionPrompt,
        analysis: data.analysis,
        extractedActions: data.extractedActions ?? [],
        timestamp: new Date().toISOString(),
      };
      onAddVisionRecord(record);
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : 'Vision request failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePlayVoice = async () => {
    if (!speechText.trim() || speaking) return;
    setSpeaking(true);
    setVoiceNote(null);
    try {
      await onSpeakText(speechText.trim());
    } finally {
      setSpeaking(false);
    }
  };

  const handleListenBrowserMic = async () => {
    if (listening || transcribing) return;

    const SpeechRecognitionCtor =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new (SpeechRecognitionCtor as any)();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        setListening(true);
        setVoiceNote('Listening for voice command...');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          const text = event.results?.[0]?.[0]?.transcript ?? '';
          setTranscript(text);
          setSpeechText(`Acknowledged: "${text}". Ready to incorporate into our active plan.`);
          setListening(false);
          setVoiceNote('Voice command captured.');
        };
        recognition.onerror = () => {
          setListening(false);
          setVoiceNote('Microphone capture cancelled or unavailable.');
        };
        recognition.onend = () => setListening(false);
        recognition.start();
        return;
      } catch {
        setListening(false);
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceNote('Voice recognition is unavailable in this browser; type your spoken command below or use Gemini Voice playback.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setListening(false);
        setVoiceNote('Microphone recording failed.');
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          setListening(false);
          setVoiceNote('No audio was captured.');
          return;
        }
        setListening(false);
        setTranscribing(true);
        setVoiceNote('Transcribing voice command with Jerry...');
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
          }
          const audioBase64 = btoa(binary);
          const response = await apiFetch('/api/jerry/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm' }),
          });
          const data = (await response.json()) as { transcript?: string; error?: string };
          if (!response.ok || !data.transcript?.trim()) throw new Error(data.error || 'No transcript returned.');
          const text = data.transcript.trim();
          setTranscript(text);
          setSpeechText(`Acknowledged: "${text}". Ready to incorporate into our active plan.`);
          setVoiceNote('Voice command transcribed by Jerry.');
        } catch (err) {
          setVoiceNote(err instanceof Error ? err.message : 'Jerry transcription failed.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setListening(true);
      setVoiceNote('Recording voice command. Click again to stop and transcribe.');
    } catch {
      setListening(false);
      setVoiceNote('Microphone permission was denied or recording could not start.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Jerry Vision */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Jerry Vision — Document &amp; Screenshot Intelligence
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload invoices, financial statements, or phone screenshots for structured extraction and action items.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
          <div className="sm:col-span-5 space-y-2.5">
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-100 aspect-[4/3]">
              <img
                src={selectedImageUrl}
                alt="Document preview for Jerry Vision analysis"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Upload Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setUploadedDataUrl(null);
                  setSelectedImageUrl(SAMPLE_DOC_PATH);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Use Sample Statement
              </button>
            </div>
          </div>

          <form onSubmit={handleAnalyzeVision} className="sm:col-span-7 space-y-3">
            <div>
              <label htmlFor="vision-prompt" className="block text-xs font-medium text-slate-700 mb-1">
                Inspection Instructions
              </label>
              <textarea
                id="vision-prompt"
                rows={4}
                value={visionPrompt}
                onChange={(e) => setVisionPrompt(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <button
              type="submit"
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Analyze Visual Asset
            </button>
            {visionError && <p className="text-xs text-rose-700">{visionError}</p>}
          </form>
        </div>

        {/* Vision History */}
        <div className="pt-4 border-t border-slate-200 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent Vision Extractions</h2>
          <div className="space-y-3">
            {visionHistory.map((item) => (
              <div key={item.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-900">{item.title}</span>
                  <span className="font-mono tabular-nums">{item.timestamp.slice(0, 10)}</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{item.analysis}</p>
                {item.extractedActions.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-slate-600 space-y-0.5">
                    {item.extractedActions.map((act, idx) => (
                      <li key={idx}>{act}</li>
                    ))}
                  </ul>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => onSaveMemory(`Vision Insight: ${item.title}`, item.analysis, ['vision', 'document'])}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    Save Insight to Jerry Memory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jerry Voice */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Jerry Voice — Speech Recognition &amp; Spoken Updates
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hands-free voice commands and natural executive briefings via configured server voice providers or device speech fallback.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="voice-persona-select" className="block text-xs font-medium text-slate-700 mb-1">
              Jerry Voice Persona
            </label>
            <select
              id="voice-persona-select"
              value={owner.preferredVoice}
              onChange={(e) => onUpdateVoice(e.target.value as OwnerProfile['preferredVoice'])}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="Puck">Puck — Male, 32 yrs, American (Clear &amp; Strategic)</option>
              <option value="Charon">Charon — Adult Male, Calm Baritone</option>
              <option value="Fenrir">Fenrir — Adult Male, Direct &amp; Decisive</option>
              <option value="Kore">Kore — Female, Crisp &amp; Executive</option>
              <option value="Zephyr">Zephyr — Female, Warm &amp; Clear</option>
            </select>
          </div>
          <div>
            <label htmlFor="voice-profile-input" className="block text-xs font-medium text-slate-700 mb-1">
              Voice Character &amp; Age Profile
            </label>
            <input
              id="voice-profile-input"
              type="text"
              value={
                owner.voiceProfile ??
                'Male, 32 years old, American — clear, energetic, confident executive strategist'
              }
              onChange={(e) => onUpdateVoiceProfile(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Voice Command Capture</span>
            <button
              type="button"
              onClick={handleListenBrowserMic}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-blue-700" />
              {transcribing ? 'Transcribing...' : listening ? (mediaRecorderRef.current ? 'Stop & Transcribe' : 'Listening...') : 'Capture Spoken Command'}
            </button>
          </div>
          {voiceNote && <p className="text-xs text-slate-600">{voiceNote}</p>}
          {transcript && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800">
              Captured Transcript: &ldquo;{transcript}&rdquo;
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t border-slate-200">
          <label htmlFor="tts-briefing-text" className="block text-xs font-medium text-slate-700">
            Spoken Task / Opportunity Briefing
          </label>
          <textarea
            id="tts-briefing-text"
            rows={4}
            value={speechText}
            onChange={(e) => setSpeechText(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="button"
            disabled={speaking || !speechText.trim()}
            onClick={() => void handlePlayVoice()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            {speaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
            Speak Briefing
          </button>
        </div>
      </section>
    </div>
  );
}
