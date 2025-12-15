const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

const BaileysStore = require('./BaileysStore');
const MessageFormatter = require('./MessageFormatter');

/**
 * WhatsApp Session Class
 * Mengelola satu sesi WhatsApp
 */
class WhatsAppSession {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.socket = null;
        this.qrCode = null;
        this.connectionStatus = 'disconnected';
        this.authFolder = path.join(process.cwd(), 'sessions', sessionId);
        this.storeFile = path.join(this.authFolder, 'store.json');
        this.phoneNumber = null;
        this.name = null;
        this.store = null;
        this.storeInterval = null;
    }

    // ==================== CONNECTION ====================

    async connect() {
        try {
            // Pastikan folder auth ada
            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            // Initialize custom in-memory store
            this.store = new BaileysStore();

            // Load existing store data if available
            if (fs.existsSync(this.storeFile)) {
                try {
                    this.store.readFromFile(this.storeFile);
                    console.log(`📂 [${this.sessionId}] Store data loaded from file`);
                } catch (e) {
                    console.log(`⚠️ [${this.sessionId}] Could not load store file:`, e.message);
                }
            }

            // Save store periodically (every 30 seconds)
            this.storeInterval = setInterval(() => {
                try {
                    this.store.writeToFile(this.storeFile);
                } catch (e) {
                    // Silent fail
                }
            }, 30_000);

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
            const { version } = await fetchLatestBaileysVersion();

            this.socket = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                browser: ['Chatery API', 'Chrome', '1.0.0'],
                syncFullHistory: true
            });

            // Bind store to socket events
            this.store.bind(this.socket.ev);

            // Setup event listeners
            this._setupEventListeners(saveCreds);

            return { success: true, message: 'Initializing connection...' };
        } catch (error) {
            console.error(`[${this.sessionId}] Error connecting:`, error);
            this.connectionStatus = 'error';
            return { success: false, message: error.message };
        }
    }

    _setupEventListeners(saveCreds) {
        // Connection update
        this.socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.qrCode = await qrcode.toDataURL(qr);
                this.connectionStatus = 'qr_ready';
                console.log(`📱 [${this.sessionId}] QR Code generated! Scan dengan WhatsApp Anda.`);
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                console.log(`❌ [${this.sessionId}] Connection closed:`, lastDisconnect?.error?.message);
                this.connectionStatus = 'disconnected';
                this.qrCode = null;
                
                if (shouldReconnect) {
                    console.log(`🔄 [${this.sessionId}] Reconnecting...`);
                    setTimeout(() => this.connect(), 5000);
                } else {
                    console.log(`🚪 [${this.sessionId}] Logged out.`);
                    this.deleteAuthFolder();
                }
            } else if (connection === 'open') {
                console.log(`✅ [${this.sessionId}] WhatsApp Connected Successfully!`);
                this.connectionStatus = 'connected';
                this.qrCode = null;
                
                if (this.socket.user) {
                    this.phoneNumber = this.socket.user.id.split(':')[0];
                    this.name = this.socket.user.name || 'Unknown';
                    console.log(`👤 [${this.sessionId}] Connected as: ${this.name} (${this.phoneNumber})`);
                }
            } else if (connection === 'connecting') {
                console.log(`🔄 [${this.sessionId}] Connecting to WhatsApp...`);
                this.connectionStatus = 'connecting';
            }
        });

        // Save credentials
        this.socket.ev.on('creds.update', saveCreds);

        // Log events
        this.socket.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message.key.fromMe && m.type === 'notify') {
                console.log(`📩 [${this.sessionId}] New message from:`, message.key.remoteJid);
            }
        });

        this.socket.ev.on('chats.upsert', (chats) => {
            console.log(`💬 [${this.sessionId}] Chats updated: ${chats.length} chats`);
        });

        this.socket.ev.on('contacts.upsert', (contacts) => {
            console.log(`👥 [${this.sessionId}] Contacts updated: ${contacts.length} contacts`);
        });
    }

    getInfo() {
        return {
            sessionId: this.sessionId,
            status: this.connectionStatus,
            isConnected: this.connectionStatus === 'connected',
            phoneNumber: this.phoneNumber,
            name: this.name,
            qrCode: this.qrCode,
            storeStats: this.store ? this.store.getStats() : null
        };
    }

    async logout() {
        try {
            if (this.storeInterval) {
                clearInterval(this.storeInterval);
            }
            if (this.socket) {
                await this.socket.logout();
                this.socket = null;
            }
            this.deleteAuthFolder();
            this.connectionStatus = 'disconnected';
            this.qrCode = null;
            this.phoneNumber = null;
            this.name = null;
            return { success: true, message: 'Logged out successfully' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    deleteAuthFolder() {
        try {
            if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
                console.log(`🗑️ [${this.sessionId}] Auth folder deleted`);
            }
        } catch (error) {
            console.error(`[${this.sessionId}] Error deleting auth folder:`, error);
        }
    }

    getSocket() {
        return this.socket;
    }

    // ==================== HELPERS ====================

    formatPhoneNumber(phone) {
        let formatted = phone.replace(/\D/g, '');
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        }
        if (!formatted.includes('@')) {
            formatted = formatted + '@s.whatsapp.net';
        }
        return formatted;
    }

    formatJid(id, isGroup = false) {
        if (id.includes('@')) return id;
        
        let formatted = id.replace(/\D/g, '');
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        }
        
        return isGroup ? `${formatted}@g.us` : `${formatted}@s.whatsapp.net`;
    }

    formatChatId(chatId) {
        if (chatId.includes('@')) return chatId;
        
        let formatted = chatId.replace(/\D/g, '');
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        }
        return `${formatted}@s.whatsapp.net`;
    }

    isGroupId(chatId) {
        return chatId.includes('@g.us');
    }

    // ==================== SEND MESSAGES ====================

    async sendTextMessage(to, message) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, { text: message });
            
            return { 
                success: true, 
                message: 'Message sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async sendImage(to, imageUrl, caption = '') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                image: { url: imageUrl },
                caption: caption
            });

            return {
                success: true,
                message: 'Image sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async sendDocument(to, documentUrl, filename, mimetype = 'application/pdf') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                document: { url: documentUrl },
                fileName: filename,
                mimetype: mimetype
            });

            return {
                success: true,
                message: 'Document sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async sendLocation(to, latitude, longitude, name = '') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                location: {
                    degreesLatitude: latitude,
                    degreesLongitude: longitude,
                    name: name
                }
            });

            return {
                success: true,
                message: 'Location sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async sendContact(to, contactName, contactPhone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${contactPhone}:+${contactPhone}\nEND:VCARD`;
            
            const result = await this.socket.sendMessage(jid, {
                contacts: {
                    displayName: contactName,
                    contacts: [{ vcard }]
                }
            });

            return {
                success: true,
                message: 'Contact sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async sendButton(to, text, footer, buttons) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(to);
            const result = await this.socket.sendMessage(jid, {
                text: text,
                footer: footer,
                buttons: buttons.map((btn, idx) => ({
                    buttonId: `btn_${idx}`,
                    buttonText: { displayText: btn },
                    type: 1
                })),
                headerType: 1
            });

            return {
                success: true,
                message: 'Button message sent successfully',
                data: {
                    messageId: result.key.id,
                    to: jid,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // ==================== CONTACT & PROFILE ====================

    async isRegistered(phone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(phone);
            const [result] = await this.socket.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
            
            return {
                success: true,
                data: {
                    phone: phone,
                    isRegistered: !!result?.exists,
                    jid: result?.jid || null
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getProfilePicture(phone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(phone);
            const ppUrl = await this.socket.profilePictureUrl(jid, 'image');
            
            return {
                success: true,
                data: {
                    phone: phone,
                    profilePicture: ppUrl
                }
            };
        } catch (error) {
            return { 
                success: true, 
                data: { 
                    phone: phone, 
                    profilePicture: null 
                } 
            };
        }
    }

    async getContactInfo(phone) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatPhoneNumber(phone);
            
            let profilePicture = null;
            try {
                profilePicture = await this.socket.profilePictureUrl(jid, 'image');
            } catch (e) {}

            let status = null;
            try {
                const statusResult = await this.socket.fetchStatus(jid);
                status = statusResult?.status || null;
            } catch (e) {}

            let isRegistered = false;
            try {
                const [result] = await this.socket.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
                isRegistered = !!result?.exists;
            } catch (e) {}

            return {
                success: true,
                data: {
                    phone: phone,
                    jid: jid,
                    isRegistered: isRegistered,
                    profilePicture: profilePicture,
                    status: status
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // ==================== GROUPS ====================

    async getChats() {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const chats = await this.socket.groupFetchAllParticipating();
            const groups = Object.values(chats).map(group => ({
                id: group.id,
                name: group.subject,
                isGroup: true,
                owner: group.owner,
                creation: group.creation,
                participantsCount: group.participants?.length || 0,
                desc: group.desc || null
            }));

            return {
                success: true,
                data: {
                    groups: groups,
                    totalGroups: groups.length
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getGroupMetadata(groupId) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatJid(groupId, true);
            const metadata = await this.socket.groupMetadata(jid);

            return {
                success: true,
                data: {
                    id: metadata.id,
                    name: metadata.subject,
                    owner: metadata.owner,
                    creation: metadata.creation,
                    desc: metadata.desc || null,
                    descId: metadata.descId || null,
                    participants: metadata.participants.map(p => ({
                        id: p.id,
                        admin: p.admin || null,
                        phone: p.id.split('@')[0]
                    })),
                    participantsCount: metadata.participants.length
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // ==================== CHAT HISTORY ====================

    /**
     * Get chats overview - OPTIMIZED VERSION using pre-computed cache
     */
    async getChatsOverview(limit = 50, offset = 0, type = 'all') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            if (!this.store) {
                return { success: false, message: 'Store not initialized' };
            }

            // Use fast method from BaileysStore
            const result = this.store.getChatsOverviewFast({ limit: 1000, offset: 0 });
            let chats = result.data;

            // Filter by type if needed
            if (type === 'group') {
                chats = chats.filter(c => c.isGroup);
            } else if (type === 'personal') {
                chats = chats.filter(c => !c.isGroup);
            }

            // Fetch missing profile pictures in parallel (batch)
            const chatsNeedingPics = chats.filter(c => !c.profilePicture).slice(0, 20);
            if (chatsNeedingPics.length > 0) {
                const picPromises = chatsNeedingPics.map(async (chat) => {
                    try {
                        const url = await this.socket.profilePictureUrl(chat.id, 'image');
                        this.store.setProfilePicture(chat.id, url);
                        chat.profilePicture = url;
                    } catch (e) {
                        // No profile picture available
                    }
                });
                await Promise.all(picPromises);
            }

            // Apply pagination
            const total = chats.length;
            const paginatedChats = chats.slice(offset, offset + limit);

            // Transform to expected format
            const formattedChats = paginatedChats.map(chat => ({
                id: chat.id,
                name: chat.name,
                phone: chat.isGroup ? null : chat.id.split('@')[0],
                isGroup: chat.isGroup,
                profilePicture: chat.profilePicture,
                participantsCount: null,
                lastMessage: chat.lastMessage?.preview || null,
                lastMessageTimestamp: chat.lastMessage?.timestamp || chat.conversationTimestamp || 0,
                unreadCount: chat.unreadCount || 0
            }));

            return {
                success: true,
                data: {
                    total: total,
                    limit: limit,
                    offset: offset,
                    hasMore: offset + limit < total,
                    chats: formattedChats
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Get contacts list - OPTIMIZED VERSION using cache
     */
    async getContacts(limit = 100, offset = 0, search = '') {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            if (!this.store) {
                return { success: false, message: 'Store not initialized' };
            }

            // Use fast method from BaileysStore
            const result = this.store.getContactsFast({ limit: 1000, offset: 0, search });
            let contacts = result.data;

            // Apply pagination
            const total = contacts.length;
            const paginatedContacts = contacts.slice(offset, offset + limit);

            // Fetch missing profile pictures in parallel (batch of 20 max)
            const contactsNeedingPics = paginatedContacts.filter(c => !c.profilePicture).slice(0, 20);
            if (contactsNeedingPics.length > 0) {
                const picPromises = contactsNeedingPics.map(async (contact) => {
                    try {
                        const url = await this.socket.profilePictureUrl(contact.id, 'image');
                        this.store.setProfilePicture(contact.id, url);
                        contact.profilePicture = url;
                    } catch (e) {
                        // No profile picture available
                    }
                });
                await Promise.all(picPromises);
            }

            // Transform to expected format
            const formattedContacts = paginatedContacts.map(c => ({
                id: c.id,
                phone: c.id.split('@')[0],
                name: c.name,
                shortName: c.notify || null,
                pushName: c.notify || null,
                profilePicture: c.profilePicture
            }));

            return {
                success: true,
                data: {
                    total: total,
                    limit: limit,
                    offset: offset,
                    hasMore: offset + limit < total,
                    contacts: formattedContacts
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getChatMessages(chatId, limit = 50, cursor = null) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatChatId(chatId);
            const isGroup = this.isGroupId(jid);
            
            let messages = [];
            
            // Try to fetch from server first
            try {
                const cursorMsg = cursor ? { 
                    before: { 
                        id: cursor, 
                        fromMe: false,
                        remoteJid: jid 
                    } 
                } : undefined;

                messages = await this.socket.fetchMessageHistory(limit, cursorMsg, jid);
            } catch (fetchError) {
                console.log(`[${this.sessionId}] fetchMessageHistory error:`, fetchError.message);
            }

            // Fallback: Try to get messages from store
            if (messages.length === 0 && this.store) {
                try {
                    const storeMessages = this.store.getMessages(jid);
                    if (storeMessages.length > 0) {
                        let startIndex = 0;
                        if (cursor) {
                            const cursorIndex = storeMessages.findIndex(m => m.key?.id === cursor);
                            if (cursorIndex !== -1) {
                                startIndex = cursorIndex + 1;
                            }
                        }
                        
                        messages = storeMessages.slice(startIndex, startIndex + limit);
                        console.log(`[${this.sessionId}] Loaded ${messages.length} messages from store for ${jid}`);
                    }
                } catch (storeError) {
                    console.log(`[${this.sessionId}] Store messages error:`, storeError.message);
                }
            }

            const formattedMessages = messages
                .map(msg => MessageFormatter.formatMessage(msg))
                .filter(msg => msg !== null);

            return {
                success: true,
                data: {
                    chatId: jid,
                    isGroup: isGroup,
                    total: formattedMessages.length,
                    limit: limit,
                    cursor: formattedMessages.length > 0 
                        ? formattedMessages[formattedMessages.length - 1].id 
                        : null,
                    hasMore: formattedMessages.length === limit,
                    messages: formattedMessages
                }
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    async getChatInfo(chatId) {
        try {
            if (!this.socket || this.connectionStatus !== 'connected') {
                return { success: false, message: 'Session not connected' };
            }

            const jid = this.formatChatId(chatId);
            const isGroup = this.isGroupId(jid);
            
            let profilePicture = null;
            try {
                profilePicture = await this.socket.profilePictureUrl(jid, 'image');
            } catch (e) {}

            if (isGroup) {
                try {
                    const metadata = await this.socket.groupMetadata(jid);
                    return {
                        success: true,
                        data: {
                            id: jid,
                            name: metadata.subject,
                            isGroup: true,
                            profilePicture: profilePicture,
                            owner: metadata.owner,
                            ownerPhone: metadata.owner?.split('@')[0],
                            creation: metadata.creation,
                            description: metadata.desc || null,
                            participants: metadata.participants.map(p => ({
                                id: p.id,
                                phone: p.id.split('@')[0],
                                isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
                                isSuperAdmin: p.admin === 'superadmin'
                            })),
                            participantsCount: metadata.participants.length
                        }
                    };
                } catch (e) {
                    return { success: false, message: 'Failed to get group info' };
                }
            } else {
                const phone = jid.split('@')[0];
                
                let status = null;
                try {
                    const statusResult = await this.socket.fetchStatus(jid);
                    status = statusResult?.status || null;
                } catch (e) {}

                let isRegistered = false;
                try {
                    const [result] = await this.socket.onWhatsApp(phone);
                    isRegistered = !!result?.exists;
                } catch (e) {}

                return {
                    success: true,
                    data: {
                        id: jid,
                        phone: phone,
                        isGroup: false,
                        profilePicture: profilePicture,
                        status: status,
                        isRegistered: isRegistered
                    }
                };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // Legacy methods for backward compatibility
    async getMessages(chatId, isGroup = false, limit = 50) {
        return this.getChatMessages(chatId, limit, null);
    }

    async fetchMessages(chatId, isGroup = false, limit = 50, cursor = null) {
        return this.getChatMessages(chatId, limit, cursor);
    }
}

module.exports = WhatsAppSession;
