type StopFn = () => void;

let stopStt: StopFn | null = null;
let stopTts: StopFn | null = null;

export function cancelVoiceOutput(): void {
  stopTts?.();
  stopTts = null;
}

export function cancelVoiceInput(): void {
  stopStt?.();
  stopStt = null;
}

export function cancelAllVoice(): void {
  cancelVoiceOutput();
  cancelVoiceInput();
}

export function setActiveVoiceInput(stop: StopFn | null): void {
  if (stop) {
    cancelVoiceOutput();
    stopStt?.();
  }
  stopStt = stop;
}

export function setActiveVoiceOutput(stop: StopFn | null): void {
  if (stop) {
    cancelVoiceInput();
    stopTts?.();
  }
  stopTts = stop;
}
