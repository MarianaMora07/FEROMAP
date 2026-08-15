import { createSignal, onCleanup } from 'solid-js';

export function useGenerateButtonVisibility() {
  const [formGenerateInView, setFormGenerateInView] = createSignal(false);
  let observer: IntersectionObserver | undefined;

  const setGenerateAnchorRef = (element: HTMLDivElement | undefined) => {
    observer?.disconnect();
    observer = undefined;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setFormGenerateInView(false);
      return;
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        setFormGenerateInView(entry?.isIntersecting ?? false);
      },
      { threshold: 0.35, rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(element);
  };

  onCleanup(() => observer?.disconnect());

  const showStickyGenerate = () => !formGenerateInView();

  return { formGenerateInView, showStickyGenerate, setGenerateAnchorRef };
}
