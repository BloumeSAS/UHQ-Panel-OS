/**
 * AddonTopbarSlots — Dropdown déclenché par la zone email/rôle du topbar.
 *
 * Si des addons déclarent des slots "topbar", le clic sur l'email ouvre
 * un menu listant ces raccourcis. Sans slots, la zone email est non-cliquable.
 */

import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Puzzle, ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TopbarSlotItem {
  label: string;
  icon?: string;
  to: string;
  addonName: string;
}

function SlotIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = name ? ((LucideIcons as any)[name] ?? Puzzle) : Puzzle;
  return <Icon className={cn('h-4 w-4', className)} />;
}

interface Props {
  slots: TopbarSlotItem[];
  email?: string;
  role?: string;
}

export function AddonTopbarSlots({ slots, email, role }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasSlots = slots.length > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const trigger = (
    <div className="hidden text-right sm:block">
      <div className="text-sm font-medium leading-tight">{email}</div>
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs text-muted-foreground">{role}</span>
        {hasSlots && (
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground transition-transform duration-150',
              open && 'rotate-180',
            )}
          />
        )}
      </div>
    </div>
  );

  if (!hasSlots) return trigger;

  return (
    <div ref={ref} className="relative hidden sm:block">
      {/* Déclencheur : zone email/rôle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'rounded-md px-2 py-1 text-right transition-colors hover:bg-accent',
          open && 'bg-accent',
        )}
        aria-expanded={open}
        aria-label="Extensions"
      >
        {trigger}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 min-w-52 rounded-lg border bg-popover text-popover-foreground shadow-lg ring-1 ring-black/5"
          role="menu"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Puzzle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Extensions
            </span>
          </div>

          <div className="p-1" role="group">
            {slots.map((slot, i) => (
              <Link
                key={i}
                to={slot.to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
              >
                <SlotIcon name={slot.icon} className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 truncate">{slot.label}</span>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                  {slot.addonName}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
