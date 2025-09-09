<script setup lang="ts">
// import FormComponent from './components/TradeForm.vue';
import VoiceRecorder from './components/VoiceRecorder.vue';
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100">
    <!-- <FormComponent /> -->
    <VoiceRecorder />
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
