const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Import Routes
const whatsappRoutes = require('./src/routes/whatsapp');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Chatery WhatsApp API',
        version: '1.0.0',
        endpoints: {
            sessions: {
                list: 'GET /api/whatsapp/sessions',
                connect: 'POST /api/whatsapp/sessions/:sessionId/connect',
                status: 'GET /api/whatsapp/sessions/:sessionId/status',
                qrCode: 'GET /api/whatsapp/sessions/:sessionId/qr',
                qrImage: 'GET /api/whatsapp/sessions/:sessionId/qr/image',
                delete: 'DELETE /api/whatsapp/sessions/:sessionId'
            },
            chat: {
                sendText: 'POST /api/whatsapp/chats/send-text',
                sendImage: 'POST /api/whatsapp/chats/send-image',
                sendDocument: 'POST /api/whatsapp/chats/send-document',
                sendLocation: 'POST /api/whatsapp/chats/send-location',
                sendContact: 'POST /api/whatsapp/chats/send-contact',
                sendButton: 'POST /api/whatsapp/chats/send-button',
                checkNumber: 'POST /api/whatsapp/chats/check-number',
                profilePicture: 'POST /api/whatsapp/chats/profile-picture',
                contactInfo: 'POST /api/whatsapp/chats/contact-info'
            },
            history: {
                overview: 'POST /api/whatsapp/chats/overview { sessionId, limit?, offset?, type? }',
                contacts: 'POST /api/whatsapp/contacts { sessionId, limit?, offset?, search? }',
                messages: 'POST /api/whatsapp/chats/messages { sessionId, chatId, limit?, cursor? }',
                info: 'POST /api/whatsapp/chats/info { sessionId, chatId }'
            }
        }
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// WhatsApp Routes
app.use('/api/whatsapp', whatsappRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Chatery WhatsApp API running on http://localhost:${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}`);
});
