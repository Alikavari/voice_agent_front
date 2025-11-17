<template>
  <div class="voice-recorder">
    <div class="status" :class="{ active: isWakeWindow || isStreaming }">
      <p v-if="!hasMicPermission">
        🎤 Microphone access denied — please allow mic permission in your
        browser
      </p>

      <p v-else-if="statusMessage === 'idle'">
        Say “Up Echoes” to start voice trading
      </p>

      <p v-else-if="statusMessage === 'preparing'">
        Wake-word detected — preparing voice channel…
      </p>

      <!-- 🎙️ Blinking indicator -->
      <p v-else-if="statusMessage === 'listening'">
        <span
          v-html="
            isBlinkVisible ? '🎙️ Listening &amp; transcribing…' : '&nbsp;'
          "
        ></span>
      </p>

      <p v-else-if="statusMessage === 'analyzing'">
        🔍 Analyzing your command…
      </p>
    </div>

    <div
      v-if="(!finalTranscript && partialTranscript) || finalTranscript"
      class="transcript-box"
    >
      <p v-if="!finalTranscript && partialTranscript">
        <strong>Partial:</strong> {{ partialTranscript }}
      </p>
      <p v-if="finalTranscript">
        <strong>Final:</strong> {{ finalTranscript }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { TradeFormData } from './TradeForm.vue';
import { ENV } from '../../env';

const props = defineProps<{ form: TradeFormData }>();

// ------------------------------------------------------------
// Backend
// ------------------------------------------------------------
const API_BASE = ENV.API_URL;
const TOKEN_URL = `${API_BASE}/get_token`;
const UPLOAD_URL = `${API_BASE}/upload`;

const WS_BASE =
  'wss://streaming.assemblyai.com/v3/ws' +
  '?sample_rate=16000' +
  '&encoding=pcm_s16le' +
  '&end_of_turn_confidence_threshold=0.5' +
  '&min_end_of_turn_silence_when_confident=800' +
  '&max_turn_silence=2000';

// ------------------------------------------------------------
// UI State
// ------------------------------------------------------------
const hasMicPermission = ref(true);
const statusMessage = ref<'idle' | 'preparing' | 'listening' | 'analyzing'>(
  'idle'
);
const isWakeWindow = ref(false);
const isStreaming = ref(false);
const partialTranscript = ref('');
const finalTranscript = ref('');
const isBlinkVisible = ref(true);

// timers
let blinkTimer: number | null = null;
let noSpeechTimer: number | null = null;

// handles
let ws: WebSocket | null = null;
let audioCtx: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let micStream: MediaStream | null = null;
let wakeTimer: number | null = null;
let destroyed = false;

// ------------------------------------------------------------
// ✅ FIXED: Firefox-safe microphone permission check
// ------------------------------------------------------------
async function checkMicPermission() {
  try {
    // ✅ DO NOT use navigator.permissions.query (broken on Firefox Android)
    const test = await navigator.mediaDevices.getUserMedia({ audio: true });
    test.getTracks().forEach((t) => t.stop());
    hasMicPermission.value = true;
  } catch {
    hasMicPermission.value = false;
  }
}

// ------------------------------------------------------------
// Blinking
// ------------------------------------------------------------
watch(statusMessage, (val) => {
  if (val === 'listening') {
    if (blinkTimer) clearInterval(blinkTimer);
    blinkTimer = window.setInterval(() => {
      isBlinkVisible.value = !isBlinkVisible.value;
    }, 500);
  } else {
    if (blinkTimer) clearInterval(blinkTimer);
    blinkTimer = null;
    isBlinkVisible.value = true;
  }
});

// ------------------------------------------------------------
// Wake-word events
// ------------------------------------------------------------
function resumeWakeWord() {
  window.dispatchEvent(
    new CustomEvent('wakeword-control', { detail: 'resume' })
  );
}

function onKeywordDetected(e: Event) {
  const phrase = (e as CustomEvent<string>).detail?.toLowerCase?.() ?? '';
  const isTrigger = /^\s*(up(\s+echoes)?|echoes)\b/.test(phrase);

  if (isTrigger && hasMicPermission.value) {
    startVoiceSession();
  } else if (isTrigger) {
    console.warn('⚠️ Wake-word ignored: no microphone permission');
  }
}

function startVoiceSession() {
  if (!hasMicPermission.value || isStreaming.value || isWakeWindow.value)
    return;

  resetFlags();
  isWakeWindow.value = true;
  statusMessage.value = 'preparing';

  startStreaming().catch((e) => {
    console.error('startStreaming error:', e);
    cleanupAll();
    resetFlags();
  });

  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = window.setTimeout(() => {
    if (
      !isStreaming.value &&
      !finalTranscript.value &&
      !partialTranscript.value
    ) {
      cleanupAll();
      resetFlags();
      resumeWakeWord();
    }
  }, 10_000);
}

onMounted(async () => {
  await checkMicPermission(); // ✅ Firefox-safe now
  window.addEventListener('keyword-detected', onKeywordDetected);
});

onBeforeUnmount(() => {
  window.removeEventListener('keyword-detected', onKeywordDetected);
  cleanupAll();
});

function resetFlags() {
  isWakeWindow.value = false;
  isStreaming.value = false;
  partialTranscript.value = '';
  finalTranscript.value = '';
  statusMessage.value = 'idle';
}

// ------------------------------------------------------------
// Streaming Pipeline
// ------------------------------------------------------------
async function startStreaming() {
  if (isStreaming.value) return;

  try {
    const t = await fetch(TOKEN_URL);
    if (!t.ok) throw new Error(`/get_token failed: ${t.status}`);
    const { token } = await t.json();
    if (!token) throw new Error('No token returned');

    const wsUrl = `${WS_BASE}&token=${encodeURIComponent(token)}`;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = async () => {
      statusMessage.value = 'listening';
      if (wakeTimer) clearTimeout(wakeTimer);
      startNoSpeechTimer();
      await initAudioAndPump();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'Turn' && msg.transcript) {
          resetNoSpeechTimer();

          if (msg.end_of_turn) {
            partialTranscript.value = '';
            finalTranscript.value = msg.transcript;
            statusMessage.value = 'analyzing';
            finalize(msg.transcript);
          } else if (!finalTranscript.value) {
            partialTranscript.value = msg.transcript;
          }
        }
      } catch {}
    };

    ws.onerror = (e: any) => console.error('WS error', e?.message || e);
    ws.onclose = (e) =>
      console.warn(`WS closed code=${e.code} reason=${e.reason || '(none)'}`);
  } catch (err) {
    console.error('Error getting token:', err);
    statusMessage.value = 'idle';
    resumeWakeWord();
  }
}

