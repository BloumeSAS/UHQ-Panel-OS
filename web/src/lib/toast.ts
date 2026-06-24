/**
 * Notifications in-app — wrapper fin autour de `sonner` (shadcn/ui).
 * Garde la même API que l'ancien système maison pour ne rien casser dans
 * les pages qui appellent `toast.success(...)`, `toast.error(...)`, etc.
 */
import { toast as sonnerToast } from 'sonner';

export const toast = {
  success: (msg: string) => sonnerToast.success(msg),
  error: (msg: string) => sonnerToast.error(msg),
  info: (msg: string) => sonnerToast.info(msg),
  warning: (msg: string) => sonnerToast.warning(msg),
};
