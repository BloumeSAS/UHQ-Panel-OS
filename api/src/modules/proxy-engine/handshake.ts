import { Socket, connect as netConnect, isIP } from 'net';
import { promises as dnsPromises } from 'dns';
import { UpstreamProxy } from './types';

/**
 * Open a raw TCP socket with a connect timeout. Equivalent of
 * `asyncio.wait_for(asyncio.open_connection(...), timeout)`.
 */
export function tcpConnect(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy(new Error(`Connect timeout to ${host}:${port}`));
      reject(new Error(`Connect timeout to ${host}:${port}`));
    }, timeoutMs);

    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(socket);
    });
    socket.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try {
        socket.destroy();
      } catch {
        /* swallow */
      }
      reject(err);
    });
  });
}

/**
 * Read from socket until a delimiter is encountered or `maxBytes` is reached.
 * Returns the buffer consumed (delimiter included).
 *
 * Important: `socket.unshift()` synchronously re-emits 'data'. We therefore
 * MUST detach our own `data` listener *before* calling unshift, otherwise we
 * recursively re-enter `onData`, duplicate the buffer on every iteration,
 * and crash with `RangeError [ERR_OUT_OF_RANGE]` once `Buffer.concat`
 * exceeds the 4 GB ceiling.
 */
export function readUntil(
  socket: Socket,
  delimiter: Buffer,
  timeoutMs: number,
  maxBytes = 64 * 1024,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let settled = false;
    let t: NodeJS.Timeout;

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
      clearTimeout(t);
      // Pause BEFORE any unshift: while flowing with an empty internal buffer,
      // Node re-emits an unshifted chunk synchronously — but our 'data' listener
      // is already gone, so the bytes would be dropped and the NEXT readUntil
      // would hang until timeout. Pausing forces the leftover (and anything that
      // arrives before the next read attaches its listener) to be buffered; the
      // next `socket.on('data')` resumes the flow and delivers it intact.
      socket.pause();
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onData = (chunk: Buffer) => {
      if (settled) return; // defensive: should never fire after cleanup
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf(delimiter);
      if (idx !== -1) {
        settled = true;
        const consumed = buf.subarray(0, idx + delimiter.length);
        const leftover = buf.subarray(idx + delimiter.length);
        // Detach BEFORE unshift to break the re-entrant 'data' emit chain.
        cleanup();
        if (leftover.length > 0) socket.unshift(leftover);
        resolve(consumed);
      } else if (buf.length > maxBytes) {
        fail(new Error('readUntil exceeded maxBytes without delimiter'));
      }
    };
    const onError = (e: Error) => fail(e);
    const onEnd = () => fail(new Error('Socket ended before delimiter'));

    t = setTimeout(() => fail(new Error('readUntil timeout')), timeoutMs);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
    // The previous read paused the socket (see cleanup). Adding a 'data'
    // listener does NOT auto-resume a socket whose `flowing` is already false,
    // so the unshifted leftover (and any buffered bytes) would never be
    // delivered. Resume explicitly to flush them into onData.
    socket.resume();
  });
}

/**
 * Read exactly `n` bytes from the socket. Same re-entrance caveat as
 * `readUntil`: detach the data listener before calling `unshift()` so the
 * synchronous 'data' re-emit doesn't recurse into us.
 */
export function readExactly(
  socket: Socket,
  n: number,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    let settled = false;
    let t: NodeJS.Timeout;

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
      clearTimeout(t);
      // See readUntil: pause before unshift so the leftover isn't emitted into
      // the void while flowing and lost before the next read attaches.
      socket.pause();
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    const onData = (chunk: Buffer) => {
      if (settled) return;
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= n) {
        settled = true;
        const consumed = buf.subarray(0, n);
        const leftover = buf.subarray(n);
        // Detach BEFORE unshift to avoid re-entry.
        cleanup();
        if (leftover.length > 0) socket.unshift(leftover);
        resolve(consumed);
      }
    };
    const onError = (e: Error) => fail(e);
    const onEnd = () =>
      fail(new Error(`Incomplete read: got ${buf.length}/${n} bytes`));

    t = setTimeout(
      () => fail(new Error(`readExactly timeout (${buf.length}/${n})`)),
      timeoutMs,
    );
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
    // See readUntil: explicitly resume in case a prior read left the socket paused.
    socket.resume();
  });
}

function writeAndDrain(socket: Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = socket.write(data, (err) => (err ? reject(err) : resolve()));
    if (!ok) socket.once('drain', () => resolve());
  });
}

/**
 * Resolve host to IPv4 — used by SOCKS4 / SOCKS5 to choose between IP and
 * domain-name addressing. Best-effort: failure → caller falls back to
 * SOCKS4a (0.0.0.1 + domain) or SOCKS5 ATYP=0x03.
 */
