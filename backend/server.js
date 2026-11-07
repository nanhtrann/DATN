import { start } from './src/app.js';

start().catch((error) => {
    console.error('Backend startup failed:', error);
    process.exitCode = 1;
});
