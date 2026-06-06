/**
 * Simple in-app toast system using a global event bus.
 * No external dependencies — works with a React component to render toasts.
 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastEvent {
  id: string;
  type: ToastType;
  message: string;
}

const listeners: ((e: ToastEvent) => void)[] = [];

function emit(type: ToastType, message: string) {
  const event: ToastEvent = { id: Math.random().toString(36).slice(2), type, message };
  listeners.forEach((l) => l(event));
}

export const toast = {
  success: (msg: string) => emit('success', msg),
  error: (msg: string) => emit('error', msg),
  info: (msg: string) => emit('info', msg),
  warning: (msg: string) => emit('warning', msg),
};

export function subscribeToasts(fn: (e: ToastEvent) => void) {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export type { ToastEvent, ToastType };
