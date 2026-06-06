import { SetMetadata } from '@nestjs/common';

export const SCOPES_KEY = 'scopes';

/** Restreint une route API Key aux scopes donnés. */
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);
