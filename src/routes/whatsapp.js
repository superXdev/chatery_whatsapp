const express = require('express');
const router = express.Router();
const whatsappManager = require('../services/whatsapp');

// Get all sessions
router.get('/sessions', (req, res) => {
    try {
        const sessions = whatsappManager.getAllSessions();
        res.json({
            success: true,
            message: 'Sessions retrieved',
            data: sessions.map(s => ({
                sessionId: s.sessionId,
                status: s.status,
                isConnected: s.isConnected,
                phoneNumber: s.phoneNumber,
                name: s.name
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create/Connect a session
router.post('/sessions/:sessionId/connect', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await whatsappManager.createSession(sessionId);
        
        res.json({
            success: result.success,
            message: result.message,
            data: result.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get session status
router.get('/sessions/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        const info = session.getInfo();
        res.json({
            success: true,
            message: 'Status retrieved',
            data: {
                sessionId: info.sessionId,
                status: info.status,
                isConnected: info.isConnected,
                phoneNumber: info.phoneNumber,
                name: info.name
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get QR Code for session
router.get('/sessions/:sessionId/qr', (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = whatsappManager.getSessionQR(sessionId);
        
        if (!sessionInfo) {
            return res.status(404).json({
                success: false,
                message: 'Session not found. Please create session first.'
            });
        }

        if (sessionInfo.isConnected) {
            return res.json({
                success: true,
                message: 'Already connected to WhatsApp',
                data: { 
                    sessionId: sessionInfo.sessionId,
                    status: 'connected', 
                    qrCode: null 
                }
            });
        }

        if (!sessionInfo.qrCode) {
            return res.status(404).json({
                success: false,
                message: 'QR Code not available yet. Please wait...',
                data: { status: sessionInfo.status }
            });
        }

        res.json({
            success: true,
            message: 'QR Code ready',
            data: {
                sessionId: sessionInfo.sessionId,
                qrCode: sessionInfo.qrCode,
                status: sessionInfo.status
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get QR Code as Image for session
router.get('/sessions/:sessionId/qr/image', (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = whatsappManager.getSessionQR(sessionId);
        
        if (!sessionInfo || !sessionInfo.qrCode) {
            return res.status(404).send('QR Code not available');
        }

        // Konversi base64 ke buffer dan kirim sebagai image
        const base64Data = sessionInfo.qrCode.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.set('Content-Type', 'image/png');
        res.send(imgBuffer);
    } catch (error) {
        res.status(500).send('Error generating QR image');
    }
});

// Delete/Logout a session
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await whatsappManager.deleteSession(sessionId);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== CHAT API ====================

// Middleware untuk check session dari body
const checkSession = (req, res, next) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Missing required field: sessionId'
        });
    }
    
    const session = whatsappManager.getSession(sessionId);
    
    if (!session) {
        return res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
    
    if (session.connectionStatus !== 'connected') {
        return res.status(400).json({
            success: false,
            message: 'Session not connected. Please scan QR code first.'
        });
    }
    
    req.session = session;
    next();
};

// Send text message
router.post('/chats/send-text', checkSession, async (req, res) => {
    try {
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, message'
            });
        }

        const result = await req.session.sendTextMessage(to, message);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send image
router.post('/chats/send-image', checkSession, async (req, res) => {
    try {
        const { to, imageUrl, caption } = req.body;
        
        if (!to || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, imageUrl'
            });
        }

        const result = await req.session.sendImage(to, imageUrl, caption || '');
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send document
router.post('/chats/send-document', checkSession, async (req, res) => {
    try {
        const { to, documentUrl, filename, mimetype } = req.body;
        
        if (!to || !documentUrl || !filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, documentUrl, filename'
            });
        }

        const result = await req.session.sendDocument(to, documentUrl, filename, mimetype);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send location
router.post('/chats/send-location', checkSession, async (req, res) => {
    try {
        const { to, latitude, longitude, name } = req.body;
        
        if (!to || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, latitude, longitude'
            });
        }

        const result = await req.session.sendLocation(to, latitude, longitude, name || '');
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send contact
router.post('/chats/send-contact', checkSession, async (req, res) => {
    try {
        const { to, contactName, contactPhone } = req.body;
        
        if (!to || !contactName || !contactPhone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, contactName, contactPhone'
            });
        }

        const result = await req.session.sendContact(to, contactName, contactPhone);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send button message
router.post('/chats/send-button', checkSession, async (req, res) => {
    try {
        const { to, text, footer, buttons } = req.body;
        
        if (!to || !text || !buttons || !Array.isArray(buttons)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: to, text, buttons (array)'
            });
        }

        const result = await req.session.sendButton(to, text, footer || '', buttons);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Check if number is registered on WhatsApp
router.post('/chats/check-number', checkSession, async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: phone'
            });
        }
        
        const result = await req.session.isRegistered(phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get profile picture
router.post('/chats/profile-picture', checkSession, async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: phone'
            });
        }
        
        const result = await req.session.getProfilePicture(phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== CHAT HISTORY API ====================

/**
 * Get chats overview - hanya chat yang punya pesan
 * Body: { sessionId, limit?, offset?, type? }
 * type: 'all' | 'personal' | 'group'
 */
router.post('/chats/overview', checkSession, async (req, res) => {
    try {
        const { limit = 50, offset = 0, type = 'all' } = req.body;
        const result = await req.session.getChatsOverview(limit, offset, type);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get contacts list - semua kontak yang tersimpan
 * Body: { sessionId, limit?, offset?, search? }
 */
router.post('/contacts', checkSession, async (req, res) => {
    try {
        const { limit = 100, offset = 0, search = '' } = req.body;
        const result = await req.session.getContacts(limit, offset, search);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get messages from any chat (personal or group)
 * Body: { sessionId, chatId, limit?, cursor? }
 * chatId: phone number (628xxx) or group id (xxx@g.us)
 */
router.post('/chats/messages', checkSession, async (req, res) => {
    try {
        const { chatId, limit = 50, cursor = null } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.getChatMessages(chatId, limit, cursor);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get chat info/detail (personal or group)
 * Body: { sessionId, chatId }
 */
router.post('/chats/info', checkSession, async (req, res) => {
    try {
        const { chatId } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.getChatInfo(chatId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
