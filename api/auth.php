<?php
/**
 * api/auth.php — member registration/login/logout, admin/endorser login.
 *
 * Actions:
 *   POST ?action=register        (multipart/form-data + photo file)
 *   POST ?action=login           {identifier, password}
 *   POST ?action=logout          {}
 *   GET  ?action=me
 *   POST ?action=admin_login     {code}
 *   GET  ?action=admin_status
 *   POST ?action=endorser_login  {code}
 *   GET  ?action=endorser_status
 */

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/uploads.php';
start_secure_session();

$isMultipart = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false;
$body = $isMultipart ? $_POST : read_json_body();
$action = require_action($body, [
    'register', 'login', 'logout', 'me',
    'admin_login', 'admin_status', 'endorser_login', 'endorser_status',
]);

function public_member($m) {
    unset($m['password_hash']);
    return $m;
}

switch ($action) {

case 'register': {
    $required = ['title', 'firstname', 'lastname', 'email', 'password', 'lga'];
    foreach ($required as $f) {
        if (empty($body[$f])) json_error("Missing required field: $f");
    }
    if (strlen($body['password']) < 6) json_error('Password must be at least 6 characters.');

    if (empty($_SESSION['email_verified_register']) || $_SESSION['email_verified_register'] !== $body['email']) {
        json_error('Please verify your email address before submitting.', 403, ['needsVerification' => true]);
    }

    $stmt = db()->prepare('SELECT id FROM members WHERE email = ?');
    $stmt->execute([$body['email']]);
    if ($stmt->fetch()) {
        json_error('An account with this email already exists. Please sign in on the Elections page instead.');
    }

    $photoPath = handle_photo_upload('photo', 'members');
    $passwordHash = password_hash($body['password'], PASSWORD_BCRYPT);
    $ref = generate_ref();

    $stmt = db()->prepare(
        'INSERT INTO members (
            ref, password_hash, title, firstname, middlename, lastname, dob, gender, marital,
            placeofbirth, nationality, lga, clan, compound, state_origin, by_birth, connection_note,
            phone, whatsapp, email, country, state_res, address, qualification, field, occupation,
            employer, bio, photo_path, endorser_type, endorser_lga
        ) VALUES (
            :ref, :password_hash, :title, :firstname, :middlename, :lastname, :dob, :gender, :marital,
            :placeofbirth, :nationality, :lga, :clan, :compound, :stateOrigin, :byBirth, :connection,
            :phone, :whatsapp, :email, :country, :stateRes, :address, :qualification, :field, :occupation,
            :employer, :bio, :photo_path, :endorserType, :endorserLga
        )'
    );
    $stmt->execute([
        ':ref' => $ref, ':password_hash' => $passwordHash,
        ':title' => $body['title'], ':firstname' => $body['firstname'],
        ':middlename' => $body['middlename'] ?? null, ':lastname' => $body['lastname'],
        ':dob' => ($body['dob'] ?? '') ?: null, ':gender' => $body['gender'] ?? null,
        ':marital' => $body['marital'] ?? null, ':placeofbirth' => $body['placeofbirth'] ?? null,
        ':nationality' => $body['nationality'] ?? null, ':lga' => $body['lga'],
        ':clan' => $body['clan'] ?? null, ':compound' => $body['compound'] ?? null,
        ':stateOrigin' => $body['stateOrigin'] ?? null, ':byBirth' => $body['byBirth'] ?? null,
        ':connection' => $body['connection'] ?? null, ':phone' => $body['phone'] ?? null,
        ':whatsapp' => $body['whatsapp'] ?? null, ':email' => $body['email'],
        ':country' => $body['country'] ?? null, ':stateRes' => $body['stateRes'] ?? null,
        ':address' => $body['address'] ?? null, ':qualification' => $body['qualification'] ?? null,
        ':field' => $body['field'] ?? null, ':occupation' => $body['occupation'] ?? null,
        ':employer' => $body['employer'] ?? null, ':bio' => $body['bio'] ?? null,
        ':photo_path' => $photoPath, ':endorserType' => $body['endorserType'] ?? null,
        ':endorserLga' => $body['endorserLga'] ?? null,
    ]);

    unset($_SESSION['email_verified_register']);
    json_ok(['ref' => $ref]);
}

case 'login': {
    $identifier = trim($body['identifier'] ?? '');
    $password = $body['password'] ?? '';
    if (!$identifier || !$password) json_error('Member not found. Check your credentials or apply for membership.');

    if (is_login_locked_out($identifier)) {
        json_error('Too many failed attempts. Please try again in 15 minutes.', 429);
    }

    $stmt = db()->prepare('SELECT * FROM members WHERE email = ? OR member_id = ? LIMIT 1');
    $stmt->execute([$identifier, $identifier]);
    $m = $stmt->fetch();

    if (!$m || !password_verify($password, $m['password_hash'])) {
        record_login_attempt($identifier, false);
        json_error('Member not found. Check your credentials or apply for membership.');
    }

    if ($m['status'] === 'pending') {
        record_login_attempt($identifier, true);
        json_error('Your application (' . $m['ref'] . ') is still pending endorsement. You will be notified when approved.', 403, ['pending' => true]);
    }
    if ($m['status'] === 'rejected') {
        record_login_attempt($identifier, true);
        $reason = $m['reject_reason'] ? ' Reason: ' . $m['reject_reason'] : ' Contact info@oronunion.org for assistance.';
        json_error('Your application was not approved.' . $reason, 403, ['rejected' => true]);
    }

    record_login_attempt($identifier, true);
    session_regenerate_id(true);
    $_SESSION['member_id'] = $m['id'];
    json_ok(['member' => public_member($m)]);
}

case 'logout': {
    $_SESSION = [];
    session_destroy();
    json_ok();
}

case 'me': {
    $m = current_member();
    json_ok(['member' => $m ? public_member($m) : null]);
}

case 'admin_login': {
    $code = $body['code'] ?? '';
    if (is_login_locked_out('admin')) json_error('Too many failed attempts. Please try again in 15 minutes.', 429);
    if (!hash_equals(ADMIN_CODE, $code)) {
        record_login_attempt('admin', false);
        json_error('Incorrect code. Please try again.');
    }
    record_login_attempt('admin', true);
    session_regenerate_id(true);
    $_SESSION['is_admin'] = true;
    json_ok();
}

case 'admin_status': {
    json_ok(['isAdmin' => !empty($_SESSION['is_admin'])]);
}

case 'endorser_login': {
    $code = $body['code'] ?? '';
    if (is_login_locked_out('endorser')) json_error('Too many failed attempts. Please try again in 15 minutes.', 429);
    if (!hash_equals(ENDORSER_CODE, $code)) {
        record_login_attempt('endorser', false);
        json_error('Incorrect role or access code.');
    }
    record_login_attempt('endorser', true);
    session_regenerate_id(true);
    $_SESSION['is_endorser'] = true;
    json_ok();
}

case 'endorser_status': {
    json_ok(['isEndorser' => !empty($_SESSION['is_endorser'])]);
}

}
