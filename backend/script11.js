// script.js - COMPLETELY FIXED VERSION
const API_URL = 'http://localhost:3000';
const token = localStorage.getItem('authToken');

// Redirect to login if no token
if (!token) {
    window.location.href = '/login.html';
}

let currentUser = null;

// ============== API HELPER (SINGLE DEFINITION) ==============
async function fetchAPI(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        console.log(`API Call: ${options.method || 'GET'} ${endpoint}`);
        
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        });

        console.log(`API Response: ${response.status} ${endpoint}`);

        if (response.status === 401) {
            console.error('Unauthorized - redirecting to login');
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
            return;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            throw new Error('Server returned non-JSON response');
        }

        const data = await response.json();
        
        if (!response.ok) {
            console.error('API Error:', data);
            throw new Error(data.message || `Request failed (${response.status})`);
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============== INITIALIZATION ==============
async function init() {
    try {
        await loadUserData();
        await loadFeed();
        await checkNotifications();
        
        // Poll for new notifications every 30 seconds
        setInterval(checkNotifications, 30000);
    } catch (error) {
        console.error('Init error:', error);
    }
}

// ============== USER DATA ==============
async function loadUserData() {
    try {
        const user = await fetchAPI('/api/users/me');
        currentUser = user;
        
        console.log('Current user loaded:', user);
        
        document.getElementById('account-name').textContent = user.displayName || user.username;
        document.getElementById('account-username').textContent = `@${user.username}`;
        
        const avatarEl = document.querySelector('.account-avatar');
        if (user.avatarUrl) {
            avatarEl.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}
// ADD THIS TO THE TOP OF YOUR script.js (after API_URL declaration)

// ============== SOCKET.IO CLIENT ==============
let socket = null;
let currentConversation = null;
let onlineUsers = new Set();

// Initialize Socket.IO connection
function initSocket() {
    // Ask user for permission to show desktop notifications
    try { requestNotificationPermission(); } catch(e) { console.warn('Notification permission helper missing'); }

    const token = localStorage.getItem('authToken');
    
    if (!token || socket) return;
    
    // Connect to Socket.IO server
    socket = io('http://localhost:3000', {
        auth: {
            token: token
        }
    });
    
    // Connection established
    socket.on('connect', () => {
        console.log('✅ Socket.IO connected');
    });
    
    // Connection error
    socket.on('connect_error', (error) => {
        console.error('❌ Socket.IO connection error:', error);
    });
    
    // User came online
    socket.on('user_online', (data) => {
        console.log('👤 User online:', data.username);
        onlineUsers.add(data.userId);
        updateOnlineStatus();
    });
    
    // User went offline
    socket.on('user_offline', (data) => {
        console.log('👤 User offline:', data.userId);
        onlineUsers.delete(data.userId);
        updateOnlineStatus();
    });
    
    // Online users list
    socket.on('online_users', (users) => {
        onlineUsers = new Set(users);
        updateOnlineStatus();
    });
    
    // New message received
    socket.on('new_message', (message) => {
        console.log('📩 New message received:', message);
        handleNewMessage(message);
        try { showDesktopNotification(message); } catch (e) { console.warn('Desktop notification failed', e); }
    });
    
    // Message was sent successfully
    socket.on('message_sent', (message) => {
        console.log('✅ Message sent:', message);
        appendMessageToChat(message);
    });
    
    // Message was delivered
    socket.on('message_delivered', (data) => {
        console.log('✅ Message delivered:', data.messageId);
        updateMessageStatus(data.messageId, 'delivered');
    });
    
    // Messages were read
    socket.on('messages_read', (data) => {
        console.log('✅ Messages read in conversation:', data.conversationId);
        if (currentConversation === data.conversationId) {
            markMessagesAsRead();
        }
    });
    
    // Someone is typing
    socket.on('user_typing', (data) => {
        showTypingIndicator(data);
    });
    
    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Socket.IO disconnected');
    });
}

// ============== MESSAGING FUNCTIONS ==============

// Load conversations list
async function loadConversations() {
    try {
        const conversations = await fetchAPI('/api/messages/conversations');
        
        const container = document.getElementById('conversationsList');
        
        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No conversations yet</div>';
            return;
        }
        
        container.innerHTML = conversations.map(conv => {
            const isOnline = onlineUsers.has(conv.otherUser.id);
            const lastMessagePreview = conv.lastMessage.text.length > 50 
                ? conv.lastMessage.text.substring(0, 50) + '...' 
                : conv.lastMessage.text;
            
            return `
                <div class="conversation-item" onclick="openConversation('${conv.otherUser.id}', '${conv.otherUser.username}', '${conv.otherUser.displayName}', '${conv.otherUser.avatarUrl || ''}', '${conv.conversationId}')" style="padding:15px;border-bottom:1px solid #2f3336;cursor:pointer;transition:0.2s;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="position:relative;">
                            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;">
                                ${conv.otherUser.avatarUrl ? `<img src="${conv.otherUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                            </div>
                            ${isOnline ? '<div style="position:absolute;bottom:0;right:0;width:14px;height:14px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>' : ''}
                        </div>
                        <div style="flex:1;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div style="font-weight:600;color:#e4e6eb;">${conv.otherUser.displayName}</div>
                                <div style="font-size:12px;color:#8b8d91;">${formatMessageTime(conv.lastMessage.createdAt)}</div>
                            </div>
                            <div style="font-size:14px;color:${conv.unreadCount > 0 ? '#e4e6eb' : '#8b8d91'};${conv.unreadCount > 0 ? 'font-weight:600;' : ''}">${lastMessagePreview}</div>
                        </div>
                        ${conv.unreadCount > 0 ? `<div style="background:#667eea;color:white;padding:4px 8px;border-radius:12px;font-size:12px;font-weight:600;">${conv.unreadCount}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// Search users to message
let messageSearchTimeout;
async function searchUsersToMessage() {
    const query = document.getElementById('messageSearchInput').value.trim();
    const resultsContainer = document.getElementById('messageSearchResults');
    
    clearTimeout(messageSearchTimeout);
    
    if (query.length < 2) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        document.getElementById('conversationsList').style.display = 'block';
        return;
    }
    
    messageSearchTimeout = setTimeout(async () => {
        try {
            resultsContainer.style.display = 'block';
            document.getElementById('conversationsList').style.display = 'none';
            resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">Searching...</div>';
            
            const users = await fetchAPI(`/api/users/search?q=${encodeURIComponent(query)}`);
            
            if (!users || users.length === 0) {
                resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No users found</div>';
                return;
            }
            
            resultsContainer.innerHTML = users.map(user => {
                const isOnline = onlineUsers.has(user.id);
                return `
                    <div onclick="startConversation('${user.id}', '${user.username}', '${user.displayName || user.username}', '${user.avatarUrl || ''}')" style="padding:15px;border-bottom:1px solid #2f3336;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:12px;">
                        <div style="position:relative;">
                            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;">
                                ${user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                            </div>
                            ${isOnline ? '<div style="position:absolute;bottom:0;right:0;width:14px;height:14px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>' : ''}
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:600;color:#e4e6eb;">${user.displayName || user.username}</div>
                            <div style="font-size:13px;color:#8b8d91;">@${user.username}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Message search error:', error);
            resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#ff7979;">Search failed</div>';
        }
    }, 300);
}

// Start a new conversation
function startConversation(userId, username, displayName, avatarUrl) {
    document.getElementById('messageSearchInput').value = '';
    document.getElementById('messageSearchResults').style.display = 'none';
    document.getElementById('messageSearchResults').innerHTML = '';
    document.getElementById('conversationsList').style.display = 'block';
    
    const conversationId = [currentUser.id, userId].sort().join('_');
    openConversation(userId, username, displayName, avatarUrl, conversationId);
}

// Open a conversation
async function openConversation(userId, username, displayName, avatarUrl, conversationId) {
    currentConversation = conversationId;
    
    // Hide conversations list, show chat window
    document.getElementById('conversationsList').style.display = 'none';
    document.getElementById('messageSearchResults').style.display = 'none';
    document.getElementById('chatWindow').style.display = 'flex';
    
    // Set chat header
    const isOnline = onlineUsers.has(userId);
    document.getElementById('chatUserName').textContent = displayName;
    document.getElementById('chatUsername').textContent = `@${username}`;
    
    const avatarEl = document.getElementById('chatUserAvatar');
    if (avatarUrl) {
        avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        avatarEl.innerHTML = '👤';
    }
    
    // Add online indicator
    if (isOnline) {
        avatarEl.style.position = 'relative';
        avatarEl.innerHTML += '<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>';
    }
    
    // Store recipient info
    window.currentRecipient = { id: userId, username, displayName };
    
    // Load messages
    await loadMessages(userId);
    
    // Mark messages as read
    if (socket) {
        socket.emit('mark_read', {
            conversationId: conversationId,
            senderId: userId
        });
    }
}

// Load messages for conversation
async function loadMessages(userId) {
    try {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';
        
        const messages = await fetchAPI(`/api/messages/conversation/${userId}`);
        
        if (!messages || messages.length === 0) {
            chatMessages.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No messages yet. Start the conversation!</div>';
            return;
        }
        
        chatMessages.innerHTML = messages.map(msg => createMessageHTML(msg)).join('');
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('chatMessages').innerHTML = '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load messages</div>';
    }
}

// Create message HTML
function createMessageHTML(message) {
    const isMine = message.isMine;
    const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
        <div class="message ${isMine ? 'mine' : 'theirs'}" data-message-id="${message.id}" style="display:flex;gap:10px;margin-bottom:12px;${isMine ? 'flex-direction:row-reverse;' : ''}">
            ${!isMine ? `
                <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;flex-shrink:0;">
                    ${message.sender.avatarUrl ? `<img src="${message.sender.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                </div>
            ` : ''}
            <div style="max-width:70%;">
                <div style="background:${isMine ? '#667eea' : '#3a3b3c'};color:#fff;padding:10px 14px;border-radius:${isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};word-wrap:break-word;">
                    ${message.text}
                </div>
                <div style="font-size:11px;color:#8b8d91;margin-top:4px;${isMine ? 'text-align:right;' : ''}">
                    ${time} ${isMine ? (message.read ? '✓✓' : message.delivered ? '✓' : '○') : ''}
                </div>
            </div>
        </div>
    `;
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !window.currentRecipient || !socket) return;

    // Emit message to server
    socket.emit('send_message', {
        recipientId: window.currentRecipient.id,
        text: text
    });

    // Clear input
    input.value = '';

    // Stop typing indicator
    socket.emit('typing', {
        recipientId: window.currentRecipient.id,
        isTyping: false
    });

        // Best-effort: create a server-side notification (if your API supports it)
    (async () => {
        try {
            const payload = {
                user: window.currentRecipient.id,                // recipient (matches Notification.schema 'user')
                actor: currentUser && currentUser.id ? currentUser.id : null, // sender (matches 'actor')
                verb: 'system', // using 'system' for message notifications (schema verbs: like,comment,follow,mention,reply,system)
                targetType: 'Conversation',
                targetId: currentConversation || null,
                read: false
            };
            await fetchAPI('/api/notifications', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (e) {
            // Non-fatal — server may create notifications itself via sockets
            console.warn('Could not create notification via API:', e);
        }
    })();
}
// Handle Enter key in message input
function handleMessageKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Append message to chat (when sent)
function appendMessageToChat(message) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Remove "no messages" text if exists
    if (chatMessages.textContent.includes('No messages yet')) {
        chatMessages.innerHTML = '';
    }
    
    const messageHTML = createMessageHTML({
        id: message.id,
        sender: message.sender,
        text: message.text,
        createdAt: message.createdAt,
        delivered: message.delivered,
        read: message.read,
        isMine: true
    });
    
    chatMessages.insertAdjacentHTML('beforeend', messageHTML);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle new message received
function handleNewMessage(message) {
    // Update conversations list
    loadConversations();
    
    // If currently in this conversation, append message
    if (currentConversation === message.conversationId) {
        const messageHTML = createMessageHTML({
            id: message.id,
            sender: message.sender,
            text: message.text,
            createdAt: message.createdAt,
            isMine: false
        });
        
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.insertAdjacentHTML('beforeend', messageHTML);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Mark as read
        if (socket) {
            socket.emit('mark_read', {
                conversationId: message.conversationId,
                senderId: message.sender.id
            });
        }
    } else {
        // Show notification (optional)
        console.log('New message from:', message.sender.displayName);
    }
}

// Back to conversations
function backToConversations() {
    document.getElementById('chatWindow').style.display = 'none';
    document.getElementById('conversationsList').style.display = 'block';
    document.getElementById('messageSearchInput').value = '';
    currentConversation = null;
    window.currentRecipient = null;
    loadConversations();
}

// Update online status indicators
function updateOnlineStatus() {
    // Update in conversations list and chat header
    if (window.currentRecipient && onlineUsers.has(window.currentRecipient.id)) {
        // Add online indicator to chat header
        const avatarEl = document.getElementById('chatUserAvatar');
        if (avatarEl && !avatarEl.querySelector('[style*="background:#00d084"]')) {
            avatarEl.style.position = 'relative';
            avatarEl.insertAdjacentHTML('beforeend', '<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>');
        }
    }
}

// Format message time
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Update message status
function updateMessageStatus(messageId, status) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
        const statusEl = messageEl.querySelector('[style*="font-size:11px"]');
        if (statusEl && status === 'delivered') {
            statusEl.innerHTML = statusEl.innerHTML.replace('○', '✓');
        }
    }
}

// Mark messages as read
function markMessagesAsRead() {
    const messages = document.querySelectorAll('.message.mine [style*="font-size:11px"]');
    messages.forEach(el => {
        el.innerHTML = el.innerHTML.replace('✓', '✓✓');
    });
}

// Show typing indicator
let typingTimeout;
function showTypingIndicator(data) {
    if (!currentConversation || !window.currentRecipient || window.currentRecipient.id !== data.userId) {
        return;
    }
    
    const chatMessages = document.getElementById('chatMessages');
    const existingIndicator = document.getElementById('typing-indicator');
    
    if (data.isTyping) {
        if (!existingIndicator) {
            chatMessages.insertAdjacentHTML('beforeend', `
                <div id="typing-indicator" style="padding:10px;color:#8b8d91;font-size:13px;font-style:italic;">
                    ${data.username} is typing...
                </div>
            `);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();
        }, 3000);
    } else {
        if (existingIndicator) existingIndicator.remove();
    }
}

// Handle typing in message input
let typingIndicatorSent = false;
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', () => {
            if (!socket || !window.currentRecipient) return;
            
            if (messageInput.value.trim() && !typingIndicatorSent) {
                socket.emit('typing', {
                    recipientId: window.currentRecipient.id,
                    isTyping: true
                });
                typingIndicatorSent = true;
            } else if (!messageInput.value.trim() && typingIndicatorSent) {
                socket.emit('typing', {
                    recipientId: window.currentRecipient.id,
                    isTyping: false
                });
                typingIndicatorSent = false;
            }
        });
    }
});

