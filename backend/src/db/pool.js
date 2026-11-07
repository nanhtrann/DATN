import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

export const pool = mysql.createPool({
    ...config.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: config.database.connectionLimit,
    queueLimit: 0,
    dateStrings: true
});

export async function verifyDatabaseConnection() {
    await pool.query('SELECT 1');
}
