import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion, EASE } from '../../lib/gsapSetup';

/* Numbers are the content here, so they get the one "counting" flourish.
   Keeps tabular figures: the DOM text is rewritten each frame. */
export default function CountUp({ value, decimals = 0, prefix = '', suffix = '', duration = 1.1, className }) {
  const ref = useRef(null);
  const last = useRef(null);

  const format = num => {
    const fixed = Number.isFinite(num) ? num : 0;
    return `${prefix}${fixed.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`;
  };

  useGSAP(() => {
    const el = ref.current;
    if (!el) return undefined;

    const target = Number(value);
    if (!Number.isFinite(target)) {
      el.textContent = String(value ?? '—');
      return undefined;
    }

    if (prefersReducedMotion()) {
      el.textContent = format(target);
      last.current = target;
      return undefined;
    }

    const state = { v: last.current ?? 0 };
    const tween = gsap.to(state, {
      v: target,
      duration,
      ease: EASE.out,
      onUpdate: () => { el.textContent = format(state.v); },
      onComplete: () => { last.current = target; },
    });

    return () => tween.kill();
  }, { dependencies: [value, decimals, prefix, suffix] });

  return (
    <span ref={ref} className={className}>
      {Number.isFinite(Number(value)) ? format(Number(value)) : String(value ?? '—')}
    </span>
  );
}