// ============== UPDATE INIT FUNCTION ==============
// Add this to your existing init() function:
async function init() {
    try {
        await loadUserData();
        await loadFeed();
        await checkNotifications();
        
        // Initialize Socket.IO
        initSocket();
        
        // Poll for new notifications every 30 seconds
        setInterval(checkNotifications, 30000);
    } catch (error) {
        console.error('Init error:', error);
    }
}

// ============== UPDATE showMessages FUNCTION ==============
function showMessages() {
    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById('messages-view').classList.add('active');
    
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    
    // Load conversations when messages view opens
    loadConversations();
}

// ============== FEED ==============
async function loadFeed() {
    try {
        const feedContainer = document.getElementById('feed-posts');
        feedContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';
        
        const posts = await fetchAPI('/api/posts/feed');
        
        if (!posts || posts.length === 0) {
            feedContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No posts yet. Be the first to post!</div>';
            return;
        }
        
        feedContainer.innerHTML = posts.map(post => createPostHTML(post)).join('');
    } catch (error) {
        console.error('Error loading feed:', error);
        document.getElementById('feed-posts').innerHTML = '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load feed</div>';
    }
}

function createPostHTML(post) {
    const avatar = post.avatar !== '👤' 
        ? `<img src="${post.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : '👤';
    
    return `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div>
                    <div class="post-name">${post.displayName || post.username}</div>
                    <div class="post-username">@${post.username} · ${post.timestamp}</div>
                </div>
            </div>
            <div class="post-content">${post.content}</div>
            ${post.mediaUrl ? `<img src="${post.mediaUrl}" class="post-media" alt="Post media">` : ''}
            <div class="post-actions">
                <button class="action-btn ${post.liked ? 'liked' : ''}" onclick="toggleLike('${post.id}')">
                    ${post.liked ? '❤️' : '🤍'} <span id="likes-${post.id}">${post.likes}</span>
                </button>
                <button class="action-btn">💬 ${post.comments}</button>
                <button class="action-btn">🔄</button>
                <button class="action-btn">📤</button>
            </div>
        </div>
    `;
}

async function toggleLike(postId) {
    try {
        const result = await fetchAPI(`/api/posts/${postId}/like`, {
            method: 'POST'
        });
        
        const likesElement = document.getElementById(`likes-${postId}`);
        if (likesElement) {
            likesElement.textContent = result.likes;
        }
        
        const btn = likesElement.closest('.action-btn');
        if (result.liked) {
            btn.classList.add('liked');
            btn.innerHTML = `❤️ <span id="likes-${postId}">${result.likes}</span>`;
        } else {
            btn.classList.remove('liked');
            btn.innerHTML = `🤍 <span id="likes-${postId}">${result.likes}</span>`;
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

// ============== NOTIFICATIONS ==============
async function checkNotifications() {
    try {
        const result = await fetchAPI('/api/notifications/unread/count');
        const badge = document.getElementById('notificationBadge');
        
        if (result.count > 0) {
            badge.textContent = result.count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

async function loadNotifications() {
    try {
        const container = document.getElementById('notifications-list');
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';
        
        const notifications = await fetchAPI('/api/notifications');
        
        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No notifications yet</div>';
            return;
        }
        
        container.innerHTML = notifications.map(n => {
            const actor = n.actor || {};
            const actorName = actor.displayName || actor.username || 'Someone';
            const avatar = actor.avatarUrl 
                ? `<img src="${actor.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` 
                : '👤';
            
            let verbText = '';
            switch (n.verb) {
                case 'follow': verbText = 'started following you'; break;
                case 'like': verbText = 'liked your post'; break;
                case 'comment': verbText = 'commented on your post'; break;
                default: verbText = n.verb;
            }
            
            const time = new Date(n.createdAt).toLocaleString();
            
            return `
                <div class="notification-item" style="padding:15px 20px;border-bottom:1px solid #2f3336;display:flex;gap:12px;align-items:center;${!n.read ? 'background:rgba(102,126,234,0.05);' : ''}">
                    <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;overflow:hidden;">
                        ${avatar}
                    </div>
                    <div style="flex:1;">
                        <div style="color:#e4e6eb;font-size:14px;margin-bottom:4px;">
                            <strong>${actorName}</strong> ${verbText}
                        </div>
                        <div style="color:#8b8d91;font-size:12px;">${time}</div>
                    </div>
                    ${!n.read ? `<button onclick="markNotificationRead('${n.id}')" style="padding:6px 12px;background:#667eea;border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;">Mark read</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading notifications:', error);
        document.getElementById('notifications-list').innerHTML = '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load notifications</div>';
    }
}

