// Vercel Serverless Function Handler
// Entry point for Vercel's serverless functions

try {
    const app = require('../index');
    if (!app) {
        throw new Error('App module is null or undefined');
    }
    module.exports = app;
} catch (error) {
    console.error('❌ Failed to load main app, using fallback:', error.message);
    
    // Fallback: Create a minimal working app
    const express = require('express');
    const cors = require('cors');
    const fallbackApp = express();
    
    fallbackApp.use(cors());
    fallbackApp.use(express.json());
    
    // Health check always works
    fallbackApp.get('/health', (req, res) => {
        res.json({ 
            status: 'operational', 
            version: '2.0',
            mode: 'fallback',
            timestamp: new Date().toISOString()
        });
    });
    
    fallbackApp.get('/', (req, res) => {
        res.json({ 
            message: 'Landslide Detector Backend API', 
            status: 'running',
            mode: 'fallback',
            version: '2.0'
        });
    });
    
    // CORS test
    fallbackApp.get('/cors-test', (req, res) => {
        res.json({ 
            message: 'CORS is working!',
            origin: req.get('origin') || 'no-origin'
        });
    });
    
    // Predict endpoint returns informative error
    fallbackApp.post('/predict', (req, res) => {
        res.status(503).json({ 
            error: 'Service temporarily unavailable',
            reason: 'Backend initialization failed',
            message: error.message,
            suggestion: 'The backend is starting up. Please try again in a moment.'
        });
    });
    
    // Any other route
    fallbackApp.all('*', (req, res) => {
        res.status(503).json({ 
            error: 'Service unavailable',
            path: req.path,
            method: req.method
        });
    });
    
    module.exports = fallbackApp;
}
