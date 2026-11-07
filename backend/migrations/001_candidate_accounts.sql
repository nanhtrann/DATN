CREATE TABLE IF NOT EXISTS `candidate_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `candidate_id` int(11) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `candidate_id` (`candidate_id`),
  CONSTRAINT `candidate_accounts_ibfk_1` FOREIGN KEY (`candidate_id`)
    REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