async function markNotificationRead(notificationId) {
    try {
        await fetchAPI(`/api/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
        await loadNotifications();
        await checkNotifications();
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

// ============== VIEW SWITCHING ==============
function switchToHome() {
    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById('feed-view').classList.add('active');
    
    document.querySelectorAll('.menu-link').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active'));
    document.querySelector('.toggle-btn:first-child').classList.add('active');
}

function switchToNotifications() {
    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById('notifications-view').classList.add('active');
    
    document.querySelectorAll('.menu-link').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    
    loadNotifications();
}

function showFeed() {
    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById('feed-view').classList.add('active');
    
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
}

function showMessages() {
    document.querySelectorAll('.content').forEach(el => el.classList.remove('active'));
    document.getElementById('messages-view').classList.add('active');
    
    document.querySelectorAll('.toggle-btn').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
}

// ============== SEARCH MODAL ==============
let searchTimeout;

function showSearchModal() {
    document.getElementById('searchModal').classList.add('active');
    document.getElementById('searchInput').focus();
}

function closeSearchModal() {
    document.getElementById('searchModal').classList.remove('active');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

async function searchUsers() {
    const query = document.getElementById('searchInput').value.trim();
    const resultsContainer = document.getElementById('searchResults');
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">Searching...</div>';
            
            const users = await fetchAPI(`/api/users/search?q=${encodeURIComponent(query)}`);
            
            if (!users || users.length === 0) {
                resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#8b8d91;">No users found</div>';
                return;
            }
            
            resultsContainer.innerHTML = users.map(user => `
                <div class="search-result-item" style="display:flex;align-items:center;gap:15px;padding:12px;border-radius:8px;background:#18191a;margin-bottom:10px;">
                    <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;overflow:hidden;">
                        ${user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;color:#e4e6eb;">${user.displayName || user.username}</div>
                        <div style="font-size:13px;color:#8b8d91;">@${user.username}</div>
                        <div style="font-size:12px;color:#666;">${user.followersCount || 0} followers</div>
                    </div>
                    <button class="follow-btn" id="follow-btn-${user.id}" onclick="toggleFollow('${user.id}')" style="padding:8px 20px;background:#667eea;color:white;border:none;border-radius:20px;font-weight:600;cursor:pointer;font-size:13px;">
                        Follow
                    </button>
                </div>
            `).join('');
            
            // Check follow status for each user
            users.forEach(user => checkFollowStatus(user.id));
            
        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#ff7979;">Search failed</div>';
        }
    }, 300);
}

async function checkFollowStatus(userId) {
    if (!userId || userId === 'undefined' || userId === 'null') {
        console.error('Invalid user ID for follow status check:', userId);
        return;
    }
    
    try {
        const result = await fetchAPI(`/api/users/${userId}/following`);
        const btn = document.getElementById(`follow-btn-${userId}`);
        
        if (btn) {
            if (result.following) {
                btn.textContent = 'Unfollow';
                btn.style.background = '#2f3336';
            } else {
                btn.textContent = 'Follow';
                btn.style.background = '#667eea';
            }
        }
    } catch (error) {
        console.error('Error checking follow status for user', userId, ':', error);
        // Don't show alert for status check failures
    }
}
async function toggleFollow(userId) {
    // Validate userId
    if (!userId || userId === 'undefined' || userId === 'null') {
        console.error('Invalid user ID:', userId);
        alert('Invalid user ID');
        return;
    }

    const btn = document.getElementById(`follow-btn-${userId}`);
    if (!btn) {
        console.error('Button not found for user:', userId);
        return;
    }
    
    const isFollowing = btn.textContent.trim() === 'Unfollow';
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    try {
        // Disable button and show loading
        btn.disabled = true;
        btn.textContent = '...';
        
        console.log(`${isFollowing ? 'Unfollowing' : 'Following'} user: ${userId}`);
        
        let result;
        
        if (isFollowing) {
            // Unfollow
            result = await fetchAPI(`/api/users/${userId}/follow`, { 
                method: 'DELETE'
            });
            
            console.log('Unfollow result:', result);
            
            btn.textContent = 'Follow';
            btn.style.background = '#667eea';
            
        } else {
            // Follow
            result = await fetchAPI(`/api/users/${userId}/follow`, { 
                method: 'POST'
            });
            
            console.log('Follow result:', result);
            
            btn.textContent = 'Unfollow';
            btn.style.background = '#2f3336';
        }
        
        console.log('✅ Toggle follow successful');
        
    } catch (error) {
        console.error('❌ Toggle follow error:', error);
        
        // Restore button state
        btn.textContent = originalText;
        btn.style.background = originalBg;
        
        // Show user-friendly error
        if (error.message) {
            alert(`Error: ${error.message}`);
        } else {
            alert('Failed to update follow status. Please try again.');
        }
        
    } finally {
        // Always re-enable button
        btn.disabled = false;
    }
}
// ============== FOLLOWERS/FOLLOWING DISPLAY ==============
async function showFollowersList(userId) {
    try {
        console.log('Loading followers for user:', userId);
        const followers = await fetchAPI(`/api/users/${userId}/followers`);
        displayUserListModal(followers, 'Followers');
    } catch (error) {
        console.error('Error loading followers:', error);
        alert('Failed to load followers');
    }
}

async function showFollowingList(userId) {
    try {
        console.log('Loading following for user:', userId);
        const following = await fetchAPI(`/api/users/${userId}/following-list`);
        displayUserListModal(following, 'Following');
    } catch (error) {
        console.error('Error loading following:', error);
        alert('Failed to load following');
    }
}

function displayUserListModal(users, title) {
    console.log(`Displaying ${title}:`, users);
    
    const modalHTML = `
        <div class="modal-overlay active" id="userListModal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:2000;display:flex;align-items:center;justify-content:center;">
            <div class="modal" style="background:#242526;border-radius:12px;width:90%;max-width:500px;max-height:80vh;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                <div class="modal-header" style="padding:20px;border-bottom:1px solid #3a3b3c;display:flex;justify-content:space-between;align-items:center;">
                    <div class="modal-title" style="font-size:18px;font-weight:600;color:#e4e6eb;">${title}</div>
                    <button class="modal-close" onclick="closeUserListModal()" style="background:none;border:none;font-size:24px;cursor:pointer;color:#8b8d91;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;">×</button>
                </div>
                <div class="modal-body" style="padding:20px;max-height:400px;overflow-y:auto;">
                    ${users.length === 0 ? `<div style="text-align:center;color:#8b8d91;padding:20px;">No ${title.toLowerCase()} yet</div>` : ''}
                    ${users.map(user => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;background:#18191a;margin-bottom:8px;">
                            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;flex-shrink:0;">
                                ${user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:600;font-size:14px;color:#e4e6eb;">${user.displayName || user.username}</div>
                                <div style="font-size:13px;color:#8b8d91;">@${user.username}</div>
                                <div style="font-size:12px;color:#666;">${user.followersCount || 0} followers</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existing = document.getElementById('userListModal');
    if (existing) existing.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeUserListModal() {
    const modal = document.getElementById('userListModal');
    if (modal) modal.remove();
}

// Make functions globally available
window.showFollowersList = showFollowersList;
window.showFollowingList = showFollowingList;
window.closeUserListModal = closeUserListModal;

// ============== POST MODAL ==============
let selectedPostType = 'text';

function showPostModal() {
    document.getElementById('postModal').classList.add('active');
    selectPostType('text');
}

function closePostModal() {
    document.getElementById('postModal').classList.remove('active');
    document.getElementById('textPostInput').value = '';
    document.getElementById('fileUploadInput').value = '';
    document.getElementById('fileCaptionInput').value = '';
}

function selectPostType(type) {
    selectedPostType = type;
    
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.post-form').forEach(form => form.classList.remove('active'));
    
    if (type === 'text') {
        document.getElementById('textForm').classList.add('active');
    } else {
        document.getElementById('fileForm').classList.add('active');
    }
}

async function submitPost() {
    try {
        let content, mediaUrl = null;
        
        if (selectedPostType === 'text') {
            content = document.getElementById('textPostInput').value.trim();
            if (!content) {
                alert('Please write something');
                return;
            }
        } else {
            const fileInput = document.getElementById('fileUploadInput');
            const caption = document.getElementById('fileCaptionInput').value.trim();
            
            if (!fileInput.files || !fileInput.files[0]) {
                alert('Please select a file');
                return;
            }
            
            // Convert file to base64
            const file = fileInput.files[0];
            mediaUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            
            content = caption || 'Posted a file';
        }
        
        const result = await fetchAPI('/api/posts', {
            method: 'POST',
            body: JSON.stringify({
                content,
                type: selectedPostType,
                mediaUrl
            })
        });
        
        closePostModal();
        await loadFeed();
        
    } catch (error) {
        console.error('Error creating post:', error);
        alert('Failed to create post');
    }
}

// ============== LOGOUT ==============


// ----------------- Desktop / In-page Notifications for messages -----------------
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('This browser does not support desktop notifications.');
        return;
    }
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
        }).catch(err => console.warn('Notification permission request failed:', err));
    }
}

function showDesktopNotification(message) {
    try {
        // only notify if the message is from someone else
        if (!message || !message.sender) return;
        if (window.currentRecipient && window.currentRecipient.id === message.sender.id) {
            // user currently viewing the conversation — no desktop notification needed
            return;
        }
        const title = message.sender.displayName || message.sender.username || 'New message';
        const body = message.text && message.text.length > 120 ? message.text.substring(0, 120) + '…' : (message.text || 'Sent you a message');
        const icon = (message.sender.avatarUrl) ? message.sender.avatarUrl : undefined;

        // In-app visual toast (simple)
        try {
            showInAppToast(title, body, icon, () => { const convId = message.conversationId || ([currentUser && currentUser.id, message.sender.id].filter(Boolean).sort().join('_')); openConversation(message.sender.id, message.sender.username, message.sender.displayName, message.sender.avatarUrl || '', convId); window.focus(); }, 'Reply');
        } catch (e) {
            // ignore if toast helper not present
        }

        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            const n = new Notification(title, { body, icon });
            n.onclick = () => {
                window.focus();
                // open conversation on click
                const convId = message.conversationId || [currentUser && currentUser.id, message.sender.id].sort().join('_');
                openConversation(message.sender.id, message.sender.username, message.sender.displayName, message.sender.avatarUrl || '', convId);
                n.close();
            };
        } else if (Notification.permission === 'default') {
            // prompt for permission
            requestNotificationPermission();
        }
    } catch (err) {
        console.warn('Failed to show desktop notification', err);
    }
}

// Simple in-app toast fallback (non-blocking)

// Simple in-app toast fallback (non-blocking) with an optional action button
function showInAppToast(title, body, icon, onClick, actionText = 'Reply') {
    try {
        const toast = document.createElement('div');
        toast.className = 'inapp-toast';
        toast.style = 'position:fixed;right:20px;bottom:20px;background:#1f1f1f;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.5);z-index:9999;max-width:360px;cursor:default;display:flex;gap:12px;align-items:flex-start;';
        toast.innerHTML = `
            <div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#2b2b2b;">
                ${icon ? `<img src="${icon}" style="width:100%;height:100%;object-fit:cover;">` : '💬'}
            </div>
            <div style="flex:1;">
                <div style="font-weight:700;margin-bottom:6px;font-size:14px;">${title}</div>
                <div style="font-size:13px;color:#bdbdbd;margin-bottom:8px;white-space:normal;">${body}</div>
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button class="inapp-toast-reply" style="padding:8px 12px;border-radius:8px;border:none;background:#667eea;color:white;font-weight:600;cursor:pointer;font-size:13px;">${actionText}</button>
                    <button class="inapp-toast-dismiss" style="padding:8px 12px;border-radius:8px;border:1px solid #3a3b3c;background:transparent;color:#bdbdbd;cursor:pointer;font-size:13px;">Dismiss</button>
                </div>
            </div>
        `;
        // Reply button click
        toast.querySelector('.inapp-toast-reply').addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (typeof onClick === 'function') onClick();
            toast.remove();
        });
        // Dismiss button click
        toast.querySelector('.inapp-toast-dismiss').addEventListener('click', (ev) => {
            ev.stopPropagation();
            toast.remove();
        });
        // Clicking anywhere on the toast also triggers onClick for convenience
        toast.addEventListener('click', () => {
            if (typeof onClick === 'function') onClick();
            toast.remove();
        });
        document.body.appendChild(toast);
        // Auto-remove after 10s
        setTimeout(() => {
            if (toast && toast.parentNode) toast.remove();
        }, 10000);
    } catch (e) {
        console.warn('Could not show in-app toast', e);
    }
}


