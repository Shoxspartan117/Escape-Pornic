import { asset } from './asset';

/** Retours sensoriels : vibration, sons synthétiques, notifications locales. */

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** À appeler depuis un geste utilisateur (iOS/Android bloquent l'audio sinon). */
export function unlockAudio(): void {
  const c = getAudioContext();
  if (c.state === 'suspended') void c.resume();
}

export function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function tone(freq: number, start: number, duration: number, volume = 0.15) {
  const c = getAudioContext();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.05);
}

export function playDetectSound(): void {
  try {
    unlockAudio();
    tone(880, 0, 0.15);
    tone(1320, 0.16, 0.15);
    tone(1760, 0.32, 0.3);
  } catch {
    /* audio indisponible */
  }
}

export function playExitSound(): void {
  try {
    unlockAudio();
    tone(660, 0, 0.15);
    tone(440, 0.16, 0.25);
  } catch {
    /* audio indisponible */
  }
}

export async function requestNotificationPermission(): Promise<void> {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* ignoré */
    }
  }
}

/** Notification locale (via le service worker si possible, requis sur Android). */
export async function notify(title: string, body: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options: NotificationOptions = { body, icon: asset('/icons/icon-192.png'), badge: asset('/icons/icon-192.png'), tag: 'nantes-ops' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* ignoré */
  }
}
