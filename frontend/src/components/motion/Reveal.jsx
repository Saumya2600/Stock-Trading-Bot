import { useRef } from 'react';
import { gsap, useGSAP, prefersReducedMotion, EASE } from '../../lib/gsapSetup';

/* Scroll-triggered stagger for lists and card grids.
   Uses `from` so the final state is the natural CSS state. */
export default function Reveal({
  children,
  className,
  y = 28,
  stagger = 0.07,
  duration = 0.8,
  x = 0,
  blur = true,
  start = 'top 88%',
}) {
  const root = useRef(null);

  useGSAP(() => {
    const node = root.current;
    if (!node || prefersReducedMotion()) return undefined;

    const items = Array.from(node.children);
    if (!items.length) return undefined;

    /* This app scrolls inside .main-content, not the window. ScrollTrigger
       defaults to the document scroller, so the element is resolved here —
       and dropped when the container is not actually scrollable (mobile
       switches .main-content to overflow: visible). */
    const scroller = node.closest('.main-content');
    const scrollable = scroller && getComputedStyle(scroller).overflowY !== 'visible';

    const tween = gsap.from(items, {
      y,
      x,
      opacity: 0,
      filter: blur ? 'blur(6px)' : 'none',
      duration,
      ease: EASE.out,
      stagger,
      scrollTrigger: scrollable ? { trigger: node, scroller, start, once: true } : undefined,
      onComplete: () => gsap.set(items, { clearProps: 'filter,transform' }),
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, { scope: root, dependencies: [children] });

  return <div ref={root} className={className}>{children}</div>;
}