async function resolve4(host: string): Promise<string | null> {
  if (isIP(host) === 4) return host;
  try {
    const { address } = await dnsPromises.lookup(host, { family: 4 });
    return address;
  } catch {
    return null;
  }
}

function ipToBuffer(ip: string): Buffer {
  const parts = ip.split('.').map((n) => parseInt(n, 10));
  return Buffer.from(parts);
}

/**
 * Perform the protocol-specific handshake to tell the upstream proxy
 * "please tunnel me to target_host_port".
 *
 * Mirrors `_perform_handshake` in server.py — HTTP CONNECT / SOCKS4 / SOCKS4a / SOCKS5.
 * Throws on failure; the caller catches `"CODE 400"` / `"CODE 407"` strings to
 * trigger permanent blacklisting (HTTP) or generic dead-mark (SOCKS).
 */
export async function performHandshake(
  socket: Socket,
  upstream: UpstreamProxy,
  targetHostPort: string,
  timeoutMs: number,
): Promise<void> {
  const protocol = (upstream.protocol || 'http').toLowerCase();

  try {
    if (protocol === 'http') {
      let authHeader = '';
      if (upstream.auth) {
        const b64 = Buffer.from(upstream.auth, 'utf8').toString('base64');
        authHeader = `Proxy-Authorization: Basic ${b64}\r\n`;
      }
      // Le header `Host` est requis par HTTP/1.1 : beaucoup de passerelles
      // commerciales (ex. proxies résidentiels rotatifs) rejettent un CONNECT
      // qui en est dépourvu. On ajoute aussi User-Agent + Proxy-Connection pour
      // imiter un client standard (curl/navigateur) et maximiser la compat.
      const req =
        `CONNECT ${targetHostPort} HTTP/1.1\r\n` +
        `Host: ${targetHostPort}\r\n` +
        authHeader +
        `User-Agent: uhq-proxy\r\n` +
        `Proxy-Connection: Keep-Alive\r\n` +
        `\r\n`;
      await writeAndDrain(socket, Buffer.from(req, 'utf8'));

      const resp = await readUntil(socket, Buffer.from('\r\n\r\n'), timeoutMs);
      const respStr = resp.toString('latin1');
      if (!/\s2\d\d\s/.test(respStr) && !respStr.toUpperCase().includes(' 200 ')) {
        // Extract status code if possible
        const m = respStr.match(/HTTP\/\d\.\d\s+(\d+)/i);
        const code = m ? m[1] : 'Unknown';
        const msg = `HTTP CONNECT rejected with code ${code}`;
        throw new Error(msg);
      }
      return;
    }

    if (protocol === 'socks4') {
      const [host, portStr] = targetHostPort.split(':');
      const port = parseInt(portStr, 10);

      const resolved = await resolve4(host);
      const portBytes = Buffer.alloc(2);
      portBytes.writeUInt16BE(port, 0);

      let packet: Buffer;
      if (resolved) {
        // SOCKS4 with IPv4
        packet = Buffer.concat([
          Buffer.from([0x04, 0x01]),
          portBytes,
          ipToBuffer(resolved),
          Buffer.from('uhq\x00', 'latin1'),
        ]);
      } else {
        // SOCKS4a: 0.0.0.1 marker + domain
        packet = Buffer.concat([
          Buffer.from([0x04, 0x01]),
          portBytes,
          Buffer.from([0x00, 0x00, 0x00, 0x01]),
          Buffer.from('uhq\x00', 'latin1'),
          Buffer.from(host, 'utf8'),
          Buffer.from([0x00]),
        ]);
      }
      await writeAndDrain(socket, packet);

      const resp = await readExactly(socket, 8, timeoutMs);
      if (resp[1] !== 0x5a) {
        throw new Error(`SOCKS4 status 0x${resp[1].toString(16)}`);
      }
      return;
    }

    if (protocol === 'socks5') {
      // 1) auth negotiation
      const methods = upstream.auth ? [0x00, 0x02] : [0x00];
      await writeAndDrain(socket, Buffer.from([0x05, methods.length, ...methods]));
      const negotiate = await readExactly(socket, 2, timeoutMs);
      
      if (negotiate[1] === 0x02 && upstream.auth) {
        // Username/Password authentication (RFC 1929)
        const parts = upstream.auth.split(':');
        const username = parts[0] || '';
        const password = parts[1] || '';
        const userBuf = Buffer.from(username, 'utf8');
        const passBuf = Buffer.from(password, 'utf8');
        const authPacket = Buffer.concat([
          Buffer.from([0x01, userBuf.length]),
          userBuf,
          Buffer.from([passBuf.length]),
          passBuf,
        ]);
        await writeAndDrain(socket, authPacket);
        
        const authResp = await readExactly(socket, 2, timeoutMs);
        if (authResp[1] !== 0x00) {
          throw new Error(`SOCKS5 auth failed with status 0x${authResp[1].toString(16)}`);
        }
      } else if (negotiate[1] !== 0x00) {
        throw new Error(`SOCKS5 auth/status 0x${negotiate[1].toString(16)}`);
      }

      // 2) request — connect
      const [host, portStr] = targetHostPort.split(':');
      const port = parseInt(portStr, 10);
      const resolved = await resolve4(host);

      let addrBytes: Buffer;
      let atyp: number;
      if (resolved) {
        atyp = 0x01;
        addrBytes = ipToBuffer(resolved);
      } else {
        atyp = 0x03;
        const dom = Buffer.from(host, 'utf8');
        addrBytes = Buffer.concat([Buffer.from([dom.length]), dom]);
      }
      const portBytes = Buffer.alloc(2);
      portBytes.writeUInt16BE(port, 0);
      const req = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, atyp]),
        addrBytes,
        portBytes,
      ]);
      await writeAndDrain(socket, req);

      // 3) response header (first 4 bytes)
      const head = await readExactly(socket, 4, timeoutMs);
      if (head[1] !== 0x00) {
        throw new Error(`SOCKS5 error status 0x${head[1].toString(16)}`);
      }
      const respAtyp = head[3];
      if (respAtyp === 0x01) {
        await readExactly(socket, 4 + 2, timeoutMs);
      } else if (respAtyp === 0x03) {
        const lenByte = await readExactly(socket, 1, timeoutMs);
        await readExactly(socket, lenByte[0] + 2, timeoutMs);
      } else if (respAtyp === 0x04) {
        await readExactly(socket, 16 + 2, timeoutMs);
      } else {
        throw new Error(`SOCKS5 unknown atyp 0x${respAtyp.toString(16)}`);
      }
      return;
    }

    throw new Error(`Unsupported upstream protocol: ${protocol}`);
  } catch (e) {
    const text = (e as Error)?.message || (e as Error)?.name || 'unknown';
    throw new Error(`${protocol.toUpperCase()} Error: ${text}`);
  }
}

