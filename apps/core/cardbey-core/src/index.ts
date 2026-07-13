// apps/core/cardbey-core/src/index.ts

import express from 'express';
import cors from 'cors';
// ... your existing imports ...

// ✅ Import development routes
import developmentRoutes from './routes/development.routes.js';

// ... your existing code ...

// Create express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// ✅ REGISTER DEVELOPMENT ROUTES
// ============================================================
app.use('/api', developmentRoutes);
console.log('✅ Development routes registered at /api/development/*');

// ============================================================
// YOUR EXISTING ROUTES
// ============================================================
// ... your existing routes ...

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ============================================================
// Error Handler
// ============================================================
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Development API: http://localhost:${PORT}/api/development/*`);
});

export default app;