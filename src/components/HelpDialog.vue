<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)

watch(() => props.open, async (isOpen) => {
  await nextTick()
  if (!dialog.value) return
  if (isOpen && !dialog.value.open) dialog.value.showModal()
  if (!isOpen && dialog.value.open) dialog.value.close()
})

function close() {
  emit('close')
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}
</script>

<template>
  <dialog ref="dialog" class="help-dialog" aria-labelledby="helpTitle" @click="onBackdropClick" @close="close">
    <div class="dialog-header">
      <div><span class="panel-label">GOOGLE TAKEOUT</span><h2 id="helpTitle">Come recuperare i dati</h2></div>
      <button class="dialog-close-button" type="button" aria-label="Chiudi" @click="close">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      </button>
    </div>
    <ol class="takeout-steps">
      <li>Apri <a href="https://takeout.google.com/" target="_blank" rel="noopener">Google Takeout</a> e accedi con l'account in cui è sincronizzato Google Fit.</li>
      <li>Seleziona <strong>Deseleziona tutto</strong>, poi cerca e seleziona soltanto <strong>Fit</strong>.</li>
      <li>Premi <strong>Passaggio successivo</strong>, scegli l'esportazione in formato ZIP e crea l'esportazione.</li>
      <li>Quando Google invia il link, scarica il file ZIP e caricalo con il pulsante in alto a destra oppure trascinalo sull'header.</li>
    </ol>
    <p class="dialog-note">L'archivio viene aperto e analizzato direttamente in questo browser. Non viene caricato su un server. Il tempo necessario dipende dalla dimensione dell'archivio.</p>
    <div class="dialog-actions"><button class="button button-primary" type="button" @click="close">Ho capito</button></div>
  </dialog>
</template>
