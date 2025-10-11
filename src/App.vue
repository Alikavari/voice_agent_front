<script setup lang="ts">
import { reactive } from 'vue';
import VoiceRecorder from './components/VoiceRecorder.vue';
import WakeWord from './components/WakeWord.vue';
import TradeForm, { type TradeFormData } from './components/TradeForm.vue';

const form = reactive<TradeFormData>({
  amount: 0,
  token: '',
  leverage: 1,
  position: 'long',
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <TradeForm :form="form" />
    <WakeWord />
    <VoiceRecorder :form="form" />
  </div>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
