<template>
  <div v-if="visible" class="mic-wrapper">
    <img src="/microphone.png" alt="Mic" class="mic-icon" />
    <div class="circle">
      <div class="arc"></div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: true },
});
</script>

<style scoped>
.mic-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* mic image */
.mic-icon {
  width: 44px;
  height: 44px;
  z-index: 2;
  object-fit: contain;
}

/* base circle */
.circle {
  position: absolute;
  width: 70px;
  height: 70px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* rotating arc segment */
.arc {
  position: absolute;
  width: 70px;
  height: 70px;
  border: 3px solid transparent;
  border-top-color: #000000;
  border-radius: 50%;
  animation: spinArc 1.4s linear infinite;
  box-shadow: 0 0 8px #000000;
}

@keyframes spinArc {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