// no-speech watchdog
function startNoSpeechTimer() {
  clearNoSpeechTimer();
  noSpeechTimer = window.setTimeout(() => {
    console.warn('⏰ No partial transcript for 10s — aborting stream');
    cleanupAll();
    resetFlags();
    resumeWakeWord();
  }, 10_000);
}
function resetNoSpeechTimer() {
  clearNoSpeechTimer();
  startNoSpeechTimer();
}
function clearNoSpeechTimer() {
  if (noSpeechTimer) {
    clearTimeout(noSpeechTimer);
    noSpeechTimer = null;
  }
}

// ------------------------------------------------------------
// AudioWorklet + Downsampler
// ------------------------------------------------------------
async function initAudioAndPump() {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  await audioCtx.resume();

  sourceNode = audioCtx.createMediaStreamSource(micStream);

  const workletCode = `
    class DownsampleTo16k extends AudioWorkletProcessor {
      constructor() {
        super();
        this.srcRate = sampleRate;
        this.dstRate = 16000;
        this.ratio = this.srcRate / this.dstRate;
        this.buffer = [];
        this.frameSize = 1600;
      }
      process(inputs) {
        const ch0 = inputs[0] && inputs[0][0];
        if (!ch0) return true;
        const outLen = Math.floor(ch0.length / this.ratio);
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const idx = i * this.ratio;
          const i0 = Math.floor(idx);
          const i1 = Math.min(i0 + 1, ch0.length - 1);
          const frac = idx - i0;
          out[i] = ch0[i0] + (ch0[i1] - ch0[i0]) * frac;
        }
        this.buffer.push(out);
        let total = this.buffer.reduce((a, b) => a + b.length, 0);
        while (total >= this.frameSize) {
          const frame = new Float32Array(this.frameSize);
          let offset = 0;
          while (offset < this.frameSize && this.buffer.length) {
            const chunk = this.buffer[0];
            const take = Math.min(this.frameSize - offset, chunk.length);
            frame.set(chunk.subarray(0, take), offset);
            offset += take;
            if (take < chunk.length)
              this.buffer[0] = chunk.subarray(take);
            else
              this.buffer.shift();
          }
          const ab = new ArrayBuffer(this.frameSize * 2);
          const dv = new DataView(ab);
          for (let i = 0; i < this.frameSize; i++) {
            let s = Math.max(-1, Math.min(1, frame[i]));
            dv.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }
          this.port.postMessage(ab);
          total -= this.frameSize;
        }
        return true;
      }
    }
    registerProcessor('downsample-16k', DownsampleTo16k);
  `;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await audioCtx.audioWorklet.addModule(url);

  workletNode = new AudioWorkletNode(audioCtx, 'downsample-16k');
  workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(e.data);
      if (!isStreaming.value) {
        isStreaming.value = true;
        if (wakeTimer) clearTimeout(wakeTimer);
      }
    }
  };

  const g = audioCtx.createGain();
  g.gain.value = 0;
  sourceNode.connect(workletNode);
  workletNode.connect(g).connect(audioCtx.destination);
}

