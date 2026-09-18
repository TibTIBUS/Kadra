import { useEffect, useState } from 'react';

/** S'abonne à une media query CSS depuis React. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Largeur en dessous de laquelle l'éditeur passe en disposition tactile. */
export const MOBILE_QUERY = '(max-width: 900px)';
