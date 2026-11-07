ALTER TABLE interviews
    ADD COLUMN confirmation_status ENUM('pending', 'confirmed', 'declined') NOT NULL DEFAULT 'pending',
    ADD COLUMN reminder_sent_at DATETIME NULL,
    ADD COLUMN notes TEXT NULL;

ALTER TABLE applications
    ADD COLUMN outcome_reason VARCHAR(255) NULL,
    ADD COLUMN outcome_notes TEXT NULL,
    ADD COLUMN decision_at DATETIME NULL,
    ADD COLUMN decision_by INT NULL,
    ADD INDEX idx_applications_decision_at (decision_at),
    ADD CONSTRAINT fk_applications_decision_by
        FOREIGN KEY (decision_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;
