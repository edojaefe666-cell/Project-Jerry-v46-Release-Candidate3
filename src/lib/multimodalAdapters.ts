import { resolveModelRoute, type ModelProvider, type ProviderConfiguration } from './modelRouter';
import { reserveConfiguredProviderOperation } from '../db/providerOperationStore.ts';
import { withSharedExecutionLease } from '../db/executionControl.ts';
import { assertHostedProviderSpendEnabled } from './providerSpendPolicy.ts';

async function fetchUnderOwnerLease<T>(ownerUid: string | undefined, work: () => Promise<T>): Promise<T> {
  if (!ownerUid) {
    if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider execution protection.');
    return work();
  }
  return withSharedExecutionLease(work);
}

export interface VisionAnalysisOptions {
  prompt: string;
  mimeType: string;
  base64Data: string;
  configuration: ProviderConfiguration;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  ownerUid?: string;
}
export interface VisionAnalysisResult { text: string; provider: ModelProvider; model: string }

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function throwIfAborted(signal?: AbortSignal): void { if (!signal?.aborted) return; throw signal.reason instanceof Error ? signal.reason : new Error('Provider request cancelled.'); }
function createRequestAbort(signal: AbortSignal | undefined, timeoutMs: number) {
 const controller=new AbortController();const abortFromParent=()=>controller.abort(signal?.reason??new Error('Provider request cancelled.'));
 if(signal?.aborted)abortFromParent();else signal?.addEventListener('abort',abortFromParent,{once:true});
 const timer=setTimeout(()=>controller.abort(new Error('Provider request timed out.')),timeoutMs);
 return {signal:controller.signal,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abortFromParent);}};
}
async function postJson(url:string,headers:Record<string,string>,body:unknown,timeoutMs:number,fetchImpl:typeof fetch,parentSignal?:AbortSignal,ownerUid?:string) {
 throwIfAborted(parentSignal);const request=createRequestAbort(parentSignal,timeoutMs);
 try {
   // Hold the shared execution lease until the complete response body is consumed
   // and validated. Releasing it at response headers leaves a stop/parse race.
   return await fetchUnderOwnerLease(ownerUid, async () => {
     const response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),signal:request.signal});
     if (request.signal.aborted) {
       try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
       throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
     }
     if (!response.ok) {
       try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
       throw new Error(`Provider returned HTTP ${response.status}.`);
     }
     const value: unknown = await response.json();
     if (request.signal.aborted) {
       throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
     }
     throwIfAborted(parentSignal);
     if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Provider returned an invalid response.');
     return value as Record<string, any>;
   });
  } finally { request.cleanup(); }
}

function readText(provider: ModelProvider, body: Record<string, any>): string {
  const value = provider === 'google'
    ? body.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? '').join('')
    : body.choices?.[0]?.message?.content;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Vision provider returned no text content.');
  return value.trim();
}

