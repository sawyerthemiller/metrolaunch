<?php
/*
 * Spotify Status Server for MetroLaunch
 * ======================================
 * File is on the Leopard main server...
 *
 * Endpoints
 *   POST ?action=register     — Register a username
 *   POST ?action=update       — Push song status from the client script
 *   GET  ?action=status&username=...  — PWA polls this for current status
 *   GET  ?action=cover&username=...   — Proxies the cached Discogs cover image
 *
 * Concurrency model
 * -----------------
 * The server has been updated to handle multiple users concurrently...
 */

define('DATA_FILE',   __DIR__ . '/spotify_users.json');
define('COVER_CACHE', __DIR__ . '/spotify_cover_cache.json');
define('CREDS_FILE',  __DIR__ . '/discogs_creds.txt');
define('COMMUNITY_DATA_FILE', __DIR__ . '/community_apps.json');
define('VOTE_FILE',   __DIR__ . '/unique_users.txt');

// ── CORS headers ──
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Private-Network: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Discogs credentials ──

/**
 * Load Discogs credentials from discogs_creds.txt
 */
function load_discogs_creds(): array {
    $out = ['key' => '', 'secret' => ''];
    if (!is_readable(CREDS_FILE)) return $out;

    $lines = @file(CREDS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return $out;

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || $line[0] === ';') continue;

        // strip optional surrounding quotes on the key, and either quote style
        // on the value. Also tolerate no quotes at all if ya want it like that...
        if (preg_match(
            '/^[\'"]?([A-Za-z_][A-Za-z0-9_]*)[\'"]?\s*=\s*[\'"]?([^\'"]*)[\'"]?\s*$/',
            $line,
            $m
        )) {
            $name  = strtoupper($m[1]);
            $value = $m[2];
            if ($name === 'DISCOGS_KEY')    $out['key']    = $value;
            if ($name === 'DISCOGS_SECRET') $out['secret'] = $value;
        }
    }
    return $out;
}

/**
 * Load admin code for community endpoints
 */
function load_admin_code(): string {
    if (!is_readable(CREDS_FILE)) return '';
    $lines = @file(CREDS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return '';
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || $line[0] === ';') continue;
        if (preg_match('/^[\'"]?([A-Za-z_][A-Za-z0-9_]*)[\'"]?\s*=\s*[\'"]?([^\'"]*)[\'"]?\s*$/', $line, $m)) {
            $name  = strtoupper($m[1]);
            if ($name === 'ADMIN_CODE') {
                return $m[2];
            }
        }
    }
    return '';
}

// ── generic helpers ──

function json_response(array $payload, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($payload);
    exit;
}

function read_post_body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ── concurrency safe data store ──

/**
 * Open the shared data file with an exclusive lock
 */
function with_data_lock(callable $mutator): array {
    // only mode where we can hold a lock across a full read-modify-write
    $fp = @fopen(DATA_FILE, 'c+');
    if (!$fp) {
        json_response(['error' => 'Server data store unavailable'], 500);
    }

    $locked = false;
    // stay responsive under contention
    for ($i = 0; $i < 50; $i++) {
        if (flock($fp, LOCK_EX | LOCK_NB)) { $locked = true; break; }
        usleep(100_000);
    }
    if (!$locked) {
        fclose($fp);
        json_response(['error' => 'Server busy, please retry'], 503);
    }

    rewind($fp);
    $raw  = stream_get_contents($fp);
    $data = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
    if (!is_array($data)) $data = [];

    $new = $mutator($data);

    if (is_array($new)) {
        $encoded = json_encode($new, JSON_PRETTY_PRINT);
        // truncate and rewrite in place
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $encoded);
        fflush($fp);
        $data = $new;
    }

    flock($fp, LOCK_UN);
    fclose($fp);
    return $data;
}

/**
 * Read only snapshot of the store
 */
