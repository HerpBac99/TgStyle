const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const http = require('http');
const https = require('https');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8443;
const HTTP_PORT = 80;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection (только если указан URI)
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('Connected to MongoDB'))
        .catch(err => {
            console.error('MongoDB connection error:', err);
            console.log('Continuing without MongoDB...');
        });
} else {
    console.log('MongoDB URI not provided, continuing without database');
}

// API routes
app.use('/api/auth', require('./src/api/auth'));
app.use('/api/analyze', require('./src/api/analyze'));
app.use('/api', require('./routes/api'));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// All routes serve the main HTML file for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Функция для запуска HTTP сервера (перенаправление на HTTPS)
function startHttpServer() {
    const httpServer = http.createServer((req, res) => {
        // Перенаправляем на HTTPS
        res.writeHead(301, {
            Location: `https://${req.headers.host}${req.url}`
        });
        res.end();
    });
    
    httpServer.listen(HTTP_PORT, () => {
        console.log(`HTTP server running on port ${HTTP_PORT} (redirecting to HTTPS)`);
    });
}

// Функция для запуска HTTPS сервера
function startHttpsServer() {
    try {
        // Проверяем наличие SSL сертификатов
        const sslDir = path.join(__dirname, 'ssl');
        
        // Пробуем сначала сертификаты Let's Encrypt
        let certPath = path.join(sslDir, 'live/flappy.keenetic.link/fullchain.pem');
        let keyPath = path.join(sslDir, 'live/flappy.keenetic.link/privkey.pem');
        
        // Если нет Let's Encrypt, используем самоподписанные
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
            console.log('Сертификаты Let\'s Encrypt не найдены, проверяем самоподписанные...');
            certPath = path.join(sslDir, 'cert.pem');
            keyPath = path.join(sslDir, 'key.pem');
        } else {
            console.log('Используем сертификаты Let\'s Encrypt');
        }
        
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            // Настройки SSL
            const options = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPath)
            };
            
            // Создаем HTTPS сервер
            const httpsServer = https.createServer(options, app);
            
            httpsServer.listen(PORT, () => {
                console.log(`HTTPS server running on port ${PORT}`);
                console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
            });
            
            return true;
        } else {
            console.warn('SSL certificates not found, falling back to HTTP');
            return false;
        }
    } catch (error) {
        console.error('Error starting HTTPS server:', error);
        return false;
    }
}

// Запускаем серверы
const httpsStarted = startHttpsServer();
if (!httpsStarted) {
    // Если не удалось запустить HTTPS, запускаем обычный HTTP сервер
    app.listen(PORT, () => {
        console.log(`HTTP server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
} else {
    // Запускаем HTTP сервер для перенаправления на HTTPS
    startHttpServer();
} 