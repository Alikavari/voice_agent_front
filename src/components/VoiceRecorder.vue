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

        <button
          class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded shadow"
          :disabled="!isRecording"
          @click="stopRecording"
        >
          Stop & Upload
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

// Form state controlled by VoiceRecorder
const form = reactive({
  amount: 0,
  token: '',
  leverage: 1,
  position: 'long',
});

const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder.value = new MediaRecorder(stream);
  audioChunks.value = [];

  mediaRecorder.value.ondataavailable = (e) => audioChunks.value.push(e.data);
  mediaRecorder.value.start();
  isRecording.value = true;
  uploadResult.value = null;
};

const stopRecording = async () => {
  return new Promise((resolve) => {
    mediaRecorder.value.onstop = async () => {
      isRecording.value = false;

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
        console.log('the position: ', result.position);
        uploadResult.value = 'Upload successful!';

        // Example: update TradeForm fields based on server response
        // Assume server returns { amount: 10, token: 'BTC', leverage: 5, position: 'long' }
        if (result.amount) form.amount = result.amount;
        if (result.token) form.token = result.token;
        if (result.leverage) form.leverage = result.leverage;
        if (result.position) form.position = result.position;
      } catch (err) {
        console.error(err);
        uploadResult.value = 'Upload failed!';
      } finally {
        uploading.value = false;
      }

      resolve();
    };
    mediaRecorder.value.stop();
  });
};
</script>

<style scoped>
.voice-recorder {
  max-width: 400px;
}
</style>
