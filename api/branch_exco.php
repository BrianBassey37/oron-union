<?php
/**
 * api/branch_exco.php — Per-branch officer roster (President, Secretary,
 * Treasurer, PRO, etc. for each of the 14 branches/chapters). Distinct
 * from exco_members, which holds the group directories (CEC, Youth Wing,
 * Women's Wing, OSU, Clan Reps).
 *
 * Actions:
 *   GET  ?action=list                                    (public)
 *   POST ?action=save {entries:[{branchId,positionKey,fullName,photoUrl}]} (admin session)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, ['list', 'save']);

switch ($action) {

case 'list': {
    $rows = db()->query(
        'SELECT branch_id, position_key, full_name, photo_path, updated_at FROM branch_exco'
    )->fetchAll();
    json_ok(['entries' => $rows]);
}

case 'save': {
    require_admin();
    $entries = $body['entries'] ?? [];
    if (!is_array($entries)) json_error('Invalid payload.');

    $stmt = db()->prepare(
        'INSERT INTO branch_exco (branch_id, position_key, full_name, photo_path)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), photo_path = VALUES(photo_path)'
    );
    foreach ($entries as $e) {
        $branchId = $e['branchId'] ?? '';
        $positionKey = $e['positionKey'] ?? '';
        if (!$branchId || !$positionKey) continue;
        $fullName = trim($e['fullName'] ?? '');
        $photoUrl = trim($e['photoUrl'] ?? '');
        $stmt->execute([$branchId, $positionKey, $fullName ?: null, $photoUrl ?: null]);
    }
    log_activity('admin', 'save_branch_exco', count($entries) . ' entries');
    json_ok();
}

}
