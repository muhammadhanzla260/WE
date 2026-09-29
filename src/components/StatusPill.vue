<script setup>
import { STATUS } from '../lib/defaults.js'
defineProps({ status: String, text: String })
</script>

<template>
  <span class="pill" :class="status"><span class="dot" aria-hidden="true"></span>{{ STATUS[status]?.label.toUpperCase() }}<template v-if="text !== ''"> · {{ text ?? STATUS[status]?.meaning }}</template></span>
</template>
