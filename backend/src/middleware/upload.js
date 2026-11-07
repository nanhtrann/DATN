import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/env.js';
import { httpError } from '../utils/http.js';

export const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, callback) => {
            try {
                await fs.mkdir(config.uploadDirectory, { recursive: true });
                callback(null, config.uploadDirectory);
            } catch (error) {
                callback(error);
            }
        },
        filename: (req, file, callback) => callback(null, `${Date.now()}-${randomBytes(12).toString('hex')}.pdf`)
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
            return callback(httpError(400, 'Chỉ chấp nhận file CV định dạng PDF.'));
        }
        return callback(null, true);
    }
});
