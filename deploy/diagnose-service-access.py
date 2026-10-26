#!/usr/bin/env python3
"""Bounded direct IPv4 probes: DNS, TCP, trusted TLS, public HTTP HEAD.

No root, credentials, proxy changes, application requests, or configuration writes.
Timeouts locate the failing phase; they do not identify censorship by themselves.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import http.client
import ipaddress
import json
import socket
import ssl
import subprocess
import time

TIMEOUT = 3
TARGETS = (
    ('github-archive', 'codeload.github.com', '/amirfassadi/RoyaHomeMadeFood/tar.gz/e63a5efc10240ca5513c0f8d8babf03dc41f546f'),
    ('npm-package', 'registry.npmjs.org', '/fast-uri/-/fast-uri-3.1.9.tgz'),
    ('fx-cloudflare', 'latest.currency-api.pages.dev', '/v1/currencies/usd.json'),
    ('fx-jsdelivr', 'cdn.jsdelivr.net', '/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json'),
    ('fx-coinbase', 'api.coinbase.com', '/v2/exchange-rates?currency=USD'),
    ('iran-control', 'apiv2.nobitex.ir', '/market/stats?srcCurrency=usdt&dstCurrency=rls'),
)


def error_info(error):
    return {'error': type(error).__name__,
            **({'errno': error.errno} if isinstance(getattr(error, 'errno', None), int) else {})}


def resolve(host):
    output = subprocess.run(['getent', 'ahostsv4', host], capture_output=True,
                            text=True, timeout=5, check=False)
    if output.returncode != 0:
        raise RuntimeError('DNS lookup failed')
    addresses = list(dict.fromkeys(line.split()[0] for line in output.stdout.splitlines() if line.split()))
    addresses = [ip for ip in addresses if ipaddress.ip_address(ip).version == 4]
    if not addresses:
        raise RuntimeError('No IPv4 address')
    return addresses


def probe_ip(host, path, ip):
    row = {'ip': ip, 'publicAddress': ipaddress.ip_address(ip).is_global}
    if not row['publicAddress']:
        return {**row, 'failedAt': 'dns-nonpublic-address'}
    started = time.monotonic()
    try:
        with socket.create_connection((ip, 80), timeout=TIMEOUT):
            row['tcp80'] = {'ok': True}
    except OSError as error:
        row['tcp80'] = {'ok': False, **error_info(error)}
    row['tcp80']['elapsedMs'] = round((time.monotonic() - started) * 1000)
    connection = None
    phase = 'tcp443'
    try:
        started = time.monotonic()
        connection = socket.create_connection((ip, 443), timeout=TIMEOUT)
        row['tcp443'] = {'ok': True, 'elapsedMs': round((time.monotonic() - started) * 1000)}
        phase = 'tls'
        started = time.monotonic()
        # Verify both the certificate chain and hostname, with the real SNI.
        connection = ssl.create_default_context().wrap_socket(connection, server_hostname=host)
        row['tls'] = {'ok': True, 'version': connection.version(),
                      'elapsedMs': round((time.monotonic() - started) * 1000)}
        phase = 'http'
        started = time.monotonic()
        connection.sendall(('HEAD ' + path + ' HTTP/1.1\r\nHost: ' + host +
                            '\r\nUser-Agent: Roya-readonly-access-check/1\r\nConnection: close\r\n\r\n').encode('ascii'))
        response = http.client.HTTPResponse(connection)
        try:
            response.begin()
            row['http'] = {'status': response.status,
                           'elapsedMs': round((time.monotonic() - started) * 1000)}
        finally:
            response.close()
    except (OSError, http.client.HTTPException, ValueError) as error:
        row['failedAt'] = phase
        row[phase] = {'ok': False, 'elapsedMs': round((time.monotonic() - started) * 1000),
                      **error_info(error)}
    finally:
        if connection is not None:
            connection.close()
    return row


def probe(target):
    name, host, path = target
    row = {'name': name, 'host': host}
    try:
        addresses = resolve(host)
        row['dns'] = addresses
        row['testedAddresses'] = [probe_ip(host, path, ip) for ip in addresses[:2]]
    except (OSError, subprocess.TimeoutExpired, RuntimeError, ValueError) as error:
        row.update({'failedAt': 'dns', **error_info(error)})
    return row


def main():
    print(json.dumps({'checkedAt': datetime.now(timezone.utc).isoformat(),
                      'readOnly': True, 'directIpv4': True, 'addressesPerHost': 2,
                      'timeoutPerPhaseSeconds': TIMEOUT,
                      'scope': 'Sampled addresses only. Timeout alone does not establish censorship, sanctions, a provider outage, or the responsible network.'}), flush=True)
    with ThreadPoolExecutor(max_workers=len(TARGETS)) as executor:
        for completed in as_completed([executor.submit(probe, target) for target in TARGETS]):
            print(json.dumps(completed.result()), flush=True)


if __name__ == '__main__':
    main()
