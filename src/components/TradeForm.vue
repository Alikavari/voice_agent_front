<template>
  <div class="flex justify-center items-center min-h-screen bg-gray-100">
    <form
      @submit.prevent="handleSubmit"
      class="w-full max-w-md bg-white p-6 rounded-2xl shadow-lg space-y-8"
    >
      <h2 class="text-xl font-semibold text-gray-800 text-center">
        Place Trade
      </h2>

      <!-- Amount -->
      <div>
        <label for="amount" class="block text-sm font-medium text-gray-700">
          Amount
        </label>
        <div class="mt-1 relative rounded-lg shadow-sm">
          <input
            v-model.number="form.amount"
            id="amount"
            type="number"
            min="0"
            class="block w-full rounded-lg border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 p-3"
            placeholder="Enter amount"
          />
          <span
            class="absolute inset-y-0 right-3 flex items-center text-gray-400"
            >$</span
          >
        </div>
      </div>

      <!-- Token Dropdown -->
      <div>
        <label for="token" class="block text-sm font-medium text-gray-700">
          Token
        </label>
        <select
          v-model="form.token"
          id="token"
          class="mt-2 w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option v-for="t in tokens" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <!-- Leverage -->
      <div>
        <div class="flex justify-between items-center">
          <label for="leverage" class="text-sm font-medium text-gray-700"
            >Leverage</label
          >
          <span class="text-sm font-semibold text-blue-600">
            x{{ form.leverage }}</span
          >
        </div>
        <input
          v-model.number="form.leverage"
          id="leverage"
          type="range"
          min="1"
          max="50"
          class="w-full mt-2 accent-blue-600 cursor-pointer"
        />
      </div>

      <!-- Position Checkboxes -->
      <div class="flex gap-4">
        <label class="flex-1 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            :checked="form.position === 'long'"
            @change="setPosition('long')"
            class="w-5 h-5 accent-green-600"
          />
          <span class="text-sm font-medium text-gray-700">Long</span>
        </label>

        <label class="flex-1 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            :checked="form.position === 'short'"
            @change="setPosition('short')"
            class="w-5 h-5 accent-red-600"
          />
          <span class="text-sm font-medium text-gray-700">Short</span>
        </label>
      </div>

      <!-- Submit -->
      <div class="mt-8">
        <button
          type="submit"
          class="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition"
        >
          Place Order
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watchEffect } from 'vue';

export interface TradeFormData {
  amount: number;
  token: string;
  leverage: number;
  position: string;
}

const props = defineProps<{
  form: TradeFormData;
  serverResponse?: Record<string, any> | null;
}>();

const form = props.form;
const tokens = ref([]); // will load dynamically

// Fetch all symbols from markets.json
onMounted(async () => {
  try {
    const res = await fetch('/markets.json'); // must be in /public or served by API
    const data = await res.json();
    tokens.value = data.map((m: { symbol: string }) => m.symbol).filter(Boolean);
  } catch (err) {
    console.error('❌ Failed to load markets.json:', err);
  }
});

// Ensure only one checkbox is active
const setPosition = (pos: 'long' | 'short') => {
  form.position = pos;
};

// Watch for backend updates
watchEffect(() => {
  if (props.serverResponse) {
    if (
      Object.hasOwn(props.serverResponse, 'token') &&
      props.serverResponse.token
    )
      form.token = props.serverResponse.token;

    if (Object.hasOwn(props.serverResponse, 'amount'))
      form.amount = Number(props.serverResponse.amount);

    if (Object.hasOwn(props.serverResponse, 'leverage'))
      form.leverage = Number(props.serverResponse.leverage);

    if (
      props.serverResponse.position === 'long' ||
      props.serverResponse.position === 'short'
    )
      form.position = props.serverResponse.position;
  } else if (!form.position) {
    form.position = 'long';
  }
});

const handleSubmit = () => {
  console.log('Trade submitted:', { ...form });
  alert(
    `Trade: ${form.amount} ${form.token} | x ${form.leverage} | ${form.position.toUpperCase()}`
  );
};
</script>