function read_data_locked(): array {
    if (!file_exists(DATA_FILE)) return [];
    $fp = @fopen(DATA_FILE, 'r');
    if (!$fp) return [];

    $raw = '';
    if (flock($fp, LOCK_SH)) {
        $raw = stream_get_contents($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);

    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Lock handlers for Community data
 */
function with_community_data_lock(callable $mutator): array {
    $fp = @fopen(COMMUNITY_DATA_FILE, 'c+');
    if (!$fp) {
        json_response(['error' => 'Server data store unavailable'], 500);
    }
    $locked = false;
    for ($i = 0; $i < 50; $i++) {
        if (flock($fp, LOCK_EX | LOCK_NB)) { $locked = true; break; }
        usleep(100_000);
    }
    if (!$locked) {
        fclose($fp);
        json_response(['error' => 'Server too busy'], 503);
    }
    clearstatcache(true, COMMUNITY_DATA_FILE);
    $size = filesize(COMMUNITY_DATA_FILE);
    $data = [];
    if ($size > 0) {
        rewind($fp);
        $raw = fread($fp, $size);
        $parsed = json_decode($raw, true);
        if (is_array($parsed)) $data = $parsed;
    }
    $new_data = $mutator($data);
    if ($new_data !== null) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($new_data, JSON_PRETTY_PRINT));
        fflush($fp);
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $new_data ?? $data;
}

function increment_vote_lock(): int {
    $fp = @fopen(VOTE_FILE, 'c+');
    if (!$fp) {
        json_response(['error' => 'Server data store unavailable'], 500);
    }
    $locked = false;
    for ($i = 0; $i < 50; $i++) {
        if (flock($fp, LOCK_EX | LOCK_NB)) { $locked = true; break; }
        usleep(100_000);
    }
    if (!$locked) {
        fclose($fp);
        json_response(['error' => 'Server too busy'], 503);
    }
    clearstatcache(true, VOTE_FILE);
    $size = filesize(VOTE_FILE);
    $count = 0;
    if ($size > 0) {
        rewind($fp);
        $raw = fread($fp, $size);
        $count = (int)trim($raw);
    }
    $count++;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string)$count);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $count;
}

// ── cover art (Discogs) ──

/** Normalise track information into a stable cache key. */
function cover_cache_key(string $artist, string $track): string {
    return strtolower(trim($artist)) . '||' . strtolower(trim($track));
}

/**
 * Look up a previously discovered cover URL in the on-disk cache, which we keep up to 7 days
 */
function cover_cache_get(string $artist, string $track): array {
    if (!file_exists(COVER_CACHE)) return [false, null];
    $fp = @fopen(COVER_CACHE, 'r');
    if (!$fp) return [false, null];
    $raw = '';
    if (flock($fp, LOCK_SH)) {
        $raw = stream_get_contents($fp);
        flock($fp, LOCK_UN);
    }
    fclose($fp);
    if (!$raw) return [false, null];

    $cache = json_decode($raw, true);
    if (!is_array($cache)) return [false, null];

    $key = cover_cache_key($artist, $track);
    if (!isset($cache[$key])) return [false, null];

    $entry = $cache[$key];
    if (!is_array($entry) || !isset($entry['fetchedAt'])) return [false, null];
    if (time() - (int) $entry['fetchedAt'] > 7 * 24 * 3600) return [false, null];

    return [true, $entry['url'] ?? null];
}

function cover_cache_put(string $artist, string $track, ?string $url): void {
    $key = cover_cache_key($artist, $track);
    $fp = @fopen(COVER_CACHE, 'c+');
    if (!$fp) return;

    if (!flock($fp, LOCK_EX)) { fclose($fp); return; }

    rewind($fp);
    $raw   = stream_get_contents($fp);
    $cache = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
    if (!is_array($cache)) $cache = [];

    $cache[$key] = ['url' => $url, 'fetchedAt' => time()];

    // Cheap size cap
    if (count($cache) > 500) {
        uasort($cache, fn($a, $b) => ($a['fetchedAt'] ?? 0) <=> ($b['fetchedAt'] ?? 0));
        $cache = array_slice($cache, 250, null, true);
    }

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($cache));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

/**
 * Search Discogs for album art and return the cover image URL, or null if nothing usable was found
 */
function fetch_discogs_cover(string $artist, string $track, array $creds): ?string {
    if ($creds['key'] === '' || $creds['secret'] === '') return null;

    $query = urlencode("$artist $track");
    $url = "https://api.discogs.com/database/search?q={$query}&type=release";

    $opts = [
        'http' => [
            'method'  => 'GET',
            'header'  => implode("\r\n", [
                'User-Agent: MetroLaunchIOS/1.0',
                'Authorization: Discogs key=' . $creds['key'] . ', secret=' . $creds['secret'],
            ]),
            'timeout' => 8,
        ],
        'ssl' => [
            'verify_peer'      => false,
            'verify_peer_name' => false,
        ],
    ];
    $ctx = stream_context_create($opts);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) return null;

    $data = json_decode($resp, true);
    $results = $data['results'] ?? [];
    if (empty($results)) return null;

    $cover = $results[0]['cover_image'] ?? null;
    if ($cover && strpos($cover, 'spacer.gif') === false) return $cover;
    return null;
}

