<script setup>
import { ref } from 'vue'
import { state } from '../store.js'

const email = ref('')
const password = ref('')
const mode = ref('in')
const error = ref('')
const info = ref('')
const busy = ref(false)

async function submit() {
  error.value = info.value = ''
  busy.value = true
  const fn = mode.value === 'in' ? state.adapter.signIn : state.adapter.signUp
  const { data, error: err } = await fn(email.value, password.value)
  busy.value = false
  if (err) error.value = err.message
  else if (mode.value === 'up' && !data.session) info.value = 'Check your email to confirm your account, then sign in.'
}
</script>

<template>
  <div class="page" style="max-width:420px;margin:8vh auto 0">
    <div class="brand" style="padding:0;margin-bottom:22px"><span class="brand-mark">♥</span>Wedding Fund</div>
    <form class="card stack" @submit.prevent="submit">
      <h1 style="font-size:22px">{{ mode === 'in' ? 'Sign in' : 'Create account' }}</h1>
      <div class="field"><label for="l_email">Email</label><input id="l_email" v-model="email" class="input" type="email" required autocomplete="email" /></div>
      <div class="field"><label for="l_pw">Password</label><input id="l_pw" v-model="password" class="input" type="password" required minlength="6" :autocomplete="mode === 'in' ? 'current-password' : 'new-password'" /></div>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="info" class="small">{{ info }}</p>
      <button class="btn primary" :disabled="busy" style="justify-content:center">{{ mode === 'in' ? 'Sign in' : 'Create account' }}</button>
      <button type="button" class="btn ghost sm" style="justify-content:center" @click="mode = mode === 'in' ? 'up' : 'in'">
        {{ mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in' }}
      </button>
    </form>
  </div>
</template>
