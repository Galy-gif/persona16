'use client';

import { useEffect } from 'react';

const MOTION_KEY = 'persona16.motion.reduced';

export function MotionPreference() {
  useEffect(() => {
    function applyPreference() {
      document.documentElement.dataset.reduceMotion = String(localStorage.getItem(MOTION_KEY) === 'true');
    }

    applyPreference();
    window.addEventListener('storage', applyPreference);
    return () => window.removeEventListener('storage', applyPreference);
  }, []);

  return null;
}
