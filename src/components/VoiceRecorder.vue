<template>
  <div class="voice-recorder-container space-y-6">
    <div class="voice-recorder p-4 bg-white shadow rounded space-y-4">
      <h2 class="text-lg font-semibold">Voice Recorder (Wake-Word)</h2>

      <!-- 🔴 Recording indicator -->
      <p v-if="isRecording" class="text-red-500 font-medium blink">
        Recording...
      </p>

      <!-- 🟡 Listening indicator -->
      <p v-else-if="isListening" class="text-yellow-600 font-medium">
        Listening for your voice...
      </p>

      <!-- 🟢 Idle -->
      <p v-else class="text-gray-600">
        Say <b>"Up echoes"</b> to begin trading.
      </p>

      <!-- ⚠️ Feedback -->
      <p v-if="statusMessage" class="text-blue-500 font-medium">
        {{ statusMessage }}
      </p>

      <p v-if="uploading" class="text-gray-600 font-medium">Uploading...</p>
      <p v-if="uploadResult" class="text-green-600 font-medium">
        {{ uploadResult }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { ENV } from '../../env';
import type { TradeFormData } from './TradeForm.vue';

const props = defineProps<{ form: TradeFormData }>();

// --------------------
// 🔹 States
// --------------------
const isRecording = ref(false);
const isListening = ref(false);
const mediaRecorder = ref<MediaRecorder | null>(null);
const audioChunks = ref<BlobPart[]>([]);
const uploading = ref(false);
const uploadResult = ref<string | null>(null);
const statusMessage = ref<string | null>(null);

// --------------------
// 🔹 Audio processing vars
// --------------------
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let listenTimeout: number | null = null;
let silenceTimeout: number | null = null;

// thresholds
const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION = 2000;
const VOICE_START_THRESHOLD = 0.05;
const MAX_WAIT_FOR_VOICE = 10000;

// --------------------
// 🔹 Keyword detection
// --------------------

// --------------------
// 🔹 Wake-word control helpers
// --------------------
function pauseWakeWord() {
  console.log('🛑 Pausing wake-word detection');
  window.dispatchEvent(
    new CustomEvent('wakeword-control', { detail: 'pause' })
  );
}

function resumeWakeWord() {
  console.log('▶️ Resuming wake-word detection');
  window.dispatchEvent(
    new CustomEvent('wakeword-control', { detail: 'resume' })
  );
}
function onKeywordDetected(e: Event) {
  const cmd = (e as CustomEvent<string>).detail?.toLowerCase?.() ?? '';
  if (cmd === 'up') {
    console.log('🗣️ Wake-word detected → entering listening phase');
    startListeningForSpeech();
  }
}

onMounted(() => {
  window.addEventListener('keyword-detected', onKeywordDetected);
});

onBeforeUnmount(() => {
  window.removeEventListener('keyword-detected', onKeywordDetected);
  stopAll();
});

// --------------------
// 🔹 Step 1: Listening phase (10 s waiting window)
// --------------------
async function startListeningForSpeech() {
  if (isRecording.value || isListening.value) return;
  pauseWakeWord();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    (window as any).__sharedMicStream__ = stream;

    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    isListening.value = true;
    statusMessage.value = null;
    uploadResult.value = null;
    console.log('🎧 Listening for voice activity for up to 10 s…');

    let started = false;
    const startTime = Date.now();
    const dataArray = new Uint8Array(analyser.fftSize);

    function detectSpeech() {
      if (!isListening.value || !analyser) return;
      analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const n = (dataArray[i] - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      if (Date.now() - startTime < MAX_WAIT_FOR_VOICE)
        console.log('🎧 RMS:', rms.toFixed(3));

      if (rms > VOICE_START_THRESHOLD) {
        console.log('✅ Voice activity detected → start recording');
        started = true;
        startRecording(stream);
        return;
      }

      if (Date.now() - startTime > MAX_WAIT_FOR_VOICE && !started) {
        console.log('⏹️ No voice detected within 10 s → abort');
        stopAll();
        resumeWakeWord(); // 🔸 re-enable after abort
        statusMessage.value = 'No voice detected. Please try again.';
        return;
      }

      requestAnimationFrame(detectSpeech);
    }

    requestAnimationFrame(detectSpeech);
  } catch (err) {
    console.error('🎙️ Microphone error:', err);
    alert('Could not access microphone.');
    resumeWakeWord();
  }
}

// --------------------
// 🔹 Step 2: Start recording
// --------------------
function startRecording(stream: MediaStream) {
  isListening.value = false;
  isRecording.value = true;
  statusMessage.value = null;
  audioChunks.value = [];
  mediaRecorder.value = new MediaRecorder(stream);

  mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
  mediaRecorder.value.onstop = handleStop;
  mediaRecorder.value.start();

  console.log('🎤 Recording started.');
  monitorSilence();
}

// --------------------
// 🔹 Step 3: Monitor silence (VAD stop)
// --------------------
function monitorSilence() {
  if (!analyser) return;
  const dataArray = new Uint8Array(analyser.fftSize);
  let silenceStart = 0;

  function check() {
    if (!isRecording.value || !analyser) return;
    analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const n = (dataArray[i] - 128) / 128;
      sum += n * n;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    console.log('🎤 RMS:', rms.toFixed(3));

    if (rms < SILENCE_THRESHOLD) {
      if (silenceStart === 0) silenceStart = Date.now();
      if (Date.now() - silenceStart > SILENCE_DURATION) {
        console.log('🛑 Silence detected → stop recording');
        stopRecording();
        return;
      }
    } else {
      silenceStart = 0;
    }

    requestAnimationFrame(check);
  }

  requestAnimationFrame(check);
}

// --------------------
// 🔹 Step 4: Stop & cleanup
// --------------------
function stopRecording() {
  if (!isRecording.value || !mediaRecorder.value) return;
  isRecording.value = false;
  mediaRecorder.value.stop();
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  console.log('🎤 Recording stopped.');
  resumeWakeWord(); // 🔸 re-enable wake word after finishing recording
}

function stopAll() {
  isRecording.value = false;
  isListening.value = false;
  if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive')
    mediaRecorder.value.stop();
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (listenTimeout) clearTimeout(listenTimeout);
  if (silenceTimeout) clearTimeout(silenceTimeout);
  resumeWakeWord();
}

// --------------------
// 🔹 Step 5: Upload logic
// --------------------
async function handleStop() {
  const blob = new Blob(audioChunks.value, { type: 'audio/webm' });
  uploading.value = true;
  const formData = new FormData();
  formData.append('voice', blob, 'recording.webm');

  console.log('⬆️ Uploading recording...');
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
    stopAll();
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
