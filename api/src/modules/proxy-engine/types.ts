import { Socket } from 'net';
import type { BackendProxy as DbBackendProxy } from '@prisma/client';

/**
 * Generic shape understood by the engine. Both the real Prisma model and the
 * synthetic `FallbackProxy` ({ id: "fallback" }) implement this.
 */
export interface UpstreamProxy {
  id: string;
  url: string;
  protocol: string; // "http" | "socks4" | "socks5"
  ip: string;
  port: number;
  /** Embedded creds (residential fallback only) "user:pass" */
  auth?: string | null;
  country?: string | null;
  isWorking?: boolean;
  pool?: string | null;
}

export type DbProxy = DbBackendProxy;

export interface UpstreamStreams {
  socket: Socket;
}

export interface ParsedHttpRequest {
  method: string;
  path: string;
  protocol: string;
  headers: string[];
  buffered: Buffer; // raw bytes consumed beyond the first chunk (kept for replay)
}

export interface SessionRecord {
  proxyId: string;
  expiresAt: number; // ms epoch
}

export const RACE_TIMEOUT_DEFAULT_MS = 1500;
export const TIMEOUT_DEFAULT_MS = 3000;
export const NUM_RACERS = 5;
