import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

router.get('/health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', message: 'HR Assistant backend is running' });
});

export default router;
