<?php
/**
 * Shared image-upload handling: validate, strip EXIF via re-encode
 * through GD, save under uploads/<subdir>/ with a random filename.
 * Used by member registration photos and Exco member photos.
 */

function handle_photo_upload($fieldName, $subdir) {
    if (empty($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] !== UPLOAD_ERR_OK) {
        json_error('Please upload a photo.');
    }
    $tmp = $_FILES[$fieldName]['tmp_name'];
    if ($_FILES[$fieldName]['size'] > 5 * 1024 * 1024) {
        json_error('Photo is too large. Max 5MB allowed.');
    }
    $info = @getimagesize($tmp);
    if (!$info) json_error('That file is not a valid image.');

    $type = $info[2];
    switch ($type) {
        case IMAGETYPE_JPEG: $img = imagecreatefromjpeg($tmp); break;
        case IMAGETYPE_PNG:  $img = imagecreatefrompng($tmp); break;
        case IMAGETYPE_GIF:  $img = imagecreatefromgif($tmp); break;
        case IMAGETYPE_WEBP:
            if (!function_exists('imagecreatefromwebp')) json_error('Unsupported image format.');
            $img = imagecreatefromwebp($tmp);
            break;
        default:
            json_error('Please upload a JPEG, PNG, GIF or WEBP image.');
    }
    if (!$img) json_error('Could not read that image.');

    $dir = __DIR__ . '/../uploads/' . $subdir;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $filename = bin2hex(random_bytes(16)) . '.jpg';
    $path = $dir . '/' . $filename;

    // Re-saving through GD as JPEG strips EXIF/any embedded payload.
    imagejpeg($img, $path, 85);
    imagedestroy($img);

    return 'uploads/' . $subdir . '/' . $filename;
}

/**
 * Shared video/audio upload handling: validate MIME type against an
 * allow-list (GD can't re-encode these, so we validate + move as-is),
 * save under uploads/<subdir>/ with a random filename.
 */
function handle_media_file_upload($fieldName, $subdir) {
    if (empty($_FILES[$fieldName]) || $_FILES[$fieldName]['error'] !== UPLOAD_ERR_OK) {
        json_error('Please choose a file to upload.');
    }
    $tmp  = $_FILES[$fieldName]['tmp_name'];
    $size = $_FILES[$fieldName]['size'];
    if ($size > 100 * 1024 * 1024) {
        json_error('File is too large. Max 100MB allowed.');
    }

    $allowed = [
        'video/mp4'  => ['mp4', 'video'],
        'video/webm' => ['webm', 'video'],
        'video/ogg'  => ['ogv', 'video'],
        'video/quicktime' => ['mov', 'video'],
        'audio/mpeg' => ['mp3', 'audio'],
        'audio/mp3'  => ['mp3', 'audio'],
        'audio/wav'  => ['wav', 'audio'],
        'audio/x-wav' => ['wav', 'audio'],
        'audio/ogg'  => ['ogg', 'audio'],
    ];

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime  = $finfo->file($tmp);
    if (!isset($allowed[$mime])) {
        json_error('Unsupported file type. Please upload MP4/WEBM video or MP3/WAV/OGG audio.');
    }
    [$ext, $kind] = $allowed[$mime];

    $dir = __DIR__ . '/../uploads/' . $subdir;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    $filename = bin2hex(random_bytes(16)) . '.' . $ext;
    $path = $dir . '/' . $filename;

    if (!move_uploaded_file($tmp, $path)) {
        json_error('Could not save the uploaded file.');
    }

    return [
        'path'      => 'uploads/' . $subdir . '/' . $filename,
        'mime'      => $mime,
        'size'      => $size,
        'kind'      => $kind,
    ];
}
