import { createApp } from 'vue'
import App from './App.vue'
import { init } from './store.js'
import './styles.css'

init()
createApp(App).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'))
}
