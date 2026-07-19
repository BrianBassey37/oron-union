-- =====================================================================
-- Oron Union — MySQL schema (member accounts, elections, Hall of Fame)
--
-- Run this ONCE in phpMyAdmin, against the database you created in
-- cPanel and configured in config.php. Safe to re-run: every CREATE
-- TABLE uses IF NOT EXISTS and the category seed uses INSERT IGNORE.
-- =====================================================================

SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 1. MEMBERS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS members (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ref            VARCHAR(20)  NOT NULL UNIQUE,
  member_id      VARCHAR(20)  NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  title          VARCHAR(20),
  firstname      VARCHAR(100),
  middlename     VARCHAR(100),
  lastname       VARCHAR(100),
  dob            DATE NULL,
  gender         VARCHAR(20),
  marital        VARCHAR(30),
  placeofbirth   VARCHAR(150),
  nationality    VARCHAR(100),
  lga            VARCHAR(60),
  clan           VARCHAR(100),
  compound       VARCHAR(150),
  state_origin   VARCHAR(100),
  by_birth       VARCHAR(3),
  connection_note TEXT,
  phone          VARCHAR(30),
  whatsapp       VARCHAR(30),
  email          VARCHAR(190) NOT NULL UNIQUE,
  country        VARCHAR(100),
  state_res      VARCHAR(100),
  address        TEXT,
  qualification  VARCHAR(150),
  field          VARCHAR(150),
  occupation     VARCHAR(150),
  employer       VARCHAR(150),
  bio            TEXT,
  photo_path     VARCHAR(255) NULL,
  endorser_type  VARCHAR(30),
  endorser_lga   VARCHAR(100),
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reject_reason  TEXT NULL,
  approved_at    DATETIME NULL,
  submitted_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  identifier    VARCHAR(190) NOT NULL,
  ip_address    VARCHAR(45),
  success       TINYINT(1) NOT NULL,
  attempted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_identifier_time (identifier, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  actor       VARCHAR(60) NOT NULL,
  action      VARCHAR(100) NOT NULL,
  details     TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 2. ELECTIONS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS elections (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  deadline    DATETIME NULL,
  status      ENUM('active','closed') NOT NULL DEFAULT 'active',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS election_candidates (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  election_id INT NOT NULL,
  name        VARCHAR(150) NOT NULL,
  role        VARCHAR(150),
  initials    VARCHAR(5),
  color       VARCHAR(20) DEFAULT '#800020',
  sort_order  INT DEFAULT 0,
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS election_votes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  election_id  INT NOT NULL,
  candidate_id INT NOT NULL,
  member_id    INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_election_member (election_id, member_id),
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES election_candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 3. HALL OF FAME
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hof_categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  slug        VARCHAR(60) NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order  INT DEFAULT 0,
  active      TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hof_nominees (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name        VARCHAR(150) NOT NULL,
  photo_url   VARCHAR(500),
  bio         TEXT,
  sort_order  INT DEFAULT 0,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES hof_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hof_votes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category_id  INT NOT NULL,
  nominee_id   INT NOT NULL,
  voter_name   VARCHAR(150) NOT NULL,
  voter_email  VARCHAR(190) NOT NULL,
  voter_phone  VARCHAR(30),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category_email (category_id, voter_email),
  FOREIGN KEY (category_id) REFERENCES hof_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (nominee_id) REFERENCES hof_nominees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the 7 categories the union chose (idempotent — safe to re-run).
INSERT IGNORE INTO hof_categories (slug, name, description, sort_order) VALUES
  ('lga-chairman',           'Best Performing LGA Chairman',               'Recognising the local government chairman who delivered the most for Oro communities this year.', 1),
  ('influential-politician', 'Most Influential Politician',                'Honouring the Oro politician whose influence and advocacy moved the needle for the Oro Nation.', 2),
  ('philanthropist',         'Outstanding Community Philanthropist',       'Celebrating generosity that has changed lives across Oro communities.', 3),
  ('youth-icon',             'Youth Icon of the Year',                     'Celebrating a young Oro achiever making a mark nationally or in the diaspora.', 4),
  ('diaspora-achiever',      'Diaspora Achiever of the Year',              'Honouring an Oro son or daughter abroad excelling in their field.', 5),
  ('woman-of-the-year',      'Woman of the Year',                          'Recognising outstanding leadership and achievement by an Oro woman.', 6),
  ('performing-appointee',   'Most Performing Appointee (PA/SA/Activist)', 'Honouring aides, special assistants and grassroots activists who delivered real impact.', 7);

-- ─────────────────────────────────────────────────────────────────────
-- 4. EXECUTIVE MEMBER DIRECTORY (CEC, Youth Wing, Women's Wing, OSU,
--    Clan Representatives, Branch Coordinators)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exco_members (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  grp         VARCHAR(100) NOT NULL,
  role        VARCHAR(150) NOT NULL,
  full_name   VARCHAR(150) NOT NULL,
  phone       VARCHAR(30),
  email       VARCHAR(190),
  affiliation VARCHAR(150),
  photo_path  VARCHAR(255),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_grp (grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 5. LIVE TV STREAM (shared state, chat, viewer heartbeat)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stream_config (
  id         INT PRIMARY KEY,
  title      VARCHAR(200) NOT NULL DEFAULT 'Oron Union TV',
  url        VARCHAR(500) NULL,
  is_live    TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO stream_config (id, title, url, is_live) VALUES (1, 'Oron Union TV', NULL, 0);

CREATE TABLE IF NOT EXISTS stream_viewers (
  session_id VARCHAR(64) PRIMARY KEY,
  last_seen  DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stream_chat (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  message    VARCHAR(300) NOT NULL,
  ip_hash    VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 6. MEDIA LIBRARY (photo / video / audio)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS media_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  type         ENUM('photo','video','audio') NOT NULL,
  artist       VARCHAR(150) NULL,
  description  TEXT NULL,
  storage_type ENUM('file','url') NOT NULL,
  file_path    VARCHAR(255) NULL,
  url          VARCHAR(500) NULL,
  file_size    INT NULL,
  mime_type    VARCHAR(100) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 7. BRANCH EXECUTIVE ROSTER (per-branch officers, distinct from the
--    group exco directory in exco_members)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branch_exco (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  branch_id     VARCHAR(40) NOT NULL,
  position_key  VARCHAR(40) NOT NULL,
  full_name     VARCHAR(150) NULL,
  photo_path    VARCHAR(255) NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_pos (branch_id, position_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────
-- 8. EMAIL VERIFICATION (one-time codes for registration + HoF voting)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_codes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  purpose     VARCHAR(30) NOT NULL,
  email       VARCHAR(190) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_purpose_email (purpose, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Done. Verify in phpMyAdmin: members, login_attempts, activity_log,
-- elections, election_candidates, election_votes, hof_categories
-- (7 rows), hof_nominees, hof_votes, exco_members, stream_config
-- (1 row), stream_viewers, stream_chat, media_items, branch_exco,
-- otp_codes.
-- =====================================================================
