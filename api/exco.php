<?php
/**
 * api/exco.php — Executive member directory (CEC, Youth Wing, Women's
 * Wing, Oro Student Union, Clan Representatives, Branch Coordinators).
 *
 * Actions:
 *   GET  ?action=list&grp=...   (public — grp is required)
 *   POST ?action=submit         multipart/form-data + photo file (public,
 *                                same open-submission model as before)
 */

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/uploads.php';
start_secure_session();

$isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
$body = $isMultipart ? $_POST : read_json_body();
$action = require_action($body, ['list', 'submit']);

switch ($action) {

case 'list': {
    $grp = $_GET['grp'] ?? '';
    if (!$grp) json_error('Missing grp parameter.');
    $stmt = db()->prepare(
        'SELECT id, grp, role, full_name, phone, email, affiliation, photo_path, created_at
         FROM exco_members WHERE grp = ? ORDER BY created_at ASC'
    );
    $stmt->execute([$grp]);
    json_ok(['members' => $stmt->fetchAll()]);
}

case 'submit': {
    $grp = $body['grp'] ?? '';
    $role = $body['role'] ?? '';
    $fullName = trim($body['full_name'] ?? '');
    $phone = trim($body['phone'] ?? '');
    $email = trim($body['email'] ?? '');
    $affiliation = $body['affiliation'] ?? '';

    if (!$grp || !$role || !$fullName || !$phone) {
        json_error('Please fill in all required fields.');
    }

    $photoPath = handle_photo_upload('photo', 'exco');

    $stmt = db()->prepare(
        'INSERT INTO exco_members (grp, role, full_name, phone, email, affiliation, photo_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$grp, $role, $fullName, $phone, $email ?: null, $affiliation ?: null, $photoPath]);

    json_ok();
}

}
