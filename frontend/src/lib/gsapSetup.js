import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/* One easing vocabulary for the whole app. Expo-out for arrivals,
   power for reverses, no elastic — a terminal that boings reads as a toy. */
export const EASE = {
  out: 'expo.out',
  inOut: 'power3.inOut',
  soft: 'power2.out',
};

export const DUR = {
  fast: 0.35,
  base: 0.7,
  slow: 1.1,
};

/* OS preference wins. `?motion=full` / `?motion=reduce` exist so the
   animation path can be checked on a machine that has reduce switched on. */
export const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return false;

  const override = new URLSearchParams(window.location.search).get('motion');
  if (override === 'full') return false;
  if (override === 'reduce') return true;

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/* Shared "appearance" state: transform + blur only, never opacity on a
   full-page container — a paused ticker must not leave the page blank. */
export const appearFrom = { y: 22, filter: 'blur(12px)', scale: 0.994 };
export const appearTo = { y: 0, filter: 'blur(0px)', scale: 1 };

export { gsap, ScrollTrigger, useGSAP };