function logout() {
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
}

// ============== CLOSE MODALS ON OUTSIDE CLICK ==============
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// ============== INITIALIZE ON LOAD ==============
document.addEventListener('DOMContentLoaded', init);

console.log('✅ Script loaded successfully');
async function showMyFollowers() {
    if (!currentUser || !currentUser.id) {
        console.error('Current user not loaded');
        return;
    }
    await showFollowersList(currentUser.id);
}

async function showMyFollowing() {
    if (!currentUser || !currentUser.id) {
        console.error('Current user not loaded');
        return;
    }
    await showFollowingList(currentUser.id);
}

// Update the loadUserData function to also update these counts
async function loadUserData() {
    try {
        const user = await fetchAPI('/api/users/me');
        currentUser = user;
        
        console.log('Current user loaded:', user);
        
        document.getElementById('account-name').textContent = user.displayName || user.username;
        document.getElementById('account-username').textContent = `@${user.username}`;
        
        // UPDATE FOLLOWER COUNTS IF ELEMENTS EXIST
        const followersEl = document.getElementById('my-followers-count');
        const followingEl = document.getElementById('my-following-count');
        
        if (followersEl) followersEl.textContent = user.followersCount || 0;
        if (followingEl) followingEl.textContent = user.followingCount || 0;
        
        const avatarEl = document.querySelector('.account-avatar');
        if (user.avatarUrl) {
            avatarEl.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}