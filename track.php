<?php
/**
 * 訪問記録トラッカー
 * <img src="track.php?p=index"> で 1x1 の透明GIFを返しつつ、IPとUAを記録する。
 */
declare(strict_types=1);

/* ==================== 設定 ==================== */
const LOG_DIR   = __DIR__ . '/data/logs';
const LOG_FILE  = LOG_DIR . '/visits.log';
const STAT_FILE = LOG_DIR . '/visits.json';
const LOCK_FILE = LOG_DIR . '/.visits.lock';

const MAX_LOG_BYTES = 5 * 1024 * 1024;   // 5MB を超えたら visits.log.1 に退避
const KEEP_DAYS     = 400;               // 日別集計の保持日数
const TOP_UAS       = 60;                // 保持するUAの種類

const IP_SALT  = 'change-this-salt-please';
const SKIP_IPS = [];                     // 除外したいIP（自分の確認用など）

/* ==================== 出力ヘッダ ==================== */
header('Content-Type: image/gif');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('Access-Control-Allow-Origin: *');

/* 1x1 透明GIF（43バイト） */
$PIXEL = "GIF89a"
       . "\x01\x00\x01\x00"                       // 1x1
       . "\x80\x00\x00"                           // グローバルカラーテーブル
       . "\x00\x00\x00\xff\xff\xff"               // 黒 / 白
       . "\x21\xf9\x04\x01\x00\x00\x00\x00"       // 透過指定
       . "\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00"
       . "\x02\x02\x44\x01\x00"
       . "\x3b";
header('Content-Length: ' . strlen($PIXEL));

/* ==================== 収集 ==================== */
$ip = client_ip();

if (in_array($ip, SKIP_IPS, true)) {
    echo $PIXEL;
    exit;
}

$ua   = cut((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 400);
$ref  = cut((string)($_SERVER['HTTP_REFERER'] ?? ''), 400);
$page = preg_replace('/[^\w\-\/\.]/u', '', (string)($_GET['p'] ?? ''));
$page = cut((string)$page, 60);

$now  = date('Y-m-d H:i:s');
$day  = date('Y-m-d');
$bot  = is_bot($ua) ? 1 : 0;
$hash = substr(hash('sha256', $ip . '|' . IP_SALT), 0, 16);

/* ==================== 書き込み ==================== */
try {
    if (!is_dir(LOG_DIR)) {
        @mkdir(LOG_DIR, 0775, true);
    }
    rotate_if_needed();

    $lock = @fopen(LOCK_FILE, 'c');
    if ($lock && flock($lock, LOCK_EX)) {

        /* --- 生ログ --- */
        $line = implode("\t", [$now, $ip, $hash, (string)$bot, $page, $ua, $ref]) . "\n";
        @file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);

        /* --- 集計 --- */
        $stat = read_stat();

        $stat['total'] = (int)($stat['total'] ?? 0) + 1;
        $key = $bot ? 'bot' : 'human';
        $stat[$key] = (int)($stat[$key] ?? 0) + 1;
        $stat['first'] = $stat['first'] ?? $now;
        $stat['last']  = $now;

        $stat['ips'] = $stat['ips'] ?? [];
        $isNew = !isset($stat['ips'][$hash]);
        if ($isNew) {
            $stat['unique'] = (int)($stat['unique'] ?? 0) + 1;
            $stat['ips'][$hash] = ['f' => $now, 'l' => $now, 'n' => 1, 'b' => $bot];
        } else {
            $stat['ips'][$hash]['l'] = $now;
            $stat['ips'][$hash]['n'] = (int)$stat['ips'][$hash]['n'] + 1;
        }

        $stat['days'] = $stat['days'] ?? [];
        $d = $stat['days'][$day] ?? ['human' => 0, 'bot' => 0, 'unique' => 0, 's' => []];
        $d[$key] = (int)($d[$key] ?? 0) + 1;
        if (!isset($d['s'][$hash])) {
            $d['s'][$hash] = 1;
            $d['unique'] = (int)($d['unique'] ?? 0) + 1;
        }
        $stat['days'][$day] = $d;

        /* --- UA集計 --- */
        $uk = substr(md5($ua), 0, 12);
        $stat['uas'] = $stat['uas'] ?? [];
        if (!isset($stat['uas'][$uk])) {
            $stat['uas'][$uk] = ['u' => $ua, 'n' => 0];
        }
        $stat['uas'][$uk]['n'] = (int)$stat['uas'][$uk]['n'] + 1;

        /* --- ページ集計 --- */
        if ($page !== '') {
            $stat['pages'] = $stat['pages'] ?? [];
            $stat['pages'][$page] = (int)($stat['pages'][$page] ?? 0) + 1;
        }

        /* --- 間引き --- */
        $stat = prune($stat, $day);

        @file_put_contents(STAT_FILE, json_encode($stat, JSON_UNESCAPED_UNICODE), LOCK_EX);
        flock($lock, LOCK_UN);
    }
    if ($lock) { fclose($lock); }

} catch (Throwable $e) {
    // 失敗しても画像は必ず返す
}

echo $PIXEL;
exit;

/* ==================== 関数 ==================== */

function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR',
              'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
        $v = $_SERVER[$k] ?? '';
        if ($v === '') { continue; }
        $first = trim(explode(',', $v)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) { return $first; }
    }
    return '0.0.0.0';
}

function is_bot(string $ua): bool
{
    if ($ua === '') { return true; }
    return (bool)preg_match(
        '/bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebook|twitterbot'
        . '|preview|curl|wget|python|go-http|java|headless|lighthouse|monitor'
        . '|uptime|pingdom|ahrefs|semrush|screaming/i',
        $ua
    );
}

function cut(string $s, int $len): string
{
    return function_exists('mb_substr') ? mb_substr($s, 0, $len) : substr($s, 0, $len);
}

function rotate_if_needed(): void
{
    if (!is_file(LOG_FILE)) { return; }
    clearstatcache(true, LOG_FILE);
    if (@filesize(LOG_FILE) > MAX_LOG_BYTES) {
        @rename(LOG_FILE, LOG_FILE . '.1');
    }
}

function read_stat(): array
{
    if (!is_file(STAT_FILE)) { return []; }
    $raw = (string)@file_get_contents(STAT_FILE);
    if ($raw === '') { return []; }
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

function prune(array $stat, string $today): array
{
    /* 古い日別を落とす */
    if (!empty($stat['days'])) {
        $limit = date('Y-m-d', strtotime('-' . KEEP_DAYS . ' days'));
        foreach (array_keys($stat['days']) as $d) {
            if ($d < $limit) { unset($stat['days'][$d]); }
        }
    }

    /* UAは上位のみ残す */
    if (!empty($stat['uas']) && count($stat['uas']) > TOP_UAS) {
        uasort($stat['uas'], fn($a, $b) => $b['n'] <=> $a['n']);
        $stat['uas'] = array_slice($stat['uas'], 0, TOP_UAS, true);
    }

    return $stat;
}