/** Provider-neutral image understanding. Image bytes remain server-side and are never logged. */
export async function analyzeImageWithModelFallback(options: VisionAnalysisOptions): Promise<VisionAnalysisResult> {
  const prompt = options.prompt.trim();
  if (!prompt || prompt.length > 20_000) throw new Error('Vision prompt must contain 1–20000 characters.');
  if (!ALLOWED_IMAGE_TYPES.has(options.mimeType)) throw new Error('Unsupported image media type.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(options.base64Data) || options.base64Data.length > 12_000_000) {
    throw new Error('Invalid or oversized base64 image payload.');
  }
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? 30_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const routes = resolveModelRoute('vision', options.configuration);
  if (!routes.length) throw new Error('No vision provider is configured.');
  const failures: string[] = [];
  throwIfAborted(options.signal);
  for (const route of routes) {
    throwIfAborted(options.signal);
    assertHostedProviderSpendEnabled(`${route.provider}/${route.model}`);
    try {
      let body: Record<string, any>;
      if (route.provider === 'google') {
        const key = options.configuration.google?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        body = await postJson(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(route.model)}:generateContent`,
          { 'content-type': 'application/json', 'x-goog-api-key': key },
          { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: options.mimeType, data: options.base64Data } }, { text: prompt }] }] },
          timeoutMs, fetchImpl, options.signal, options.ownerUid
        );
      } else if (route.provider === 'openai') {
        const key = options.configuration.openai?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        body = await postJson('https://api.openai.com/v1/chat/completions',
          { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          { model: route.model, messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${options.mimeType};base64,${options.base64Data}` } },
          ] }] }, timeoutMs, fetchImpl, options.signal, options.ownerUid);
      } else continue;
      return { text: readText(route.provider, body), provider: route.provider, model: route.model };
    } catch (error) {
      throwIfAborted(options.signal);
      failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`);
    }
  }
  throw new Error(`All configured vision providers failed. ${failures.join(' ')}`);
}

export interface SpeechSynthesisOptions {
  text: string; voice?: string; style?: string; configuration: ProviderConfiguration;
  googleModel?: string; openaiModel?: string; timeoutMs?: number; fetchImpl?: typeof fetch; signal?: AbortSignal; ownerUid?: string;
}
export interface AudioTranscriptionOptions {
  audioBase64: string; mimeType: string; configuration: ProviderConfiguration;
  googleModel?: string; openaiModel?: string; timeoutMs?: number; fetchImpl?: typeof fetch; signal?: AbortSignal; ownerUid?: string;
}
export interface AudioResult { audioBase64: string; mimeType: string; provider: ModelProvider; model: string }
export interface TranscriptionResult { transcript: string; provider: ModelProvider; model: string }

function validAudioPayload(value: string, maximum = 20_000_000): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length > 0 && value.length <= maximum;
}

/** Provider-neutral TTS. Only returns audio actually received from a provider. */
export async function synthesizeSpeechWithModelFallback(options: SpeechSynthesisOptions): Promise<AudioResult> {
  const text = options.text.trim();
  if (!text || text.length > 8_000) throw new Error('Speech text must contain 1–8000 characters.');
  const routes = resolveModelRoute('speech', options.configuration);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? 30_000));
  const failures: string[] = [];
  throwIfAborted(options.signal);
  for (const route of routes) {
    throwIfAborted(options.signal);
    assertHostedProviderSpendEnabled(`${route.provider}/${route.model}`);
    try {
      if (route.provider === 'openai') {
        const key = options.configuration.openai?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        const model = options.openaiModel || 'gpt-4o-mini-tts';
        const request = createRequestAbort(options.signal, timeoutMs);
        try {
          return await fetchUnderOwnerLease(options.ownerUid, async () => {
            const response = await fetchImpl('https://api.openai.com/v1/audio/speech', {
              method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
              body: JSON.stringify({ model, input: text, voice: ['alloy','ash','ballad','coral','echo','fable','onyx','nova','sage','shimmer','verse','marin','cedar'].includes(options.voice || '') ? options.voice : 'onyx', instructions: options.style || 'Speak clearly in a calm, warm, confident tone.', response_format: 'mp3' }),
              signal: request.signal,
            });
            if (request.signal.aborted) {
              try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
              throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
            }
            if (!response.ok) {
              try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
              throw new Error(`Provider returned HTTP ${response.status}.`);
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (request.signal.aborted) throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
            if (!bytes.length || bytes.length > 15_000_000) throw new Error('Provider returned empty or oversized audio.');
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return { audioBase64: btoa(binary), mimeType: 'audio/mpeg', provider: 'openai', model };
          });
        } finally { request.cleanup(); }
      }
      if (route.provider === 'google') {
        const key = options.configuration.google?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        const model = options.googleModel || 'gemini-2.5-flash-preview-tts';
        const body = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          { 'content-type': 'application/json', 'x-goog-api-key': key },
          { contents: [{ parts: [{ text: `Speak in this style: ${options.style || 'calm, warm, confident'}. Text: ${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: options.voice || 'Charon' } } } } },
          timeoutMs, fetchImpl, options.signal, options.ownerUid);
        const part = body.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.inlineData?.data === 'string');
        if (!part?.inlineData?.data || !validAudioPayload(part.inlineData.data)) throw new Error('Provider returned no valid audio.');
        return { audioBase64: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/wav', provider: 'google', model };
      }
    } catch (error) { throwIfAborted(options.signal); failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`); }
  }
  throw new Error(`All configured speech providers failed. ${failures.join(' ')}`);
}

/** Transcribes uploaded audio using configured Google or OpenAI providers. */
export async function transcribeAudioWithModelFallback(options: AudioTranscriptionOptions): Promise<TranscriptionResult> {
  if (!validAudioPayload(options.audioBase64, 10_000_000)) throw new Error('Invalid or oversized audio payload.');
  if (!/^audio\/(webm|wav|mpeg|mp4|ogg|mp3|m4a|x-m4a|flac)$/i.test(options.mimeType)) throw new Error('Unsupported audio media type.');
  const routes = resolveModelRoute('transcription', options.configuration);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(60_000, Math.max(1_000, options.timeoutMs ?? 30_000));
  const failures: string[] = [];
  throwIfAborted(options.signal);
  for (const route of routes) {
    throwIfAborted(options.signal);
    assertHostedProviderSpendEnabled(`${route.provider}/${route.model}`);
    try {
      if (route.provider === 'google') {
        const key = options.configuration.google?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        const model = options.googleModel || route.model;
        const body = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          { 'content-type': 'application/json', 'x-goog-api-key': key },
          { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: options.mimeType, data: options.audioBase64 } }, { text: 'Transcribe the spoken audio accurately. Return only the transcript.' }] }] },
          timeoutMs, fetchImpl, options.signal, options.ownerUid);
        const transcript = body.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('').trim();
        if (typeof transcript !== 'string' || !transcript) throw new Error('Provider returned no transcript.');
        return { transcript, provider: 'google', model };
      }
      if (route.provider === 'openai') {
        const key = options.configuration.openai?.apiKey;
        if (!key) continue;
        if (options.ownerUid) await reserveConfiguredProviderOperation(options.ownerUid);
        else if (process.env.NODE_ENV === 'production') throw new Error('Authenticated owner identity is required for provider operation budgeting.');
        const model = options.openaiModel || 'gpt-4o-mini-transcribe';
        const bytes = Uint8Array.from(atob(options.audioBase64), c => c.charCodeAt(0));
        const extension = options.mimeType.includes('webm') ? 'webm' : options.mimeType.includes('wav') ? 'wav' : options.mimeType.includes('ogg') ? 'ogg' : options.mimeType.includes('mp4') || options.mimeType.includes('m4a') ? 'm4a' : 'mp3';
        const form = new FormData();
        form.append('model', model);
        form.append('file', new Blob([bytes], { type: options.mimeType }), `recording.${extension}`);
        const request = createRequestAbort(options.signal, timeoutMs);
        try {
          return await fetchUnderOwnerLease(options.ownerUid, async () => {
            const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: request.signal });
            if (request.signal.aborted) {
              try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
              throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
            }
            if (!response.ok) {
              try { await response.body?.cancel(); } catch { /* best-effort stream cleanup */ }
              throw new Error(`Provider returned HTTP ${response.status}.`);
            }
            const body: unknown = await response.json();
            if (request.signal.aborted) {
              throw request.signal.reason instanceof Error ? request.signal.reason : new Error('Provider request cancelled.');
            }
            throwIfAborted(options.signal);
            const transcript = body && typeof body === 'object' ? (body as any).text : undefined;
            if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('Provider returned no transcript.');
            return { transcript: transcript.trim(), provider: 'openai', model };
          });
        } finally { request.cleanup(); }
      }
    } catch (error) { throwIfAborted(options.signal); failures.push(`${route.provider}: ${error instanceof Error ? error.message : 'request failed'}`); }
  }
  throw new Error(`All configured transcription providers failed. ${failures.join(' ')}`);
}
