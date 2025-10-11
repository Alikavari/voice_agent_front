<template>
  <div class="voice-recorder-container space-y-6">
    <!-- 🔹 Trade form controlled by VoiceRecorder -->

    <div class="voice-recorder p-4 bg-white shadow rounded space-y-4">
      <h2 class="text-lg font-semibold">Voice Recorder (Wake-Word)</h2>

      <p v-if="isRecording" class="text-red-500 font-medium blink">
        Recording...
      </p>

      <p v-else class="text-gray-600">Say <b>"GO"</b> to begin trading.</p>

      <p v-if="uploading" class="text-gray-600 font-medium">Uploading...</p>
      <p v-if="uploadResult" class="text-green-600 font-medium">
        {{ uploadResult }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ENV } from '../../env'; // ← must export { API_URL } or ENV.API_URL
import type { TradeFormData } from './TradeForm.vue';

// --------------------
// 🔹 Component Props
// --------------------
const props = defineProps<{
  form: TradeFormData;
}>();

// --------------------
// 🔹 Recorder state
// --------------------
const isRecording = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const audioChunks = ref<BlobPart[]>([]);
const uploading = ref(false);
const uploadResult = ref<string | null>(null);

// --------------------
// 🔹 VAD (silence detect)
// --------------------
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let silenceTimeout: number | null = null;
const SILENCE_DURATION = 2000; // ms
const SILENCE_THRESHOLD = 0.02; // amplitude RMS threshold

// --------------------
// 🔹 “GO” / “STOP” hooks
// --------------------
let lastStartAt = 0;
const MIN_RETRIGGER_MS = 1500;

function onKeywordDetected(e: Event) {
  const command = (e as CustomEvent<string>).detail?.toLowerCase?.() ?? '';
  console.log('🗣️ keyword detected:', command);

  if (command === 'go') {
    const now = Date.now();
    if (!isRecording.value && now - lastStartAt > MIN_RETRIGGER_MS) {
      lastStartAt = now;
      console.log("🎤 Starting recording because 'GO' detected");
      startRecording();
    }
  }
}

// --------------------
// 🔹 Lifecycle hooks
// --------------------
onMounted(() => {
  window.addEventListener('keyword-detected', onKeywordDetected);
});

onBeforeUnmount(() => {
  window.removeEventListener('keyword-detected', onKeywordDetected);
});

// --------------------
// 🔹 Recording logic
// --------------------
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    (window as any).__sharedMicStream__ = stream;
    mediaRecorder.value = new MediaRecorder(stream);
    audioChunks.value = [];

    mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
    mediaRecorder.value.onstop = handleStop;

    mediaRecorder.value.start();
    isRecording.value = true;
    uploadResult.value = null;

    // --- Setup VAD ---
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 2048;

    monitorSilence();
  } catch (err) {
    console.error('🎙️ Microphone error:', err);
    alert('Could not access microphone. Check permissions.');
  }
}

// --------------------
// 🔹 Improved VAD logic
// --------------------
function monitorSilence() {
  if (!analyser) return;
  const dataArray = new Uint8Array(analyser.fftSize);

  let silenceStart = 0;
  const minSilence = SILENCE_DURATION; // how long RMS must stay below threshold
  const warmup = 1000; // ms before we even consider stopping (ignore startup silence)
  const startTime = Date.now();

  function check() {
    if (!isRecording.value || !analyser) return;
    analyser.getByteTimeDomainData(dataArray);

    // Compute RMS (root mean square) amplitude
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    const now = Date.now();

    // Ignore silence detection during warmup
    if (now - startTime < warmup) {
      requestAnimationFrame(check);
      return;
    }

    if (rms < SILENCE_THRESHOLD) {
      if (silenceStart === 0) silenceStart = now;
      const silenceDuration = now - silenceStart;
      if (silenceDuration > minSilence) {
        console.log(
          `🛑 VAD: Detected ${silenceDuration} ms silence → stopping`
        );
        stopRecording();
        return; // stop loop
      }
    } else {
      silenceStart = 0; // reset timer if voice resumes
    }

    requestAnimationFrame(check);
  }

  requestAnimationFrame(check);
}

function stopRecording() {
  if (!isRecording.value || !mediaRecorder.value) return;

  mediaRecorder.value.stop();
  isRecording.value = false;

  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

// --------------------
// 🔹 Upload logic
// --------------------
async function handleStop() {
  const blob = new Blob(audioChunks.value, { type: 'audio/webm' });

  uploading.value = true;
  const formData = new FormData();
  formData.append('voice', blob, 'recording.webm');

  try {
    const resp = await fetch(ENV.API_URL + '/upload', {
      method: 'POST',
      body: formData,
    });
    const result = await resp.json();
    console.log('✅ Server response:', result);

    uploadResult.value = 'Upload successful!';
    if (result.amount != null) props.form.amount = result.amount;
    if (result.token) props.form.token = result.token;
    if (result.leverage) props.form.leverage = result.leverage;
    if (result.position) props.form.position = result.position;
  } catch (err) {
    console.error('❌ Upload failed:', err);
    uploadResult.value = 'Upload failed!';
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.voice-recorder {
  max-width: 420px;
  margin: auto;
}

@keyframes blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

.blink {
  animation: blink 1s step-start infinite;
}
</style>