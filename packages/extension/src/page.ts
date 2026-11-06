/** Extension page: binds the Start/Stop UI. Audio and CHPP come in later tasks. */
import { createBroadcastController } from './controller.js';

const startButton = document.querySelector<HTMLButtonElement>('#start');
const stopButton = document.querySelector<HTMLButtonElement>('#stop');
const statusLine = document.querySelector<HTMLElement>('#status');

let audio: AudioContext | undefined;

const controller = createBroadcastController({
  async start() {
    // Created inside the click handler, so the browser allows playback.
    audio = new AudioContext();
    await audio.resume();
  },
  async stop() {
    await audio?.close();
    audio = undefined;
  },
});

controller.subscribe((view) => {
  if (statusLine) statusLine.textContent = view.status;
  if (startButton) startButton.disabled = !view.startEnabled;
  if (stopButton) stopButton.disabled = !view.stopEnabled;
});

startButton?.addEventListener('click', () => void controller.start());
stopButton?.addEventListener('click', () => void controller.stop());
