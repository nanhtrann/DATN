import cors from 'cors';
import express from 'express';
import { config } from './config/env.js';
import { verifyDatabaseConnection } from './db/pool.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import authRoutes, { privateRouter as privateAuthRoutes } from './routes/auth.routes.js';
import applicationRoutes from './routes/applications.routes.js';
import candidatesRoutes from './routes/candidates.routes.js';
import candidatePortalRoutes from './routes/candidate-portal.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import healthRoutes from './routes/health.routes.js';
import interviewsRoutes from './routes/interviews.routes.js';
import jobsRoutes from './routes/jobs.routes.js';
import usersRoutes from './routes/users.routes.js';
import offersRoutes from './routes/offers.routes.js';

export function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '1mb' }));
    app.use(healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/candidate-portal', candidatePortalRoutes.publicRouter);
    app.use('/api/candidate-portal', candidatePortalRoutes.privateRouter);
    app.use('/api', authenticate);
    app.use('/api/auth', privateAuthRoutes);
    app.use('/api/jobs', jobsRoutes);
    app.use('/api/applications', applicationRoutes);
    app.use('/api/candidates', candidatesRoutes);
    app.use('/api/interviews', interviewsRoutes);
    app.use('/api', dashboardRoutes);
    app.use('/api/users', usersRoutes);
    app.use('/api/offers', offersRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

export const app = createApp();

export async function start() {
    if (config.isProduction && (!config.jwtSecret || config.jwtSecret.length < 32)) {
        throw new Error('JWT_SECRET must be at least 32 characters in production.');
    }
    await verifyDatabaseConnection();
    return app.listen(config.port, () => console.log(`Server listening at http://localhost:${config.port}`));
}
