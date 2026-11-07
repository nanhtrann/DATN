import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const config = Object.freeze({
    port: Number(process.env.PORT || 5000),
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'hr_assistant_db',
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
    },
    jwtSecret: process.env.JWT_SECRET,
    adminSetupKey: process.env.ADMIN_SETUP_KEY,
    uploadDirectory: path.join(backendDirectory, 'uploads'),
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    smtp: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        secure: String(process.env.SMTP_SECURE || 'false') === 'true'
    },
    appTimeZone: process.env.APP_TIME_ZONE || 'Asia/Ho_Chi_Minh',
    isProduction: process.env.NODE_ENV === 'production'
});
