#!/bin/sh
# Aide privilégiée du module VPN (lancée via `sudo`, seule commande autorisée à l'utilisateur « app »).
# Elle n'accepte que des sous-commandes précises avec des arguments VALIDÉS : le serveur Node (non-root) ne peut donc pas s'en servir pour
# exécuter autre chose qu'OpenVPN sur un fichier de configuration de son dossier de données, ni modifier autre chose que les règles de
# routage des tunnels (tables 200-299).
set -eu
DIR="${VPN_DIR:-/app/data/vpn}"
cmd="${1:-}"
[ -n "$cmd" ] && shift || true

is_id()    { printf '%s' "$1" | grep -Eq '^[0-9a-fA-F-]{36}$'; }
is_dev()   { printf '%s' "$1" | grep -Eq '^uvpn[0-9]{1,3}$'; }
is_ip()    { printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; }
is_table() { printf '%s' "$1" | grep -Eq '^2[0-9]{2}$'; }
is_prio()  { printf '%s' "$1" | grep -Eq '^1[0-9]{3}$'; }

case "$cmd" in
  openvpn)
    id="${1:-}"; dev="${2:-}"
    is_id "$id" && is_dev "$dev" || { echo "arguments invalides" >&2; exit 2; }
    f="$DIR/$id.ovpn"
    [ -f "$f" ] || { echo "configuration absente" >&2; exit 2; }
    # Défense en profondeur : LISTE BLANCHE stricte (le fichier est aussi nettoyé côté panel, mais ce script tourne en root et ne lui fait pas
    # confiance). Hors blocs en ligne autorisés, chaque ligne doit commencer par une directive connue et sans caractère spécial.
    awk '
      BEGIN {
        n = split("client tls-client pull proto remote port rport nobind persist-key resolv-retry cipher data-ciphers data-ciphers-fallback ncp-ciphers auth verb mute key-direction remote-cert-tls remote-cert-ku remote-cert-eku ns-cert-type verify-x509-name comp-lzo compress keepalive ping ping-restart ping-exit tls-cipher tls-ciphersuites tls-version-min tls-version-max tls-cert-profile reneg-sec tun-mtu link-mtu mssfix fragment sndbuf rcvbuf float explicit-exit-notify remote-random connect-retry connect-retry-max connect-timeout server-poll-timeout single-session allow-compression auth-retry multihome key-method tran-window hand-window replay-window engine-none", L, " ")
        for (i = 1; i <= n; i++) ok[L[i]] = 1
        m = split("ca cert key tls-auth tls-crypt tls-crypt-v2", B, " ")
        for (i = 1; i <= m; i++) blk[B[i]] = 1
        block = ""
      }
      {
        line = $0; gsub(/\r/, "", line); gsub(/^[ \t]+|[ \t]+$/, "", line)
        if (block != "") {
          if (tolower(line) == "</" block ">") { block = ""; next }
          if (line ~ /^<\/?[A-Za-z]/) { bad = 1; exit }
          next
        }
        if (line == "" || line ~ /^[#;]/) next
        if (match(line, /^<[A-Za-z0-9-]+>$/)) {
          t = tolower(substr(line, 2, length(line) - 2))
          if (!(t in blk)) { bad = 1; exit }
          block = t; next
        }
        if (line ~ /["\047`$;|&<>\\]/) { bad = 1; exit }
        sub(/^--/, "", line)
        split(line, W, /[ \t]+/)
        if (!(tolower(W[1]) in ok)) { bad = 1; exit }
      }
      END { if (bad || block != "") exit 1 }
    ' "$f" || { echo "configuration refusée (directive non autorisée)" >&2; exit 3; }
    exec openvpn --config "$f" --dev "$dev" --dev-type tun --route-nopull --script-security 1 --verb 3 \
      --connect-timeout 15 --connect-retry-max 1 --resolv-retry 0 --nobind --auth-nocache \
      --data-ciphers 'AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305:AES-256-CBC:AES-128-CBC' --data-ciphers-fallback AES-128-CBC \
      --tls-cert-profile insecure --ping 10 --ping-exit 60
    ;;
  rule-add)
    is_ip "${1:-}" && is_table "${2:-}" && is_prio "${3:-}" || { echo "arguments invalides" >&2; exit 2; }
    exec ip rule add from "$1" lookup "$2" priority "$3"
    ;;
  rule-del)
    is_ip "${1:-}" && is_table "${2:-}" && is_prio "${3:-}" || { echo "arguments invalides" >&2; exit 2; }
    exec ip rule del from "$1" lookup "$2" priority "$3"
    ;;
  route-add)
    is_dev "${1:-}" && is_table "${2:-}" || { echo "arguments invalides" >&2; exit 2; }
    exec ip route replace default dev "$1" table "$2"
    ;;
  flush)
    is_table "${1:-}" || { echo "arguments invalides" >&2; exit 2; }
    exec ip route flush table "$1"
    ;;
  probe)
    ip rule add from 203.0.113.250 lookup 299 priority 1999 && ip rule del from 203.0.113.250 lookup 299 priority 1999
    ;;
  *)
    echo "commande inconnue" >&2; exit 2
    ;;
esac
