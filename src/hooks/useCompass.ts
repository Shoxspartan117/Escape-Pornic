import { useCallback, useEffect, useState } from 'react';

type CompassPermission = 'unknown' | 'granted' | 'denied';

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

type IOSDeviceOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Boussole temps réel (cap en degrés, 0 = nord). `request()` doit être appelé depuis un geste (iOS). */
export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [permission, setPermission] = useState<CompassPermission>('unknown');

  const request = useCallback(async () => {
    if (!('DeviceOrientationEvent' in window)) {
      setPermission('denied');
      return;
    }
    const DOE = window.DeviceOrientationEvent as IOSDeviceOrientation;
    if (typeof DOE.requestPermission === 'function') {
      try {
        setPermission((await DOE.requestPermission()) === 'granted' ? 'granted' : 'denied');
      } catch {
        setPermission('denied');
      }
    } else {
      setPermission('granted');
    }
  }, []);

  useEffect(() => {
    if (permission !== 'granted') return;
    const handler = (e: Event) => {
      const ev = e as IOSOrientationEvent;
      let value: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number') {
        value = ev.webkitCompassHeading; // iOS : déjà relatif au nord magnétique
      } else if (ev.alpha !== null && (ev.absolute || e.type === 'deviceorientationabsolute')) {
        value = (360 - ev.alpha) % 360; // Android : alpha absolu, sens anti-horaire
      }
      if (value !== null) setHeading(Math.round(value));
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, [permission]);

  return { heading, permission, request };
}
