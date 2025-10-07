<template>
  <div class="voice-recorder-container space-y-6">
    <TradeForm :form="form" @update:form="(val) => Object.assign(form, val)" />

    <div class="voice-recorder p-4 bg-white shadow rounded space-y-4">
      <h2 class="text-lg font-semibold">Voice Recorder (Wake-Word)</h2>

      <p v-if="isRecording" class="text-red-500 font-medium">Recording...</p>
      <p v-else-if="listening" class="text-blue-500 font-medium">
        Listening for wake word (say "{{ wakeWordLabel }}")...
      </p>
      <p v-else class="text-gray-600">Initializing wake word engine...</p>

      <p v-if="uploading" class="text-gray-600 font-medium">Uploading...</p>
      <p v-if="uploadResult" class="text-green-600 font-medium">
        {{ uploadResult }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue';
import TradeForm from './TradeForm.vue';
import { ENV } from '../../env.ts';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import { PorcupineWorker, BuiltInKeyword } from '@picovoice/porcupine-web';

const ACCESS_KEY = ENV.PICOVOICE_ACCESS_KEY;
const MODEL_PATH = '/porcupine_params.pv'; // must be in /public
const wakeWordLabel = 'Hey Echo'; // visible label for UI

// --- State ---
const isRecording = ref(false);
const listening = ref(false);
const uploading = ref(false);
const uploadResult = ref(null);
const audioChunks = ref([]);
const mediaRecorder = ref(null);

// --- WebAudio for silence detection ---
let audioContext = null;
let analyser = null;
let source = null;
let silenceTimeout = null;
const SILENCE_DURATION = 2000;
const SILENCE_THRESHOLD = 0.02;

// --- Trade form ---
const form = reactive({
  amount: 0,
  token: '',
  leverage: 1,
  position: 'long',
});

// --- Wake-word setup ---
let porcupine = null;
const keywordModel = {
  publicPath: '/Hey-Echo_en_wasm_v3_0_0.ppn',
  label: 'Hey Echo',
};
onMounted(async () => {
  try {
    porcupine = await PorcupineWorker.create(
      ACCESS_KEY,
      [keywordModel], // or Jarvis, or custom .ppn
      onWakeWordDetected,
      { publicPath: MODEL_PATH }
    );
    await WebVoiceProcessor.subscribe(porcupine);
    listening.value = true;
    console.log('Wake-word engine ready. Say:', wakeWordLabel);
  } catch (err) {
    console.error('Wake-word init error:', err);
  }
});

onBeforeUnmount(async () => {
  try {
    await WebVoiceProcessor.unsubscribe(porcupine);
    porcupine?.release();
  } catch {}
});

// --- Triggered when wake word detected ---
function onWakeWordDetected(keyword) {
  console.log('Wake word detected:', keyword);
  if (!isRecording.value) {
    startRecording();
  }
}

// --- Recording logic ---
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.value = new MediaRecorder(stream);
    audioChunks.value = [];
    mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
    mediaRecorder.value.onstop = handleStop;
    mediaRecorder.value.start();
    isRecording.value = true;
    uploadResult.value = null;

    // Setup silence detection
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 2048;
    monitorSilence();
  } catch (err) {
    console.error('Microphone error', err);
    alert('Microphone access failed');
  }
}

function monitorSilence() {
  const dataArray = new Uint8Array(analyser.fftSize);
  function check() {
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    if (rms < SILENCE_THRESHOLD) {
      if (!silenceTimeout) {
        silenceTimeout = setTimeout(stopRecording, SILENCE_DURATION);
      }
    } else {
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
      }
    }
    if (isRecording.value) requestAnimationFrame(check);
  }
  check();
}

function stopRecording() {
  if (!isRecording.value) return;
  mediaRecorder.value.stop();
  isRecording.value = false;
  if (silenceTimeout) clearTimeout(silenceTimeout);
  if (audioContext) audioContext.close();
}

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
    uploadResult.value = 'Upload successful!';
    if (result.amount != null) form.amount = result.amount;
    if (result.token) form.token = result.token;
    if (result.leverage) form.leverage = result.leverage;
    if (result.position) form.position = result.position;
  } catch (err) {
    console.error(err);
    uploadResult.value = 'Upload failed!';
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.voice-recorder {
  max-width: 400px;
}
</style>
