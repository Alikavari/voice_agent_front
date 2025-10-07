<template>
  <div>
    <h2>Wake-word demo</h2>
    <div v-if="!listening && !recording">
      <button @click="startWakeListening">Start Listening</button>
    </div>
    <div v-if="listening && !recording">
      <p>Listening for wake word…</p>
    </div>
    <div v-if="recording">
      <p>Recording…</p>
      <button @click="stopRecording">Stop Recording</button>
    </div>
    <div v-if="audioUrl">
      <h3>Recorded Audio:</h3>
      <audio :src="audioUrl" controls></audio>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { WebVoiceProcessor } from '@picovoice/web-voice-processor';
import { PorcupineWorker, BuiltInKeyword } from '@picovoice/porcupine-web';

const ACCESS_KEY = 'GC4mnre1sNes8VV1Qyia59bX2tDJLE0RStQVVEDhV5Z6rk1hoEAr3w==';
const MODEL_PATH = '/porcupine_params.pv'; // or use base64

const listening = ref(false);
const recording = ref(false);
const audioUrl = ref(null);

let porcupine = null;
let mediaRecorder = null;
let recordedChunks = [];

async function startWakeListening() {
  // initialize porcupine
  porcupine = await PorcupineWorker.create(
    ACCESS_KEY,
    BuiltInKeyword.Alexa, // or custom model config
    (detection) => {
      console.log('Wake word detected:', detection);
      onWakeWordDetected();
    },
    {
      publicPath: MODEL_PATH,
      // or base64: ...
    }
  );

  await WebVoiceProcessor.subscribe(porcupine);
  listening.value = true;
}

function onWakeWordDetected() {
  // when wake word triggers, start recording
  if (recording.value) return;

  console.log('Wake word triggered recording!');
  recording.value = true;

  startRecordingAudio();
}

async function startRecordingAudio() {
  // get mic stream
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  recordedChunks = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    audioUrl.value = url;
    console.log('Recording complete, blob:', blob);
  };
  mediaRecorder.start();
}

function stopRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.stop();
  recording.value = false;
  // Optionally continue listening for wake word, or stop listening:
  // WebVoiceProcessor.unsubscribe(porcupine), porcupine.release(), etc.
}
</script>
