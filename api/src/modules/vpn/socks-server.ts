import * as net from 'net';

/**
 * Mini serveur SOCKS5 (CONNECT seulement, sans authentification) écoutant sur 127.0.0.1. Chaque connexion sortante est liée à
 * `localAddress` : avec le routage par adresse source posé sur le tunnel (cf. VpnService), elle sort PAR le VPN. Aucun accès réseau
 * extérieur : seul le moteur du panel (même conteneur) s'y connecte.
 */
export function startSocksServer(localAddress: string): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      client.setNoDelay(true);
      client.on('error', () => client.destroy());
      let stage: 'greet' | 'req' | 'pipe' = 'greet';
      let buf = Buffer.alloc(0);

      const fail = (code: number) => {
        try {
          client.end(Buffer.from([0x05, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        } catch {
          client.destroy();
        }
      };

      const onData = (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);
        if (stage === 'greet') {
          if (buf.length < 2) return;
          const nmethods = buf[1];
          if (buf.length < 2 + nmethods) return;
          if (buf[0] !== 0x05) return client.destroy();
          buf = buf.subarray(2 + nmethods);
          client.write(Buffer.from([0x05, 0x00]));
          stage = 'req';
        }
        if (stage === 'req') {
          if (buf.length < 5) return;
          if (buf[0] !== 0x05 || buf[1] !== 0x01) return fail(0x07); // seulement CONNECT
          const atyp = buf[3];
          let host: string;
          let off: number;
          if (atyp === 0x01) {
            if (buf.length < 10) return;
            host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
            off = 8;
          } else if (atyp === 0x03) {
            const len = buf[4];
            if (buf.length < 5 + len + 2) return;
            host = buf.subarray(5, 5 + len).toString('utf8');
            off = 5 + len;
          } else if (atyp === 0x04) {
            if (buf.length < 22) return;
            host = Array.from({ length: 8 }, (_, i) => buf.readUInt16BE(4 + i * 2).toString(16)).join(':');
            off = 20;
          } else return fail(0x08);
          const port = buf.readUInt16BE(off);
          const rest = buf.subarray(off + 2);
          stage = 'pipe';
          client.removeListener('data', onData);
          client.pause();
          // IPv6 : pas d'adresse source IPv4 utilisable → on laisse échouer proprement (le moteur essaiera un autre amont).
          const upstream = net.connect({ host, port, localAddress, family: 4 });
          upstream.setNoDelay(true);
          const timer = setTimeout(() => {
            upstream.destroy();
            fail(0x04);
          }, 15_000);
          upstream.once('connect', () => {
            clearTimeout(timer);
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            if (rest.length) upstream.write(rest);
            client.pipe(upstream);
            upstream.pipe(client);
            client.resume();
          });
          upstream.once('error', () => {
            clearTimeout(timer);
            if (!client.destroyed && stage === 'pipe' && !upstream.connecting && upstream.bytesWritten === 0 && !upstream.readable) fail(0x05);
            client.destroy();
          });
          upstream.once('close', () => client.destroy());
          client.once('close', () => upstream.destroy());
        }
      };
      client.on('data', onData);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as net.AddressInfo).port }));
  });
}