/** Download a remote image and return its raw bytes */
function proxy_image(string $url): ?array {
    $opts = [
        'http' => [
            'method'  => 'GET',
            'header'  => 'User-Agent: MetroLaunchIOS/1.0',
            'timeout' => 8,
        ],
        'ssl' => [
            'verify_peer'      => false,
            'verify_peer_name' => false,
        ],
    ];
    $ctx = stream_context_create($opts);
    $img = @file_get_contents($url, false, $ctx);
    if ($img === false) return null;

    $contentType = 'image/jpeg';
    if (isset($http_response_header)) {
        foreach ($http_response_header as $hdr) {
            if (stripos($hdr, 'Content-Type:') === 0) {
                $contentType = trim(substr($hdr, 13));
                break;
            }
        }
    }
    return ['data' => $img, 'type' => $contentType];
}

// ── routing ──

$action = $_GET['action'] ?? '';

switch ($action) {

    // ── register ──
    case 'register':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'POST required'], 405);
        }
        $body = read_post_body();
        $username = trim($body['username'] ?? '');
        if ($username === '') {
            json_response(['error' => 'username is required'], 400);
        }
        // sanitise username
        if (!preg_match('/^[a-zA-Z0-9_-]{1,32}$/', $username)) {
            json_response(['error' => 'Invalid username. Use a-z, 0-9, _ or - (max 32 chars)'], 400);
        }

        $created = false;
        with_data_lock(function (array $data) use ($username, &$created): ?array {
            if (isset($data[$username])) {
                return null; // already registered, nothing to write
            }
            $data[$username] = [
                'track'     => '',
                'artist'    => '',
                'isPlaying' => false,
                'coverUrl'  => null,
                'updatedAt' => time(),
            ];
            $created = true;
            return $data;
        });

        json_response([
            'ok'       => true,
            'created'  => $created,
            'username' => $username,
        ]);
        break;

    // ── update ──
    case 'update':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'POST required'], 405);
        }
        $body = read_post_body();
        $username  = trim($body['username'] ?? '');
        $track     = trim($body['track'] ?? '');
        $artist    = trim($body['artist'] ?? '');
        $isPlaying = !empty($body['isPlaying']);

        if ($username === '') {
            json_response(['error' => 'username is required'], 400);
        }

        // --- phase 1 - fast write of the new track state, capture what
        // work (if any) needs to be done outside the lock ---
        $unknownUser  = false;
        $songChanged  = false;
        $needsFetch   = false;
        $carriedCover = null;

        with_data_lock(function (array $data) use (
            $username, $track, $artist, $isPlaying,
            &$unknownUser, &$songChanged, &$needsFetch, &$carriedCover
        ): ?array {
            if (!isset($data[$username])) {
                $unknownUser = true;
                return null;
            }
            $prev = $data[$username];
            $songChanged = ($prev['track'] !== $track || $prev['artist'] !== $artist);
            $needsFetch  = $isPlaying && $songChanged && $track !== '' && $artist !== '';

            // Keep the previous cover so the tile can still show it briefly
            // during a pause then drop it as soon as the song actually changes
            $carriedCover = $songChanged ? null : $prev['coverUrl'];

            $data[$username] = [
                'track'     => $track,
                'artist'    => $artist,
                'isPlaying' => $isPlaying,
                'coverUrl'  => $carriedCover,
                'updatedAt' => time(),
            ];
            return $data;
        });

        if ($unknownUser) {
            json_response(['error' => 'Unknown username. Register first.'], 404);
        }

        // --- phase 2 - slow work (Discogs lookup) with no lock held ---
        $newCover  = $carriedCover;
        $didLookup = false;

        if ($needsFetch) {
            [$cached, $cachedUrl] = cover_cache_get($artist, $track);
            if ($cached) {
                $newCover = $cachedUrl;
            } else {
                $newCover  = fetch_discogs_cover($artist, $track, load_discogs_creds());
                $didLookup = true;
                cover_cache_put($artist, $track, $newCover);
            }

            // --- phase 3 - patch the cover back in, but only if this user
            // is still playing the same song we just looked art up for,
            // otherwise a newer /update from the same user (a fast track
            // change) would be silently overwritten ---
            with_data_lock(function (array $data) use ($username, $track, $artist, $newCover): ?array {
                if (!isset($data[$username])) return null;
                $entry = $data[$username];
                if ($entry['track'] !== $track || $entry['artist'] !== $artist) {
                    return null; // superseded — don't clobber
                }
                if ($entry['coverUrl'] === $newCover) return null; // no change
                $entry['coverUrl'] = $newCover;
                $data[$username]   = $entry;
                return $data;
            });
        }

        json_response([
            'ok'          => true,
            'coverFound'  => ($newCover !== null),
            'coverCached' => ($needsFetch && !$didLookup),
        ]);
        break;

    // ── status (PWA polls this) ──
    case 'status':
        $username = trim($_GET['username'] ?? '');
        if ($username === '') {
            json_response(['error' => 'username is required'], 400);
        }

        $data = read_data_locked();
        if (!isset($data[$username])) {
            json_response(['error' => 'Unknown username'], 404);
        }

        $entry = $data[$username];
        $selfUrl = strtok($_SERVER['REQUEST_URI'] ?? '', '?');
        if (!$selfUrl) $selfUrl = $_SERVER['SCRIPT_NAME'] ?? 'spotify.php';

        $coverEndpoint = null;
        if ($entry['coverUrl'] && $entry['isPlaying']) {
            $coverEndpoint = $selfUrl
                . '?action=cover&username=' . urlencode($username)
                . '&t=' . $entry['updatedAt'];
        }

        json_response([
            'isPlaying' => (bool) $entry['isPlaying'],
            'track'     => $entry['track'],
            'artist'    => $entry['artist'],
            'coverUrl'  => $coverEndpoint,
        ]);
        break;

    // ── cover image proxy ──
    case 'cover':
        $username = trim($_GET['username'] ?? '');
        if ($username === '') {
            http_response_code(400);
            exit('Missing username');
        }

        $data  = read_data_locked();
        $entry = $data[$username] ?? null;
        if (!$entry || !$entry['coverUrl']) {
            http_response_code(404);
            exit('No cover art');
        }

        $img = proxy_image($entry['coverUrl']);
        if (!$img) {
            http_response_code(502);
            exit('Failed to fetch cover image');
        }

        header('Content-Type: ' . $img['type']);
        header('Access-Control-Allow-Origin: *');
        header('Cache-Control: public, max-age=86400');
        echo $img['data'];
        exit;

    // ── fallback ──
    default:
        json_response([
            'service' => 'MetroLaunch Spotify Server',
            'version' => '2.1',
            'endpoints' => [
                'POST ?action=register'             => 'Register a username',
                'POST ?action=update'               => 'Push song status',
                'GET  ?action=status&username=...'  => 'Get current status',
                'GET  ?action=cover&username=...'   => 'Get cover art image',
                'POST ?action=vote'                 => 'Increments unique users',
                'POST ?action=submit'               => 'Submits a custom app tile',
                'GET  ?action=list'                 => 'Retrieves custom app tiles',
                'POST ?action=delete'               => 'Deletes an app with ADMIN_CODE',
            ],
        ]);
        break;
        
    // ── community endpoints ──
    case 'vote':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method Not Allowed'], 405);
        }
        $new_count = increment_vote_lock();
        json_response(['success' => true, 'count' => $new_count]);
        break;

    case 'list':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            json_response(['error' => 'Method Not Allowed'], 405);
        }
        if (!file_exists(COMMUNITY_DATA_FILE)) {
            json_response(['apps' => []]);
        }
        $raw = file_get_contents(COMMUNITY_DATA_FILE);
        $parsed = json_decode($raw, true);
        if (!is_array($parsed)) $parsed = [];
        json_response(['apps' => $parsed]);
        break;

    case 'submit':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method Not Allowed'], 405);
        }
        $body = read_post_body();
        if (empty($body['name'])) {
            json_response(['error' => 'Missing app name'], 400);
        }

        $app = [
            'id' => uniqid('ca_'),
            'name' => $body['name'],
            'iconUrl' => $body['iconUrl'] ?? '',
            'color' => $body['color'] ?? '#0078d4',
            'launchUrl' => $body['launchUrl'] ?? '',
            'date' => date('Y/m/d')
        ];

        with_community_data_lock(function($data) use ($app) {
            foreach ($data as $existing) {
                if (strtolower($existing['name']) === strtolower($app['name'])) {
                    json_response(['error' => 'That app has already been submitted'], 409);
                }
            }
            $data[] = $app;
            return $data;
        });

        json_response(['success' => true]);
        break;

    case 'delete':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            json_response(['error' => 'Method Not Allowed'], 405);
        }
        $body = read_post_body();
        $provided_code = $body['admin_code'] ?? '';
        $id = $body['id'] ?? '';
        
        $expected_code = load_admin_code();
        if (empty($expected_code) || $provided_code !== $expected_code) {
            json_response(['error' => 'Unauthorized or invalid code'], 401);
        }

        with_community_data_lock(function($data) use ($id) {
            $filtered = array_filter($data, function($item) use ($id) {
                return $item['id'] !== $id;
            });
            return array_values($filtered);
        });

        json_response(['success' => true]);
        break;
}
