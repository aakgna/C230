"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";

const PARTICLE_COLORS = ["var(--success)", "var(--info)", "var(--chart-1)", "var(--foreground)"];
const PARTICLE_COUNT = 14;

type Particle = { dx: number; dy: number; rot: number; color: string; delay: number };

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    // Evenly spaced around a circle with a little jitter, not a pure random scatter — reads as
    // a deliberate burst rather than noise.
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 60 + Math.random() * 50;
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 16, // slight upward bias, like it's catching air
      rot: (Math.random() - 0.5) * 520,
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      delay: Math.random() * 60,
    };
  });
}

// A brief, non-blocking confetti-burst moment — reserved for actions worth rewarding (see the
// `celebrate` flag on ActionToast's outcomes), not every success. pointer-events-none throughout
// so it never intercepts a click on whatever's underneath, and it removes itself automatically.
export function Celebration({ show, message, onDone }: { show: boolean; message: string; onDone: () => void }) {
  const [particles] = useState(makeParticles);

  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDone, 1600);
    return () => clearTimeout(timer);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center">
      <div className="relative">
        {particles.map((p, i) => (
          <span
            key={i}
            className="animate-confetti-particle absolute top-1/2 left-1/2 size-1.5 rounded-full"
            style={
              {
                backgroundColor: p.color,
                animationDelay: `${p.delay}ms`,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                "--rot": `${p.rot}deg`,
              } as React.CSSProperties
            }
          />
        ))}
        <div className="animate-celebrate-pop flex items-center gap-2 rounded-full border bg-card px-5 py-2.5 text-sm font-medium text-card-foreground shadow-lg">
          <CheckIcon className="size-4 text-success" strokeWidth={3} />
          {message}
        </div>
      </div>
    </div>
  );
}
