import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'uhq:audited';

/**
 * Journalise automatiquement l'appel (après SUCCÈS du handler) dans le journal d'audit :
 * `@Audited('addons.activate')`. `target` = premier paramètre de route (:id, :slug, :filename) si présent.
 * Réservé aux actions d'un utilisateur du panel (JWT) ; chaque action doit avoir sa traduction `audit.actions.<action>`.
 */
export const Audited = (action: string) => SetMetadata(AUDITED_KEY, action);
