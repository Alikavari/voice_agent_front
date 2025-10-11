<template>
  <div class="container">
    <!-- <p id="statusBar" class="text-center">
      {{ status }}
    </p> -->

    <div id="waveformWrapper" class="row">
      <div class="col">
        <div id="waveform" class="text-center"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import visualizer from 'visualizer.js';

const status = ref('Allow microphone access to record a keyword'); // 👈 add this

onMounted(() => {
  (window as any).visualizer = visualizer;
  const globalScripts = [
    '/lib/jquery-3.3.1.min.js',
    '/lib/tfjs/tf.min.js',
    '/lib/meyda.js',

    '/common/baseController.js',
    '/common/config.js',
    '/common/util.js',
    '/models/honkling/RES8_NARROW.js',
    '/models/honkling/RES8_NARROW_40.js',
    '/models/honkling/RES8_NARROW_80.js',
    '/models/honkling/RES8.js',
    '/models/honkling/RES8_40.js',
    '/models/honkling/RES8_80.js',
    '/common/micAudioProcessor.js',
    '/common/offlineAudioProcessor.js',
    '/common/SpeechResModel.js',
    '/controller/homeController.js',
  ];

  globalScripts.forEach((src) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    document.body.appendChild(s);
  });
});
</script>

<style>
#waveform canvas {
  display: none !important;
}
</style>