/**
 * Bidirectional TCP relay between client and upstream. Calls `onBytes`
 * with chunk length per direction so the engine can update TrafficService.
 * Resolves when either side closes.
 * Support for optional bandwidthLimit (in KB/s).
 */
export function bidirectionalPipe(
  a: Socket,
  b: Socket,
  onAtoB: (chunk: Buffer) => void,
  onBtoA: (chunk: Buffer) => void,
  bandwidthLimit?: number,
): Promise<void> {
  return new Promise((resolve) => {
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        a.destroy();
      } catch {
        /* */
      }
      try {
        b.destroy();
      } catch {
        /* */
      }
      resolve();
    };

    if (bandwidthLimit && bandwidthLimit > 0) {
      const limitBytes = bandwidthLimit * 1024;

      const setupThrottling = (source: Socket, dest: Socket, callback: (chunk: Buffer) => void) => {
        let bucket = limitBytes;
        const queue: Buffer[] = [];
        let isWaiting = false;

        const timer = setInterval(() => {
          if (closed) {
            clearInterval(timer);
            return;
          }
          // Refill bucket every 100ms
          bucket = Math.min(limitBytes, bucket + limitBytes / 10);
          flush();
        }, 100);

        const flush = () => {
          while (queue.length > 0 && bucket > 0) {
            const chunk = queue[0];
            if (chunk.length <= bucket) {
              queue.shift();
              bucket -= chunk.length;
              callback(chunk);
              if (!dest.destroyed) dest.write(chunk);
            } else {
              const slice = chunk.subarray(0, bucket);
              queue[0] = chunk.subarray(bucket);
              bucket = 0;
              callback(slice);
              if (!dest.destroyed) dest.write(slice);
            }
          }
          if (queue.length === 0 && isWaiting) {
            isWaiting = false;
            source.resume();
          }
        };

        source.on('data', (chunk: Buffer) => {
          queue.push(chunk);
          if (queue.length > 0 && bucket <= 0) {
            if (!isWaiting) {
              isWaiting = true;
              source.pause();
            }
          }
          flush();
        });
      };

      setupThrottling(a, b, onAtoB);
      setupThrottling(b, a, onBtoA);
    } else {
      a.on('data', (chunk: Buffer) => {
        onAtoB(chunk);
        if (!b.destroyed) b.write(chunk);
      });
      b.on('data', (chunk: Buffer) => {
        onBtoA(chunk);
        if (!a.destroyed) a.write(chunk);
      });
    }

    a.once('end', finish);
    b.once('end', finish);
    a.once('error', finish);
    b.once('error', finish);
    a.once('close', finish);
    b.once('close', finish);
    // Both sockets may have been paused by the preceding readUntil/handshake
    // reads (cleanup() pauses). Adding 'data' listeners alone won't resume a
    // socket whose `flowing` is false, so resume both explicitly — otherwise
    // the tunnel is established but no bytes ever flow.
    a.resume();
    b.resume();
  });
}