// ------------------------------------------------------------
// Finalization + Backend
// ------------------------------------------------------------
async function finalize(text: string) {
  cleanupAll();

  const cleaned = text
    .replace(/^\s*(up(\s+echoes)?|echoes)\b[\s,.!?]*/i, '')
    .trim();

  try {
    const resp = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: cleaned }),
    });
    const result = await resp.json();

    if (result.amount != null) props.form.amount = result.amount;
    if (result.token) props.form.token = result.token;
    if (result.leverage) props.form.leverage = result.leverage;
    if (result.position) props.form.position = result.position;
  } catch (e) {
    console.error('❌ /upload failed:', e);
  } finally {
    isWakeWindow.value = false;
    isStreaming.value = false;
    statusMessage.value = 'idle';
    resumeWakeWord();
  }
}

// ------------------------------------------------------------
// Cleanup
// ------------------------------------------------------------
function cleanupAudioOnly() {
  try {
    if (workletNode) {
      try {
        workletNode.disconnect();
      } catch {}
      workletNode = null;
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {}
      sourceNode = null;
    }
    if (micStream) {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      micStream = null;
    }
    if (audioCtx && (audioCtx as any).state !== 'closed') {
      try {
        audioCtx.close();
      } catch {}
    }
    audioCtx = null;
  } catch {}
}

function cleanupAll() {
  if (destroyed) return;
  destroyed = true;

  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, 'client-end');
  } catch {}

  ws = null;
  cleanupAudioOnly();
  clearNoSpeechTimer();

  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }

  isBlinkVisible.value = true;
  isStreaming.value = false;

  setTimeout(() => (destroyed = false), 0);
}
</script>

<style scoped>
.voice-recorder {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}
.status {
  font-weight: 600;
  min-height: 1.2em;
}
.status.active {
  color: #42b883;
}
.transcript-box {
  background: #f4f4f4;
  padding: 0.75rem;
  border-radius: 8px;
  width: 100%;
  word-wrap: break-word;
}

/* Light mode (default) */
.transcript-box {
  background: #f4f4f4;
  color: #222;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .transcript-box {
    background: #1e1e1e; /* dark gray box */
    color: #e8e8e8; /* light text */
    border: 1px solid #333; /* subtle border */
  }
}
</style>
