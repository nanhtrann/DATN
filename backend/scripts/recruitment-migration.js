import { pool } from '../src/db/pool.js';

async function columnExists(table, column) {
    const [rows] = await pool.execute(
        `SELECT COUNT(*) AS total FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return Number(rows[0].total) > 0;
}

async function ensureColumn(table, column, definition) {
    if (await columnExists(table, column)) return;
    await pool.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

await ensureColumn('candidates', 'source', 'VARCHAR(100) NULL');
await ensureColumn('candidates', 'tags', 'TEXT NULL');
await ensureColumn('applications', 'rating', 'TINYINT UNSIGNED NULL');
await ensureColumn('applications', 'internal_notes', 'TEXT NULL');

await pool.execute(`
    CREATE TABLE IF NOT EXISTS application_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        application_id INT NOT NULL,
        user_id INT NULL,
        note TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_application_notes_application (application_id),
        CONSTRAINT fk_application_notes_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
        CONSTRAINT fk_application_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

await pool.execute(`
    CREATE TABLE IF NOT EXISTS offers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        application_id INT NOT NULL,
        salary VARCHAR(100) NULL,
        start_date DATE NULL,
        status ENUM('draft','sent','accepted','declined','withdrawn') NOT NULL DEFAULT 'draft',
        details TEXT NULL,
        sent_at DATETIME NULL,
        responded_at DATETIME NULL,
        created_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_application_offer (application_id),
        CONSTRAINT fk_offer_application FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
        CONSTRAINT fk_offer_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);

console.log('Recruitment schema is ready.');
await pool.end();
