#!/usr/bin/env python3
"""Exercise real dig TCP output with a loopback-only DNS fixture, never public DNS."""
from pathlib import Path
import importlib.util
import shutil
import socket
import struct
import subprocess
import threading

spec = importlib.util.spec_from_file_location('tls_dns_native', Path(__file__).resolve().parents[1] / 'deploy/enable-private-domain-tls.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def wire_name(name):
    return b''.join(bytes([len(part)]) + part.encode('ascii') for part in name.split('.')) + b'\0'


def read_exact(connection, count):
    result = b''
    while len(result) < count:
        chunk = connection.recv(count - len(result))
        if not chunk:
            raise RuntimeError('DNS fixture connection closed early.')
        result += chunk
    return result


def main():
    if not shutil.which('dig'):
        raise RuntimeError('dig is required for the native DNS test.')
    errors = []
    questions = m.dns_questions() + [('missing.' + m.DOMAIN, 'A')]
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        listener.settimeout(8)
        port = listener.getsockname()[1]

        def serve():
            try:
                for name, kind in questions:
                    with listener.accept()[0] as connection:
                        connection.settimeout(4)
                        size = struct.unpack('!H', read_exact(connection, 2))[0]
                        query = read_exact(connection, size)
                        question = wire_name(name) + struct.pack('!HH', {'NS': 2, 'A': 1, 'AAAA': 28}[kind], 1)
                        if query[12:12 + len(question)] != question:
                            raise RuntimeError('Unexpected native DNS question.')
                        records = []
                        if name.startswith('missing.'):
                            status = 3
                        else:
                            status = 0
                            if name.startswith('www.'):
                                records.append((name, 5, wire_name(m.DOMAIN)))
                            if kind == 'NS':
                                records += [(name, 2, wire_name('ns1.' + m.DOMAIN)), (name, 2, wire_name('ns2.' + m.DOMAIN))]
                            elif kind == 'A':
                                records.append((m.DOMAIN if name.startswith('www.') else name, 1, socket.inet_aton(m.IP)))
                        response = query[:2] + struct.pack('!HHHHH', 0x8180 | status, 1, len(records), 0, 0) + question
                        for owner, record_type, data in records:
                            response += wire_name(owner) + struct.pack('!HHIH', record_type, 1, 300, len(data)) + data
                        connection.sendall(struct.pack('!H', len(response)) + response)
            except BaseException as error:
                errors.append(error)

        thread = threading.Thread(target=serve, daemon=True)
        thread.start()
        replies = []
        for name, kind in questions:
            result = subprocess.run(['dig', '-r', '@127.0.0.1', '-p', str(port), name + '.', kind,
                                     '+tcp', '+time=3', '+tries=1', '+noall', '+comments', '+answer'],
                                    text=True, capture_output=True, timeout=5, check=True)
            replies.append(m.parse_tcp_dns(result.stdout))
        thread.join(timeout=5)
        if thread.is_alive() or errors:
            raise RuntimeError('Native DNS fixture failed.')
        if not m.valid_dns(replies[:-1]) or replies[-1].get('Status') != 3:
            raise RuntimeError('Native dig DNS response validation failed.')
    print('NATIVE PUBLIC-DNS PARSER PASS: real dig TCP, NS/A/CNAME/empty AAAA and NXDOMAIN; loopback only.')


if __name__ == '__main__':
    main()
