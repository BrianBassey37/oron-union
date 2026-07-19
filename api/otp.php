<?php
/**
 * api/otp.php — email verification codes for membership registration
 * and Hall of Fame voting.
 *
 * Actions:
 *   POST ?action=send    {email, purpose}        (public, rate-limited)
 *   POST ?action=verify  {email, purpose, code}   (public)
 *
 * On successful verify, a session flag is set (email_verified_register
 * or email_verified_hof) that api/auth.php's register action and
 * api/hof.php's vote action check before proceeding — the raw code
 * never has to be threaded through those later requests.
 */

require_once __DIR__ . '/../lib/auth.php';
require_once __DIR__ . '/../lib/otp.php';
start_secure_session();

$body = read_json_body();
$action = require_action($body, ['send', 'verify']);

$PURPOSES = ['register', 'hof_vote'];

switch ($action) {

case 'send': {
    $email = trim($body['email'] ?? '');
    $purpose = $body['purpose'] ?? '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Please enter a valid email address.');
    if (!in_array($purpose, $PURPOSES, true)) json_error('Invalid request.');

    $result = send_otp_email($email, $purpose);
    if (!$result['ok']) json_error($result['error']);
    json_ok();
}

case 'verify': {
    $email = trim($body['email'] ?? '');
    $purpose = $body['purpose'] ?? '';
    $code = trim($body['code'] ?? '');
    if (!$email || !$code) json_error('Enter the code sent to your email.');
    if (!in_array($purpose, $PURPOSES, true)) json_error('Invalid request.');

    if (!verify_otp($email, $purpose, $code)) {
        json_error('That code is incorrect or has expired. Please try again or resend a new code.');
    }

    if ($purpose === 'register') {
        $_SESSION['email_verified_register'] = $email;
    } else {
        $_SESSION['email_verified_hof'] = $email;
    }
    json_ok();
}

}
