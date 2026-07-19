<?php
/**
 * api/applications.php — membership application review, used by both
 * admin.html and endorser.html (whichever gated session is active).
 *
 * Actions:
 *   GET  ?action=list                                   (admin or endorser session)
 *   POST ?action=review  {ref, decision, reason}         (admin or endorser session)
 *   GET  ?action=roster&lga=...                          (public — approved members only, safe fields)
 */

require_once __DIR__ . '/../lib/auth.php';
start_secure_session();

function require_admin_or_endorser() {
    if (empty($_SESSION['is_admin']) && empty($_SESSION['is_endorser'])) {
        json_error('Sign in required', 403);
    }
    return !empty($_SESSION['is_admin']) ? 'admin' : 'endorser';
}

$body = read_json_body();
$action = require_action($body, ['list', 'review', 'roster']);

function public_application($m) {
    unset($m['password_hash']);
    return $m;
}

switch ($action) {

case 'list': {
    require_admin_or_endorser();
    $rows = db()->query('SELECT * FROM members ORDER BY submitted_at DESC')->fetchAll();
    json_ok(['members' => array_map('public_application', $rows)]);
}

case 'review': {
    $actor = require_admin_or_endorser();
    $ref = $body['ref'] ?? '';
    $decision = $body['decision'] ?? '';
    $reason = $body['reason'] ?? null;
    if (!$ref || !in_array($decision, ['approved', 'rejected'], true)) {
        json_error('Invalid request.');
    }

    $stmt = db()->prepare('SELECT * FROM members WHERE ref = ?');
    $stmt->execute([$ref]);
    $m = $stmt->fetch();
    if (!$m) json_error('Application not found.', 404);

    if ($decision === 'approved') {
        $memberId = generate_member_id($m['lga']);
        $stmt = db()->prepare(
            'UPDATE members SET status = "approved", member_id = ?, approved_at = NOW(), reject_reason = NULL WHERE ref = ?'
        );
        $stmt->execute([$memberId, $ref]);
        log_activity($actor, 'approve_member', $ref . ' -> ' . $memberId);
        $m['status'] = 'approved';
        $m['member_id'] = $memberId;
    } else {
        $stmt = db()->prepare('UPDATE members SET status = "rejected", reject_reason = ? WHERE ref = ?');
        $stmt->execute([$reason, $ref]);
        log_activity($actor, 'reject_member', $ref . ($reason ? ' (' . $reason . ')' : ''));
        $m['status'] = 'rejected';
        $m['reject_reason'] = $reason;
    }

    json_ok(['member' => public_application($m)]);
}

case 'roster': {
    $lga = $_GET['lga'] ?? '';
    if (!$lga) json_error('Missing lga parameter.');
    $stmt = db()->prepare(
        "SELECT firstname, lastname, member_id, lga, photo_path, approved_at
         FROM members
         WHERE status = 'approved' AND (endorser_lga = ? OR (endorser_type = 'clan-rep' AND lga = ?))
         ORDER BY approved_at ASC"
    );
    $stmt->execute([$lga, $lga]);
    json_ok(['members' => $stmt->fetchAll()]);
}

}
