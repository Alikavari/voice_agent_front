<template>
  <div class="voice-recorder-container space-y-6">
    <!-- TradeForm now controlled by VoiceRecorder -->
    <TradeForm :form="form" @update:form="(val) => Object.assign(form, val)" />

    <div class="voice-recorder p-4 bg-white shadow rounded space-y-4">
      <h2 class="text-lg font-semibold">Record Voice</h2>

      <p v-if="isRecording" class="text-red-500 font-medium">Recording...</p>
      <p v-else class="text-gray-600">Press start to record your voice</p>

      <div class="flex space-x-4">
        <button
          class="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded shadow"
          :disabled="isRecording"
          @click="startRecording"
        >
          Start Recording
        </button>
      </div>

      <p v-if="uploading" class="text-gray-600 font-medium">Uploading...</p>
      <p v-if="uploadResult" class="text-green-600 font-medium">
        {{ uploadResult }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import TradeForm from './TradeForm.vue';
import { ENV } from '../../env.ts';

const isRecording = ref(false);
const mediaRecorder = ref(null);
const audioChunks = ref([]);
const uploading = ref(false);
const uploadResult = ref(null);

// WebAudio stuff for VAD
let audioContext = null;
let analyser = null;
let source = null;
let silenceTimeout = null;
const SILENCE_DURATION = 3000; // ms
const SILENCE_THRESHOLD = 0.02; // amplitude RMS threshold

// Form state controlled by VoiceRecorder
const form = reactive({
  amount: 0,
  token: '',
  leverage: 1,
  position: 'long',
});

const startRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.value = new MediaRecorder(stream);
    audioChunks.value = [];

    mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
    mediaRecorder.value.onstop = handleStop;

    mediaRecorder.value.start();
    isRecording.value = true;
    uploadResult.value = null;

    // Setup Web Audio for silence detection
    audioContext = new AudioContext();
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 2048;

    monitorSilence();
  } catch (err) {
    console.error('Error accessing microphone', err);
    alert('Could not access microphone. Check permissions.');
  }
};

function monitorSilence() {
  const dataArray = new Uint8Array(analyser.fftSize);

  function check() {
    analyser.getByteTimeDomainData(dataArray);

    // Calculate normalized RMS
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);

    if (rms < SILENCE_THRESHOLD) {
      if (!silenceTimeout) {
        silenceTimeout = setTimeout(() => stopRecording(), SILENCE_DURATION);
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

  // Upload
  uploading.value = true;
  const formData = new FormData();
  formData.append('voice', blob, 'recording.webm');

  try {
    const resp = await fetch(ENV.API_URL + '/upload', {
      method: 'POST',
      body: formData,
    });
    const result = await resp.json();
    console.log('the backend result: ', result);
    uploadResult.value = 'Upload successful!';

    // Update TradeForm fields based on server response
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
