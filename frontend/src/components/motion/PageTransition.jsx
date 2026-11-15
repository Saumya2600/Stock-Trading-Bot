import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, useGSAP, prefersReducedMotion, EASE, appearFrom, appearTo } from '../../lib/gsapSetup';

/* Route-level arrival: content is always visible by default, GSAP only
   moves and de-blurs it. Depth without a fade-to-nothing. */
export default function PageTransition({ children }) {
  const root = useRef(null);
  const { pathname } = useLocation();

  useGSAP(() => {
    if (prefersReducedMotion() || !root.current) return undefined;

    const tl = gsap.timeline({
      defaults: { ease: EASE.out },
      onComplete: () => gsap.set(root.current, { clearProps: 'transform,filter' }),
    });

    tl.fromTo(root.current, appearFrom, { ...appearTo, duration: 0.85 });

    // Each direct block settles in behind the page, capped so nothing waits.
    const blocks = root.current.querySelectorAll(':scope > * > *');
    if (blocks.length) {
      tl.from(blocks, {
        y: 26,
        opacity: 0,
        duration: 0.75,
        stagger: { each: 0.055, from: 'start', amount: 0.3 },
      }, 0.08);
    }

    return () => tl.kill();
  }, { scope: root, dependencies: [pathname] });

  return (
    <div ref={root} key={pathname}>
      {children}
    </div>
  );
}
