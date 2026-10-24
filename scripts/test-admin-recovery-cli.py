#!/usr/bin/env python3
"""Exercise the real hidden-password recovery CLI through a pseudo-terminal in CI."""
import errno
import json
import os
import pty
import select
import subprocess
import sys
import termios
import time

data = json.load(sys.stdin)
mode = data['mode']
if mode not in ('cancel', 'mismatch', 'recover'):
    raise SystemExit('Invalid integration mode')
answers = [('Existing admin mobile: ', data['mobile']),
           ('Type RESET to proceed: ', 'CANCEL' if mode == 'cancel' else 'RESET')]
if mode != 'cancel':
    answers += [('New password (12–128 characters, hidden): ', data['password']),
                ('Confirm new password (hidden): ', data['password'] + '-different' if mode == 'mismatch' else data['password'])]
master, slave = pty.openpty()
child = subprocess.Popen(['node', '--import', 'tsx', 'scripts/recover-admin.ts'], stdin=slave, stdout=slave,
                         stderr=slave, start_new_session=True)
os.close(slave)
received = b''
position = 0
terminal_closed = False
deadline = time.monotonic() + 25
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                part = os.read(master, 8192)
            except OSError as error:
                if error.errno == errno.EIO:
                    terminal_closed = True
                    break
                raise
            if not part:
                terminal_closed = True
                break
            received += part
        if position < len(answers) and answers[position][0].encode() in received:
            # The label may arrive before Node switches the PTY to raw mode.
            # Never send a simulated secret while the terminal can echo it.
            if position >= 2 and termios.tcgetattr(master)[3] & termios.ECHO:
                continue
            os.write(master, (answers[position][1] + '\n').encode())
            position += 1
        if child.poll() is not None and not ready:
            break
    # PTY EOF can precede waitpid observing the child's completed exit.
    if terminal_closed and child.poll() is None:
        try:
            child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass
    if child.poll() is None:
        child.kill()
        raise RuntimeError('Recovery CLI did not complete within the test deadline.')
    output = received.decode(errors='replace')
    if data['password'] in output:
        raise RuntimeError('Recovery CLI printed hidden input.')
    if position != len(answers):
        raise RuntimeError('Recovery CLI did not reach all expected prompts.')
    if mode == 'recover':
        if child.returncode != 0 or 'Password recovered. Old sessions revoked.' not in output:
            raise RuntimeError('Recovery CLI failed its success check.')
    elif child.returncode == 0:
        raise RuntimeError('Cancelled or mismatched recovery unexpectedly succeeded.')
    print('Recovery CLI ' + mode + ': PASS; password hidden.')
finally:
    if child.poll() is None:
        child.kill()
    child.wait(timeout=5)
    os.close(master)
