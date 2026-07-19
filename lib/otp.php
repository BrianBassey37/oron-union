<?php
/**
 * Email one-time-passcode helpers, shared by member registration and
 * Hall of Fame voting. Codes are 6 digits, hashed at rest, expire after
 * 10 minutes, and are rate-limited per email+purpose to deter abuse of
 * the mail() call (which is otherwise an open spam-relay vector).
 */

require_once __DIR__ . '/db.php';

function send_otp_email($email, $purpose) {
    $stmt = db()->prepare(
        'SELECT COUNT(*) AS n FROM otp_codes WHERE email = ? AND purpose = ? AND created_at > (NOW() - INTERVAL 1 HOUR)'
    );
    $stmt->execute([$email, $purpose]);
    if ((int) $stmt->fetch()['n'] >= 5) {
        return ['ok' => false, 'error' => 'Too many code requests for this email. Please try again in an hour.'];
    }

    $stmt = db()->prepare(
        'SELECT created_at FROM otp_codes WHERE email = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1'
    );
    $stmt->execute([$email, $purpose]);
    $last = $stmt->fetch();
    if ($last && (time() - strtotime($last['created_at'])) < 45) {
        return ['ok' => false, 'error' => 'Please wait a moment before requesting another code.'];
    }

    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $hash = password_hash($code, PASSWORD_BCRYPT);

    $stmt = db()->prepare(
        'INSERT INTO otp_codes (purpose, email, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))'
    );
    $stmt->execute([$purpose, $email, $hash]);

    $fromName = defined('MAIL_FROM_NAME') ? MAIL_FROM_NAME : 'Oron Union';
    $fromAddr = defined('MAIL_FROM_ADDRESS') ? MAIL_FROM_ADDRESS : 'noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost');

    $subject = 'Your Oron Union verification code';
    $body = "Your verification code is: $code\r\n\r\nThis code expires in 10 minutes. If you did not request this, you can safely ignore this email.\r\n\r\n" . $fromName;
    $headers = 'From: ' . $fromName . ' <' . $fromAddr . '>' . "\r\n" .
               'Content-Type: text/plain; charset=UTF-8';

    $sent = @mail($email, $subject, $body, $headers);
    if (!$sent) {
        return ['ok' => false, 'error' => 'Could not send the verification email. Please try again shortly.'];
    }
    return ['ok' => true];
}

function verify_otp($email, $purpose, $code) {
    $stmt = db()->prepare(
        'SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1'
    );
    $stmt->execute([$email, $purpose]);
    $row = $stmt->fetch();
    if (!$row) return false;
    if ((int) $row['attempts'] >= 5) return false;

    if (!password_verify((string) $code, $row['code_hash'])) {
        db()->prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$row['id']]);
        return false;
    }

    db()->prepare('UPDATE otp_codes SET consumed_at = NOW() WHERE id = ?')->execute([$row['id']]);
    return true;
}
