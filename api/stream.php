<?php
/**
 * api/stream.php — Live TV: shared stream config, viewer heartbeat, chat.
 *
 * Actions:
 *   GET  ?action=status                                     (public)
 *   POST ?action=set     {title, url, isLive}                (admin session)
 *   POST ?action=heartbeat {sessionId}                       (public)
 *   GET  ?action=chat_list [?afterId=]                       (public)
 *   POST ?action=chat_send {name, message}                   (public, rate-limited)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, ['status', 'set', 'heartbeat', 'chat_list', 'chat_send']);

function active_viewer_count() {
    db()->exec("DELETE FROM stream_viewers WHERE last_seen < (NOW() - INTERVAL 5 MINUTE)");
    $row = db()->query("SELECT COUNT(*) AS n FROM stream_viewers WHERE last_seen > (NOW() - INTERVAL 45 SECOND)")->fetch();
    return (int) $row['n'];
}

switch ($action) {

case 'status': {
    $row = db()->query('SELECT title, url, is_live, updated_at FROM stream_config WHERE id = 1')->fetch();
    if (!$row) $row = ['title' => 'Oron Union TV', 'url' => null, 'is_live' => 0, 'updated_at' => null];
    json_ok([
        'title'   => $row['title'],
        'url'     => $row['url'],
        'isLive'  => (bool) $row['is_live'],
        'updatedAt' => $row['updated_at'],
        'viewerCount' => active_viewer_count(),
    ]);
}

case 'set': {
    require_admin();
    $title = trim($body['title'] ?? '') ?: 'Oron Union TV';
    $url = trim($body['url'] ?? '');
    $isLive = !empty($body['isLive']) ? 1 : 0;

    $stmt = db()->prepare(
        'UPDATE stream_config SET title = ?, url = ?, is_live = ? WHERE id = 1'
    );
    $stmt->execute([$title, $url ?: null, $isLive]);
    log_activity('admin', 'set_stream', $isLive ? "live: $url" : 'offline');
    json_ok();
}

case 'heartbeat': {
    $sessionId = trim($body['sessionId'] ?? '');
    if (!$sessionId) json_error('Missing sessionId.');
    $stmt = db()->prepare(
        'INSERT INTO stream_viewers (session_id, last_seen) VALUES (?, NOW())
         ON DUPLICATE KEY UPDATE last_seen = NOW()'
    );
    $stmt->execute([substr($sessionId, 0, 64)]);
    json_ok(['viewerCount' => active_viewer_count()]);
}

case 'chat_list': {
    $afterId = (int) ($_GET['afterId'] ?? 0);
    if ($afterId > 0) {
        $stmt = db()->prepare('SELECT id, name, message, created_at FROM stream_chat WHERE id > ? ORDER BY id ASC LIMIT 100');
        $stmt->execute([$afterId]);
    } else {
        $stmt = db()->query('SELECT id, name, message, created_at FROM stream_chat ORDER BY id DESC LIMIT 60');
    }
    $rows = $stmt->fetchAll();
    if (!$afterId) $rows = array_reverse($rows);
    json_ok(['messages' => $rows]);
}

case 'chat_send': {
    $name = trim($body['name'] ?? '') ?: 'Anonymous';
    $message = trim($body['message'] ?? '');
    if (!$message) json_error('Enter a message.');
    if (mb_strlen($name) > 60) $name = mb_substr($name, 0, 60);
    if (mb_strlen($message) > 300) $message = mb_substr($message, 0, 300);

    $ipHash = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');

    $recent = db()->prepare(
        'SELECT 1 FROM stream_chat WHERE ip_hash = ? AND created_at > (NOW() - INTERVAL 2 SECOND)'
    );
    $recent->execute([$ipHash]);
    if ($recent->fetch()) json_error('You are sending messages too fast.', 429);

    $stmt = db()->prepare('INSERT INTO stream_chat (name, message, ip_hash) VALUES (?, ?, ?)');
    $stmt->execute([$name, $message, $ipHash]);
    json_ok(['id' => (int) db()->lastInsertId()]);
}

}
