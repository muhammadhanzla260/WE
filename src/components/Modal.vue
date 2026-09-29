<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
defineProps({ title: String, eyebrow: String })
const emit = defineEmits(['close'])
const onKey = e => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @mousedown.self="emit('close')">
    <section class="modal" role="dialog" aria-modal="true" :aria-label="title">
      <div class="modal-head">
        <div>
          <div v-if="eyebrow" class="faint" style="font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:11px">{{ eyebrow }}</div>
          <h2>{{ title }}</h2>
        </div>
        <button class="icon-btn" aria-label="Close" @click="emit('close')">✕</button>
      </div>
      <slot />
    </section>
  </div>
</template>
