// Device detection helpers.

/** Phones/tablets: primary input is a finger, not a mouse. */
export const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

export const isIOS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** True when launched from the Home Screen as an installed web app. */
export const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
