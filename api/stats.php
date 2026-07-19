<?php
/**
 * api/stats.php — small public counters shown on the site (e.g. the
 * homepage "members" stat), backed by real data instead of localStorage.
 *
 * Actions:
 *   GET ?action=member_count   (public)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, ['member_count']);

switch ($action) {

case 'member_count': {
    $row = db()->query("SELECT COUNT(*) AS n FROM members WHERE status = 'approved'")->fetch();
    json_ok(['count' => (int) $row['n']]);
}

}
