<script setup>
import { ref, watch } from 'vue'
// Amount field that shows thousands separators while typing and emits a plain number.
const props = defineProps({ modelValue: [Number, null], id: String, placeholder: String, autofocus: Boolean })
const emit = defineEmits(['update:modelValue'])
const fmt = n => (n == null || n === '' || Number.isNaN(n) ? '' : Number(n).toLocaleString('en-US'))
const text = ref(fmt(props.modelValue))
watch(() => props.modelValue, v => { if (parse(text.value) !== v) text.value = fmt(v) })
function parse(s) {
  const clean = String(s).replace(/[^0-9.]/g, '')
  return clean === '' ? null : Number(clean)
}
function onInput(e) {
  const n = parse(e.target.value)
  text.value = n == null ? '' : fmt(n)
  emit('update:modelValue', n)
}
</script>

<template>
  <div style="position:relative">
    <span class="faint" style="position:absolute;left:11px;top:50%;transform:translateY(-50%);font-weight:700">PKR</span>
    <input :id="id" class="input num" style="padding-left:46px" inputmode="numeric" autocomplete="off" :placeholder="placeholder" :value="text" :autofocus="autofocus" @input="onInput" />
  </div>
</template>
