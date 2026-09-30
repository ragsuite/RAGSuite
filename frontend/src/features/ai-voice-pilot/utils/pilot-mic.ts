/**
 * Probe for a usable microphone before starting the Pilot agent session.
 * Distinguishes missing hardware from permission denial.
 */

export type PilotMicProbeResult = 'ok' | 'not_found' | 'denied' | 'unsupported';

function classifyGetUserMediaError(err: unknown, hadAudioInput: boolean): PilotMicProbeResult {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: string }).name)
      : '';
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    message.includes('permission') ||
    message.includes('not allowed')
  ) {
    return 'denied';
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    message.includes('not found') ||
    message.includes('no device') ||
    message.includes('could not start audio source')
  ) {
    return 'not_found';
  }

  // No labeled audioinput devices → treat as missing hardware.
  if (!hadAudioInput) return 'not_found';
  return 'not_found';
}

/**
 * Enumerate + brief getUserMedia check. Always stops tracks before returning.
 */
export async function probePilotMicrophone(): Promise<PilotMicProbeResult> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'unsupported';
  }

  let hadAudioInput = false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    hadAudioInput = devices.some((d) => d.kind === 'audioinput');
  } catch {
    /* enumerate can fail before permission — continue to getUserMedia */
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    // Confirm at least one live audio track.
    const live = stream.getAudioTracks().some((t) => t.readyState === 'live');
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (!live) return 'not_found';

    // After permission, re-check device list (labels become available).
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((d) => d.kind === 'audioinput')) return 'not_found';
    } catch {
      /* ignore */
    }
    return 'ok';
  } catch (err) {
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
    }
    return classifyGetUserMediaError(err, hadAudioInput);
  }
}

/** Map Web Speech / media error codes to probe-style results. */
export function classifySpeechMicError(code: string): PilotMicProbeResult | null {
  const c = (code || '').toLowerCase();
  if (c === 'not-allowed' || c === 'service-not-allowed') return 'denied';
  if (c === 'audio-capture' || c === 'not-found') return 'not_found';
  return null;
}
