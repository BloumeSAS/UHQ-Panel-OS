import { createContext, useContext, useEffect, useState } from 'react';

type Density = 'comfortable' | 'compact';
const Ctx = createContext<{ density: Density; toggle: () => void } | null>(null);

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensity] = useState<Density>(
    () => (localStorage.getItem('uhq_density') as Density) || 'comfortable',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('density-compact', density === 'compact');
    localStorage.setItem('uhq_density', density);
  }, [density]);

  return (
    <Ctx.Provider value={{ density, toggle: () => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact')) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDensity() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDensity must be used within DensityProvider');
  return ctx;
}
