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
        const { metadata, webhooks } = req.body;
        
        const options = {};
        if (metadata) options.metadata = metadata;
        if (webhooks) options.webhooks = webhooks;
        
        const result = await whatsappManager.createSession(sessionId, options);
        
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
                name: info.name,
                metadata: info.metadata,
                webhooks: info.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update session config (metadata, webhooks)
router.patch('/sessions/:sessionId/config', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { metadata, webhooks } = req.body;
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const options = {};
        if (metadata !== undefined) options.metadata = metadata;
        if (webhooks !== undefined) options.webhooks = webhooks;
        
        const updatedInfo = session.updateConfig(options);
        
        res.json({
            success: true,
            message: 'Session config updated',
            data: {
                sessionId: updatedInfo.sessionId,
                metadata: updatedInfo.metadata,
                webhooks: updatedInfo.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add a webhook to session
router.post('/sessions/:sessionId/webhooks', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { url, events } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: url'
            });
        }
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const updatedInfo = session.addWebhook(url, events || ['all']);
        
        res.json({
            success: true,
            message: 'Webhook added',
            data: {
                sessionId: updatedInfo.sessionId,
                webhooks: updatedInfo.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove a webhook from session
router.delete('/sessions/:sessionId/webhooks', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: url'
            });
        }
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const updatedInfo = session.removeWebhook(url);
        
        res.json({
            success: true,
            message: 'Webhook removed',
            data: {
                sessionId: updatedInfo.sessionId,
                webhooks: updatedInfo.webhooks
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
    if (!req.body) {
        return res.status(400).json({
            success: false,
            message: 'Request body is required'
        });
    }
    
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
        const { chatId, message, typingTime = 0 } = req.body;
        
        if (!chatId || !message) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, message'
            });
        }

        const result = await req.session.sendTextMessage(chatId, message, typingTime);
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
        const { chatId, imageUrl, caption, typingTime = 0 } = req.body;
        
        if (!chatId || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, imageUrl'
            });
        }

        const result = await req.session.sendImage(chatId, imageUrl, caption || '', typingTime);
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
        const { chatId, documentUrl, filename, mimetype, typingTime = 0 } = req.body;
        
        if (!chatId || !documentUrl || !filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, documentUrl, filename'
            });
        }

        const result = await req.session.sendDocument(chatId, documentUrl, filename, mimetype, typingTime);
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
        const { chatId, latitude, longitude, name, typingTime = 0 } = req.body;
        
        if (!chatId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, latitude, longitude'
            });
        }

        const result = await req.session.sendLocation(chatId, latitude, longitude, name || '', typingTime);
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
        const { chatId, contactName, contactPhone, typingTime = 0 } = req.body;
        
        if (!chatId || !contactName || !contactPhone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, contactName, contactPhone'
            });
        }

        const result = await req.session.sendContact(chatId, contactName, contactPhone, typingTime);
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
        const { chatId, text, footer, buttons, typingTime = 0 } = req.body;
        
        if (!chatId || !text || !buttons || !Array.isArray(buttons)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, text, buttons (array)'
            });
        }

        const result = await req.session.sendButton(chatId, text, footer || '', buttons, typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send presence update (typing indicator)
router.post('/chats/presence', checkSession, async (req, res) => {
    try {
        const { chatId, presence = 'composing' } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const validPresences = ['composing', 'recording', 'paused', 'available', 'unavailable'];
        if (!validPresences.includes(presence)) {
            return res.status(400).json({
                success: false,
                message: `Invalid presence. Must be one of: ${validPresences.join(', ')}`
            });
        }
        
        const result = await req.session.sendPresenceUpdate(chatId, presence);
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

/**
 * Mark a chat as read
 * Body: { sessionId, chatId, messageId? }
 */
router.post('/chats/mark-read', checkSession, async (req, res) => {
    try {
        const { chatId, messageId } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.markChatRead(chatId, messageId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== GROUP MANAGEMENT ====================

/**
 * Create a new group
 * Body: { sessionId, name, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/create', checkSession, async (req, res) => {
    try {
        const { name, participants } = req.body;
        
        if (!name || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, participants'
            });
        }
        
        const result = await req.session.createGroup(name, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get all participating groups
 * Body: { sessionId }
 */
router.post('/groups', checkSession, async (req, res) => {
    try {
        const result = await req.session.getAllGroups();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get group metadata
 * Body: { sessionId, groupId }
 */
router.post('/groups/metadata', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupGetMetadata(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Add participants to a group
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/add', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupAddParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Remove participants from a group
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/remove', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupRemoveParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Promote participants to admin
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/promote', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupPromoteParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Demote participants from admin
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/demote', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupDemoteParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group subject (name)
 * Body: { sessionId, groupId, subject }
 */
router.post('/groups/subject', checkSession, async (req, res) => {
    try {
        const { groupId, subject } = req.body;
        
        if (!groupId || !subject) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, subject'
            });
        }
        
        const result = await req.session.groupUpdateSubject(groupId, subject);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group description
 * Body: { sessionId, groupId, description }
 */
router.post('/groups/description', checkSession, async (req, res) => {
    try {
        const { groupId, description } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupUpdateDescription(groupId, description);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group settings
 * Body: { sessionId, groupId, setting: 'announcement'|'not_announcement'|'locked'|'unlocked' }
 */
router.post('/groups/settings', checkSession, async (req, res) => {
    try {
        const { groupId, setting } = req.body;
        
        if (!groupId || !setting) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, setting'
            });
        }
        
        const result = await req.session.groupUpdateSettings(groupId, setting);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group profile picture
 * Body: { sessionId, groupId, imageUrl }
 */
router.post('/groups/picture', checkSession, async (req, res) => {
    try {
        const { groupId, imageUrl } = req.body;
        
        if (!groupId || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, imageUrl'
            });
        }
        
        const result = await req.session.groupUpdateProfilePicture(groupId, imageUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Leave a group
 * Body: { sessionId, groupId }
 */
router.post('/groups/leave', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupLeave(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Join a group using invitation code/link
 * Body: { sessionId, inviteCode } - Can be full URL or just the code
 */
router.post('/groups/join', checkSession, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        
        if (!inviteCode) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: inviteCode'
            });
        }
        
        const result = await req.session.groupJoinByInvite(inviteCode);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get group invitation code/link
 * Body: { sessionId, groupId }
 */
router.post('/groups/invite-code', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupGetInviteCode(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Revoke group invitation code
 * Body: { sessionId, groupId }
 */
router.post('/groups/revoke-invite', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupRevokeInvite(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;