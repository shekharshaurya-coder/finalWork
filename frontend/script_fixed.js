// script.js - COMPLETELY FIXED VERSION
const API_URL = `http://${window.location.hostname}:3000`;
const token = sessionStorage.getItem("token");

// Redirect to login if no token
if (!token) {
  window.location.href = "/login.html";
}

let currentUser = null;
// AUTH CHECK HELPER - Add this at the TOP of your script_fixed.js

// ===== AUTHENTICATION CHECK =====
(function checkAuth() {
  // Skip auth check if we're on login or signup page
  const currentPage = window.location.pathname;
  if (
    currentPage.includes("login.html") ||
    currentPage.includes("signup.html")
  ) {
    console.log("🟡 On login/signup page - skipping auth check");
    return;
  }

  console.log("🔐 Checking authentication...");

  // Get token from sessionStorage
  let token = sessionStorage.getItem("token");

  if (!token) {
    console.error("❌ No token found - redirecting to login");
    window.location.href = "/login.html";
    return;
  }

  // Clean token (remove any wrapping quotes)
  token = token.replace(/^"(.*)"$/, "$1").trim();

  console.log("✅ Token found (length):", token.length);
  console.log("✅ Token preview:", token.substring(0, 30) + "...");

  // Validate token format (JWT should have 3 parts)
  const parts = token.split(".");
  if (parts.length !== 3) {
    console.error("❌ Invalid token format - redirecting to login");
    sessionStorage.removeItem("token");
    window.location.href = "/login.html";
    return;
  }

  console.log("✅ Token format valid (3 parts)");

  // Try to decode payload to check expiry
  try {
    const payload = JSON.parse(atob(parts[1]));
    console.log("✅ Token payload:", payload);

    if (payload.exp) {
      const expiry = new Date(payload.exp * 1000);
      const now = new Date();

      if (now >= expiry) {
        console.error("❌ Token expired at:", expiry);
        sessionStorage.removeItem("token");
        window.location.href = "/login.html";
        return;
      }

      console.log("✅ Token valid until:", expiry);
    }
  } catch (e) {
    console.warn("⚠️ Could not decode token payload:", e);
    // Continue anyway - let the server validate
  }

  console.log("✅ Auth check passed - continuing to load page");
})();

// ===== EXAMPLE: How your existing code should check auth =====
// If you have code that redirects to login, make sure it's NOT running immediately
// Bad example:
// if (!localStorage.getItem('token')) window.location.href = '/login.html';

// Good example:
// document.addEventListener('DOMContentLoaded', () => {
//   // Auth check already happened above, so just verify token exists
//   if (!localStorage.getItem('token')) {
//     // This should rarely happen since the check above redirects first
//     return;
//   }
//   // ... rest of your code
// });

// ============== API HELPER (SINGLE DEFINITION) ==============
async function fetchAPI(endpoint, options = {}) {
  const token = options.token || sessionStorage.getItem("token") || "";

  const defaultOptions = {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...(options.headers || {}) },
  });

  if (response.status === 401) {
    console.error("Unauthorized - redirecting to login");
    sessionStorage.removeItem("token");
    window.location.href = "/login.html";
    return;
  }

  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await response.text();
    throw new Error("Server returned non-JSON: " + text);
  }

  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

let nextCursor = null;
let isLoading = false;

async function loadFeed(isInitial = false) {
  if (isLoading) return;
  isLoading = true;

  try {
    const feedContainer = document.getElementById("feed-posts");

    if (isInitial) {
      feedContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';
      nextCursor = null;
    }

    const endpoint = nextCursor
      ? `/api/posts/feed?cursor=${nextCursor}`
      : "/api/posts/feed";

    console.log("🔍 Fetching feed from:", endpoint);
    const response = await fetchAPI(endpoint);
    console.log("📡 API Response:", response);

    // Handle both array (old) and object (new) response formats
    const posts = Array.isArray(response)
      ? response
      : (response && response.posts) || [];
    const newNextCursor = Array.isArray(response)
      ? null
      : (response && response.nextCursor) || null;

    console.log("📦 Posts count:", posts.length, "NextCursor:", newNextCursor);

    if (!posts || posts.length === 0) {
      if (isInitial) {
        feedContainer.innerHTML =
          '<div style="padding:20px;text-align:center;color:#8b8d91;">No posts yet. Be the first to post!</div>';
      } else {
        feedContainer.insertAdjacentHTML(
          "beforeend",
          '<div style="padding:20px;text-align:center;color:#8b8d91;">No more posts</div>'
        );
      }
      nextCursor = null;
      isLoading = false;
      return;
    }

    const postsHTML = posts
      .map((post) => {
        try {
          return createPostHTML(post);
        } catch (e) {
          console.error("Error creating HTML for post:", post, e);
          return "";
        }
      })
      .join("");

    console.log("✅ Generated HTML length:", postsHTML.length);

    if (isInitial) {
      feedContainer.innerHTML = postsHTML;
      console.log("📝 Set initial feed HTML");
    } else {
      feedContainer.insertAdjacentHTML("beforeend", postsHTML);
      console.log("📝 Appended more posts");
    }

    nextCursor = newNextCursor;
  } catch (error) {
    console.error("Error loading feed:", error);
    if (isInitial) {
      document.getElementById("feed-posts").innerHTML =
        '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load feed</div>';
    }
  } finally {
    isLoading = false;
  }
}
// ============== INITIALIZATION ==============
async function init() {
  console.log("✅ init() called!");
  try {
    await loadUserData();
    await loadFeed(true);
    await checkNotifications();

    // Initialize Socket.IO
    initSocket();

    // Poll for new notifications every 30 seconds
    setInterval(checkNotifications, 30000);
    //////////////////

    document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Page loaded - updating badges...');
  updateSidebarMessagesBadge();
  
  // Update every 30 seconds
  setInterval(updateSidebarMessagesBadge, 30000);
});

// Also call after sending/reading messages:
// After sending a message:
socket.on("message_sent", (message) => {
  console.log("✅ Message sent:", message);
  appendMessageToChat(message);
  updateSidebarMessagesBadge(); // 🔥 ADD THIS
});

// After receiving a message:
socket.on("new_message", (message) => {
  console.log("📩 New message received:", message);
  handleNewMessage(message);
  updateSidebarMessagesBadge(); // 🔥 ADD THIS
  try {
    showDesktopNotification(message);
  } catch (e) {
    console.warn("Desktop notification failed", e);
  }
});


    /////////////////////////

    // Add scroll listener for infinite scroll - listen to .content container, not window!
    const contentView = document.getElementById("feed-view");
    if (contentView) {
      contentView.addEventListener(
        "scroll",
        function () {
          const scrollPos = contentView.scrollTop + contentView.clientHeight;
          const threshold = contentView.scrollHeight - 500;

          console.log(
            `📍 Content Scroll: ${Math.round(
              scrollPos
            )}px | Threshold: ${Math.round(
              threshold
            )}px | Loading: ${isLoading} | HasCursor: ${!!nextCursor}`
          );

          if (scrollPos >= threshold && !isLoading && nextCursor) {
            console.log("🔄 LOADING MORE POSTS!");
            loadFeed();
          }
        },
        { passive: true }
      );
    } else {
      console.error("❌ feed-view container not found!");
    }
  } catch (error) {
    console.error("Init error:", error);
  }
}

// ============== USER DATA ==============
async function loadUserData() {
  try {
    const user = await fetchAPI("/api/users/me");
    currentUser = user;

    console.log("Current user loaded:", user);

    document.getElementById("account-name").textContent =
      user.displayName || user.username;
    document.getElementById(
      "account-username"
    ).textContent = `@${user.username}`;

    const avatarEl = document.querySelector(".account-avatar");
    if (user.avatarUrl) {
      avatarEl.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
  } catch (error) {
    console.error("Error loading user:", error);
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
  try {
    requestNotificationPermission();
  } catch (e) {
    console.warn("Notification permission helper missing");
  }

  const token = sessionStorage.getItem("token");

  if (!token || socket) return;

  // Connect to Socket.IO server using dynamic URL
  socket = io(`http://${window.location.hostname}:3000`, {
    auth: {
      token: token,
    },
  });

  // Connection established
  socket.on("connect", () => {
    console.log("✅ Socket.IO connected");
  });

  // Connection error
  socket.on("connect_error", (error) => {
    console.error("❌ Socket.IO connection error:", error);
  });

  // User came online
  socket.on("user_online", (data) => {
    console.log("👤 User online:", data.username);
    onlineUsers.add(data.userId);
    updateOnlineStatus();
  });

  // User went offline
  socket.on("user_offline", (data) => {
    console.log("👤 User offline:", data.userId);
    onlineUsers.delete(data.userId);
    updateOnlineStatus();
  });

  // Online users list
  socket.on("online_users", (users) => {
    onlineUsers = new Set(users);
    updateOnlineStatus();
  });

  // New message received
  socket.on("new_message", (message) => {
    console.log("📩 New message received:", message);
    handleNewMessage(message);
    try {
      showDesktopNotification(message);
    } catch (e) {
      console.warn("Desktop notification failed", e);
    }
  });

  // Message was sent successfully
  socket.on("message_sent", (message) => {
    console.log("✅ Message sent:", message);
    appendMessageToChat(message);
  });

  // Message was delivered
  socket.on("message_delivered", (data) => {
    console.log("✅ Message delivered:", data.messageId);
    updateMessageStatus(data.messageId, "delivered");
  });

  // Messages were read
  socket.on("messages_read", (data) => {
    console.log("✅ Messages read in conversation:", data.conversationId);
    if (currentConversation === data.conversationId) {
      markMessagesAsRead();
    }
  });

  // Someone is typing
  socket.on("user_typing", (data) => {
    showTypingIndicator(data);
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("❌ Socket.IO disconnected");
  });
}

// ============== MESSAGING FUNCTIONS ==============

// Load conversations list
// fallback placeholder (uploaded file you used)
const PLACEHOLDER_AVATAR = "monkey.jpg";
// Close chat (same behavior as back but clearer name)
function closeChat() {
  backToConversations();
}

// Robust, defensive loadConversations() to replace the broken one
async function loadConversations() {
  try {
    console.log("[messages] loading conversations...");
    const conversations = await fetchAPI("/api/messages/conversations");

    const container = document.getElementById("conversationsList");
    container.style.display = "block";
    container.innerHTML = "";

    if (!Array.isArray(conversations)) {
      console.warn("[messages] expected array but got:", conversations);
      container.innerHTML = `<div style="padding:20px;text-align:center;color:#8b8d91;">
        Debug: unexpected response (see console).</div>`;
      return;
    }

    if (conversations.length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">No conversations yet</div>';
      return;
    }

    container.innerHTML = conversations
      .map((conv) => {
        const other = conv.otherUser || conv.user || conv.participant || {};
        const otherId = other.id || other._id || other.userId || "";
        const displayName =
          other.displayName ||
          other.name ||
          other.fullName ||
          other.username ||
          "Unknown";
        const username =
          other.username || (other.email ? other.email.split("@")[0] : "user");
        const avatar = other.avatarUrl || other.avatar || "";
        const unreadCount = conv.unreadCount ?? 0;
        const lastMessageText =
          (conv.lastMessage && conv.lastMessage.text) || "";
        const lastCreated =
          (conv.lastMessage && conv.lastMessage.createdAt) || "";

        const lastMessagePreview =
          lastMessageText.length > 60
            ? lastMessageText.substring(0, 60) + "..."
            : lastMessageText;

        const isOnline =
          typeof onlineUsers !== "undefined" &&
          onlineUsers &&
          (onlineUsers.has ? onlineUsers.has(otherId) : false);

        const safeOtherId = ("" + otherId).replace(/'/g, "\\'");
        const safeUsername = ("" + username).replace(/'/g, "\\'");
        const safeDisplayName = ("" + displayName).replace(/'/g, "\\'");
        const safeAvatar = ("" + avatar).replace(/'/g, "\\'");

        // 🔥 HIGHLIGHT UNREAD CONVERSATIONS
        const isUnread = unreadCount > 0;
        const bgColor = isUnread ? "rgba(102, 126, 234, 0.15)" : "transparent";
        const textWeight = isUnread ? "600" : "400";

        return `
        <div class="conversation-item" 
             onclick="openConversation('${safeOtherId}', '${safeUsername}', '${safeDisplayName}', '${safeAvatar}', '${conv.conversationId || otherId || ""}')" 
             style="padding:12px;border-bottom:1px solid #2f3336;cursor:pointer;background:${bgColor};transition:0.2s;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="position:relative;flex-shrink:0;">
              <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);">
                ${
                  avatar
                    ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;" onerror="this.onerror=null;this.src='monkey.jpg'">`
                    : `<img src="monkey.jpg" style="width:100%;height:100%;object-fit:cover;">`
                }
              </div>
              ${
                isOnline
                  ? '<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>'
                  : ""
              }
            </div>

            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-weight:${textWeight};color:#e4e6eb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
          displayName
        )}</div>
                <div style="font-size:12px;color:#8b8d91;">${
                  lastCreated ? formatMessageTime(lastCreated) : ""
                }</div>
              </div>
              <div style="font-size:14px;color:${
                isUnread ? "#e4e6eb" : "#8b8d91"
              };font-weight:${textWeight};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(lastMessagePreview)}
              </div>
            </div>

            ${
              unreadCount > 0
                ? `<div style="background:#667eea;color:white;padding:6px;border-radius:12px;font-size:12px;font-weight:600;margin-left:8px;min-width:24px;text-align:center;">${unreadCount}</div>`
                : ""
            }
          </div>
        </div>
      `;
      })
      .join("");

    console.log("[messages] rendered", conversations.length, "conversations");
  } catch (error) {
    console.error("Error loading conversations:", error);
    const container = document.getElementById("conversationsList");
    container.innerHTML =
      '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load conversations</div>';
  }
}

// minimal html-escape helper (used above)
function escapeHtml(str = "") {
  return String(str).replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        s
      ])
  );
}

// Search users to message
let messageSearchTimeout;
async function searchUsersToMessage() {
  const query = document.getElementById("messageSearchInput").value.trim();
  const resultsContainer = document.getElementById("messageSearchResults");

  clearTimeout(messageSearchTimeout);

  if (query.length < 2) {
    resultsContainer.style.display = "none";
    resultsContainer.innerHTML = "";
    document.getElementById("conversationsList").style.display = "block";
    return;
  }

  messageSearchTimeout = setTimeout(async () => {
    try {
      resultsContainer.style.display = "block";
      document.getElementById("conversationsList").style.display = "none";
      resultsContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">Searching...</div>';

      const users = await fetchAPI(
        `/api/users/search?q=${encodeURIComponent(query)}`
      );

      if (!users || users.length === 0) {
        resultsContainer.innerHTML =
          '<div style="padding:20px;text-align:center;color:#8b8d91;">No users found</div>';
        return;
      }

      resultsContainer.innerHTML = users
        .map((user) => {
          const isOnline = onlineUsers.has(user.id);
          return `
                    <div onclick="startConversation('${user.id}', '${
            user.username
          }', '${user.displayName || user.username}', '${
            user.avatarUrl || ""
          }')" style="padding:15px;border-bottom:1px solid #2f3336;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:12px;">
                        <div style="position:relative;">
                            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;">
                                ${
                                  user.avatarUrl
                                    ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                                    : "👤"
                                }
                            </div>
                            ${
                              isOnline
                                ? '<div style="position:absolute;bottom:0;right:0;width:14px;height:14px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>'
                                : ""
                            }
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:600;color:#e4e6eb;">${
                              user.displayName || user.username
                            }</div>
                            <div style="font-size:13px;color:#8b8d91;">@${
                              user.username
                            }</div>
                        </div>
                    </div>
                `;
        })
        .join("");
    } catch (error) {
      console.error("Message search error:", error);
      resultsContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#ff7979;">Search failed</div>';
    }
  }, 300);
}

// Start a new conversation
function startConversation(userId, username, displayName, avatarUrl) {
  document.getElementById("messageSearchInput").value = "";
  document.getElementById("messageSearchResults").style.display = "none";
  document.getElementById("messageSearchResults").innerHTML = "";
  document.getElementById("conversationsList").style.display = "block";

  const conversationId = [currentUser.id, userId].sort().join("_");
  openConversation(userId, username, displayName, avatarUrl, conversationId);
}

// Open a conversation
async function openConversation(
  userId,
  username,
  displayName,
  avatarUrl,
  conversationId
) {
  currentConversation = conversationId;

  document.getElementById("conversationsList").style.display = "none";
  document.getElementById("messageSearchResults").style.display = "none";
  document.getElementById("chatWindow").style.display = "flex";
  document.getElementById("globalChatInput").style.display = "flex";

  document.getElementById("chatUserName").innerText = displayName;
  document.getElementById("chatUsername").innerText = "@" + username;

  const avatarEl = document.getElementById("chatUserAvatar");
  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    avatarEl.innerHTML = "💤";
  }

  window.currentRecipient = { id: userId, username, displayName };

  await loadMessages(userId);

  // 🔥 MARK MESSAGES AS READ
  if (socket) {
    socket.emit("mark_read", {
      conversationId: conversationId,
      senderId: userId,
    });
  }

  // 🔥 REFRESH CONVERSATION LIST TO UPDATE UNREAD COUNTS
  setTimeout(() => {
    loadConversations();
    updateSidebarMessagesBadge();
  }, 500);
}

// Fix updateSidebarMessagesBadge to use messages endpoint
async function updateSidebarMessagesBadge() {
  try {
    let token = sessionStorage.getItem('token');
    if (!token) {
      console.log('No token found - skipping badge update');
      return;
    }
    
    token = token.replace(/^"(.*)"$/, '$1').trim();
    
    console.log('📊 Fetching notification and message counts...');
    
    // Get notification count (bell icon)
    const notifRes = await fetch('/api/notifications/unread/count', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // 🔥 Get MESSAGES count (not notifications)
    const msgRes = await fetch('/api/messages/unread/count', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (notifRes.ok) {
      const notifData = await notifRes.json();
      console.log('✅ Notification count:', notifData.count);
      
      const notificationBadge = document.getElementById('notificationBadge');
      if (notifData.count > 0 && notificationBadge) {
        notificationBadge.textContent = notifData.count;
        notificationBadge.style.display = 'inline-block';
      } else if (notificationBadge) {
        notificationBadge.style.display = 'none';
      }
    }
    
    if (msgRes.ok) {
      const msgData = await msgRes.json();
      console.log('✅ Message count:', msgData.count);
      
      const messagesBadge = document.getElementById('sidebarMessagesBadge');
      if (msgData.count > 0 && messagesBadge) {
        messagesBadge.textContent = msgData.count;
        messagesBadge.style.display = 'inline-block';
      } else if (messagesBadge) {
        messagesBadge.style.display = 'none';
      }
    }
    
  } catch (e) {
    console.error('Error updating badges:', e);
  }
}

// Load messages for conversation
async function loadMessages(userId) {
  try {
    const chatMessages = document.getElementById("chatMessages");
    chatMessages.innerHTML =
      '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';

    const messages = await fetchAPI(`/api/messages/conversation/${userId}`);

    if (!messages || messages.length === 0) {
      chatMessages.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">No messages yet. Start the conversation!</div>';
      return;
    }

    chatMessages.innerHTML = messages
      .map((msg) => createMessageHTML(msg))
      .join("");

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  } catch (error) {
    console.error("Error loading messages:", error);
    document.getElementById("chatMessages").innerHTML =
      '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load messages</div>';
  }
}

// Create message HTML
function createMessageHTML(message) {
  const isMine = message.isMine;
  // unread incoming = message from others which is not yet read
  const isUnreadIncoming = !isMine && message.read === false;

  const bubbleBg = isMine
    ? "#667eea"                                        // your existing blue for own messages
    : (isUnreadIncoming ? "#4f78c0ff" : "#0366c9ff");      // darker + special for unread

  const bubbleFontWeight = isUnreadIncoming ? "600" : "400";
  const bubbleBoxShadow = isUnreadIncoming
    ? "0 0 0 1px rgba(96, 118, 218, 0.8)"           // subtle highlight ring
    : "none";

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
    <div class="message ${isMine ? "mine" : "theirs"}"
         data-message-id="${message.id}"
         style="display:flex;gap:10px;margin-bottom:12px;${isMine ? "flex-direction:row-reverse;" : ""}">
      
      ${
        !isMine
          ? `
        <div style="
          width:36px;
          height:36px;
          border-radius:50%;
          background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:16px;
          overflow:hidden;
          flex-shrink:0;
        ">
          ${
            message.sender && message.sender.avatarUrl
              ? `<img src="${message.sender.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
              : "👤"
          }
        </div>`
          : ""
      }

      <div style="max-width:70%;">
        <div
          style="
            background:${bubbleBg};
            color:#fff;
            padding:10px 14px;
            border-radius:${isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px"};
            word-wrap:break-word;
            font-weight:${bubbleFontWeight};
            box-shadow:${bubbleBoxShadow};
          "
        >
          ${escapeHtml(message.text || "")}
        </div>

        <div style="
          font-size:11px;
          color:#8b8d91;
          margin-top:4px;
          ${isMine ? "text-align:right;" : ""}
        ">
          ${time}
          ${
            isMine
              ? (message.read
                  ? " ✓✓"
                  : message.delivered
                    ? " ✓"
                    : " ○")
              : ""
          }
        </div>
      </div>
    </div>
  `;
}


// Send message
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text || !window.currentRecipient || !socket) return;

  // Emit message to server
  socket.emit("send_message", {
    recipientId: window.currentRecipient.id,
    text: text,
  });

  // Clear input
  input.value = "";

  // Stop typing indicator
  socket.emit("typing", {
    recipientId: window.currentRecipient.id,
    isTyping: false,
  });

  // Best-effort: create a server-side notification (if your API supports it)
  (async () => {
    try {
      const payload = {
        user: window.currentRecipient.id, // recipient (matches Notification.schema 'user')
        actor: currentUser && currentUser.id ? currentUser.id : null, // sender (matches 'actor')
        verb: "system", // using 'system' for message notifications (schema verbs: like,comment,follow,mention,reply,system)
        targetType: "Conversation",
        targetId: currentConversation || null,
        read: false,
      };
      await fetchAPI("/api/notifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Non-fatal — server may create notifications itself via sockets
      console.warn("Could not create notification via API:", e);
    }
  })();
}
// Handle Enter key in message input
function handleMessageKeyPress(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Append message to chat (when sent)
function appendMessageToChat(message) {
  const chatMessages = document.getElementById("chatMessages");

  // Remove "no messages" text if exists
  if (chatMessages.textContent.includes("No messages yet")) {
    chatMessages.innerHTML = "";
  }

  const messageHTML = createMessageHTML({
    id: message.id,
    sender: message.sender,
    text: message.text,
    createdAt: message.createdAt,
    delivered: message.delivered,
    read: message.read,
    isMine: true,
  });

  chatMessages.insertAdjacentHTML("beforeend", messageHTML);
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
      isMine: false,
    });

    const chatMessages = document.getElementById("chatMessages");
    chatMessages.insertAdjacentHTML("beforeend", messageHTML);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Mark as read
    if (socket) {
      socket.emit("mark_read", {
        conversationId: message.conversationId,
        senderId: message.sender.id,
      });
    }
  } else {
    // Show notification (optional)
    console.log("New message from:", message.sender.displayName);
  }
}

// Back to conversations
function backToConversations() {
  // Hide chat window
  document.getElementById("chatWindow").style.display = "none";

  // Show conversation list again
  document.getElementById("conversationsList").style.display = "block";

  // Keep input visible always
  document.getElementById("globalChatInput").style.display = "flex";

  document.getElementById("messageSearchInput").value = "";

  currentConversation = null;
  window.currentRecipient = null;

  loadConversations();
}

// Update online status indicators
function updateOnlineStatus() {
  // Update in conversations list and chat header
  if (window.currentRecipient && onlineUsers.has(window.currentRecipient.id)) {
    // Add online indicator to chat header
    const avatarEl = document.getElementById("chatUserAvatar");
    if (avatarEl && !avatarEl.querySelector('[style*="background:#00d084"]')) {
      avatarEl.style.position = "relative";
      avatarEl.insertAdjacentHTML(
        "beforeend",
        '<div style="position:absolute;bottom:0;right:0;width:12px;height:12px;background:#00d084;border:2px solid #242526;border-radius:50%;"></div>'
      );
    }
  }
}

// Format message time
function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000)
    return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Update message status
function updateMessageStatus(messageId, status) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    const statusEl = messageEl.querySelector('[style*="font-size:11px"]');
    if (statusEl && status === "delivered") {
      statusEl.innerHTML = statusEl.innerHTML.replace("○", "✓");
    }
  }
}

// Mark messages as read
function markMessagesAsRead() {
  const messages = document.querySelectorAll(
    '.message.mine [style*="font-size:11px"]'
  );
  messages.forEach((el) => {
    el.innerHTML = el.innerHTML.replace("✓", "✓✓");
  });
}

// Show typing indicator
let typingTimeout;
function showTypingIndicator(data) {
  if (
    !currentConversation ||
    !window.currentRecipient ||
    window.currentRecipient.id !== data.userId
  ) {
    return;
  }

  const chatMessages = document.getElementById("chatMessages");
  const existingIndicator = document.getElementById("typing-indicator");

  if (data.isTyping) {
    if (!existingIndicator) {
      chatMessages.insertAdjacentHTML(
        "beforeend",
        `
                <div id="typing-indicator" style="padding:10px;color:#8b8d91;font-size:13px;font-style:italic;">
                    ${data.username} is typing...
                </div>
            `
      );
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      const indicator = document.getElementById("typing-indicator");
      if (indicator) indicator.remove();
    }, 3000);
  } else {
    if (existingIndicator) existingIndicator.remove();
  }
}

// Handle typing in message input
let typingIndicatorSent = false;
document.addEventListener("DOMContentLoaded", () => {
  const messageInput = document.getElementById("messageInput");
  if (messageInput) {
    messageInput.addEventListener("input", () => {
      if (!socket || !window.currentRecipient) return;

      if (messageInput.value.trim() && !typingIndicatorSent) {
        socket.emit("typing", {
          recipientId: window.currentRecipient.id,
          isTyping: true,
        });
        typingIndicatorSent = true;
      } else if (!messageInput.value.trim() && typingIndicatorSent) {
        socket.emit("typing", {
          recipientId: window.currentRecipient.id,
          isTyping: false,
        });
        typingIndicatorSent = false;
      }
    });
  }
});

// ============== UPDATE INIT FUNCTION ==============
// Add this to your existing init() function:
// ----------------- Sidebar messages badge helper -----------------
async function updateSidebarMessagesBadge() {
  try {
    const token = sessionStorage.getItem("token");
    if (!token) {
      // no token - hide badge
      const b = document.getElementById("sidebarMessagesBadge");
      if (b) b.style.display = "none";
      return;
    }

    // Use your notifications unread count endpoint (adjust path if your backend differs)
    const res = await fetch(`${API_URL}/api/notifications/unread/count`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    if (!res.ok) {
      // handle 401/404 gracefully
      console.warn("updateSidebarMessagesBadge: non-ok status", res.status);
      const b = document.getElementById("sidebarMessagesBadge");
      if (b) b.style.display = "none";
      return;
    }

    const data = await res.json();
    const badge = document.getElementById("sidebarMessagesBadge");
    if (!badge) return;

    if (data.count && data.count > 0) {
      badge.textContent = data.count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch (err) {
    console.warn("updateSidebarMessagesBadge error (ignored):", err);
    const b = document.getElementById("sidebarMessagesBadge");
    if (b) b.style.display = "none";
  }
}

// ============== UPDATE showMessages FUNCTION ==============
function showMessages(event) {
  document
    .querySelectorAll(".content")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("messages-view").classList.add("active");

  document
    .querySelectorAll(".toggle-btn")
    .forEach((el) => el.classList.remove("active"));
  if (event) event.target.classList.add("active");

  // Always show chat input
  document.getElementById("globalChatInput").style.display = "flex";

  // Show conversations list
  document.getElementById("conversationsList").style.display = "block";

  // Hide chat window until user selects a conversation
  document.getElementById("chatWindow").style.display = "none";

  loadConversations();
}

function createPostHTML(post) {
  const avatar =
    post.avatar !== "👤"
      ? `<img src="${post.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : "👤";

  return `
    <div class="post-card" id="post-${post.id}">
      <div class="post-header">
        <div class="post-avatar">${avatar}</div>
        <div>
          <div class="post-name">${post.displayName || post.username}</div>
          <div class="post-username">@${post.username} · ${post.timestamp}</div>
        </div>
      </div>
      <div class="post-content">${post.content}</div>
      ${
        post.mediaUrl
          ? `<img src="${post.mediaUrl}" class="post-media" alt="Post media">`
          : ""
      }
      <div class="post-actions">
        <button class="action-btn ${post.liked ? "liked" : ""}" onclick="toggleLike('${post.id}')">
          ${post.liked ? "❤️" : "🤍"} <span id="likes-${post.id}">${post.likes}</span>
        </button>
        <button class="action-btn" onclick="toggleComments('${post.id}')">
          💬 <span id="comments-count-${post.id}">${post.comments || 0}</span>
        </button>
        <button class="action-btn">🔄</button>
        <button class="action-btn">📤</button>
      </div>

      <!-- COMMENTS SECTION (Hidden by default) -->
      <div class="comments-section" id="comments-${post.id}" style="display:none;margin-top:15px;border-top:1px solid #2f3336;padding-top:15px;">
        
        <!-- Add Comment Form -->
        <div style="display:flex;gap:10px;margin-bottom:15px;align-items:center;">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;flex-shrink:0;">
            ${currentUser && currentUser.avatarUrl ? `<img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : "👤"}
          </div>
          <input 
            type="text" 
            id="comment-input-${post.id}" 
            placeholder="Write a comment..." 
            style="flex:1;padding:10px 15px;border-radius:20px;border:1px solid #3a3b3c;background:#18191a;color:#e4e6eb;font-size:14px;"
            onkeypress="handleCommentKeyPress(event, '${post.id}')"
          >
          <button 
            onclick="addComment('${post.id}')" 
            style="padding:8px 16px;background:#667eea;color:white;border:none;border-radius:20px;cursor:pointer;font-weight:600;font-size:14px;">
            ➕ Add
          </button>
        </div>

        <!-- Comments List -->
        <div id="comments-list-${post.id}" style="display:flex;flex-direction:column;gap:12px;">
          <!-- Comments will be loaded here -->
        </div>
      </div>
    </div>
  `;
}
async function toggleComments(postId) {
  const commentsSection = document.getElementById(`comments-${postId}`);
  
  if (!commentsSection) {
    console.error('Comments section not found for post:', postId);
    return;
  }

  if (commentsSection.style.display === 'none') {
    // Show comments and load them
    commentsSection.style.display = 'block';
    await loadComments(postId);
  } else {
    // Hide comments
    commentsSection.style.display = 'none';
  }
}

// Load comments for a post
async function loadComments(postId) {
  try {
    const commentsList = document.getElementById(`comments-list-${postId}`);
    
    if (!commentsList) {
      console.error('Comments list element not found');
      return;
    }

    commentsList.innerHTML = '<div style="text-align:center;color:#8b8d91;padding:10px;">Loading comments...</div>';

    const comments = await fetchAPI(`/api/posts/${postId}/comments`);

    if (!comments || comments.length === 0) {
      commentsList.innerHTML = '<div style="text-align:center;color:#8b8d91;padding:10px;">No comments yet. Be the first to comment!</div>';
      return;
    }

    commentsList.innerHTML = comments.map(comment => createCommentHTML(comment, postId)).join('');

  } catch (error) {
    console.error('Error loading comments:', error);
    const commentsList = document.getElementById(`comments-list-${postId}`);
    if (commentsList) {
      commentsList.innerHTML = '<div style="text-align:center;color:#ff7979;padding:10px;">Failed to load comments</div>';
    }
  }
}

// Create comment HTML
function createCommentHTML(comment, postId) {
  const author = comment.author || {};
  const avatar = author.avatarUrl 
    ? `<img src="${author.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
    : "👤";

  const isMyComment = currentUser && currentUser.id === author.id;
  const createdAt = new Date(comment.createdAt).toLocaleString();

  return `
    <div class="comment-item" style="display:flex;gap:10px;padding:12px;background:#18191a;border-radius:8px;">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;flex-shrink:0;">
        ${avatar}
      </div>
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <div>
            <span style="font-weight:600;color:#e4e6eb;font-size:14px;">${author.displayName || author.username}</span>
            <span style="color:#8b8d91;font-size:12px;margin-left:8px;">@${author.username}</span>
          </div>
          ${isMyComment ? `
            <button 
              onclick="deleteComment('${comment.id}', '${postId}')" 
              style="background:none;border:none;color:#ff7979;cursor:pointer;font-size:18px;padding:4px 8px;"
              title="Delete comment">
              🗑️
            </button>
          ` : ''}
        </div>
        <div style="color:#e4e6eb;font-size:14px;margin-bottom:5px;">${comment.text}</div>
        <div style="color:#8b8d91;font-size:12px;">${formatTimestamp(comment.createdAt)}</div>
      </div>
    </div>
  `;
}

// Add a comment
async function addComment(postId) {
  try {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();

    if (!text) {
      alert('Please write a comment');
      return;
    }

    // Disable input while submitting
    input.disabled = true;

    const result = await fetchAPI(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    console.log('Comment added:', result);

    // Clear input
    input.value = '';
    input.disabled = false;

    // Reload comments
    await loadComments(postId);

    // Update comment count
    const countElement = document.getElementById(`comments-count-${postId}`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent) || 0;
      countElement.textContent = currentCount + 1;
    }

  } catch (error) {
    console.error('Error adding comment:', error);
    alert('Failed to add comment: ' + (error.message || 'Unknown error'));
    
    // Re-enable input
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) input.disabled = false;
  }
}

// Delete a comment
async function deleteComment(commentId, postId) {
  if (!confirm('Are you sure you want to delete this comment?')) {
    return;
  }

  try {
    await fetchAPI(`/api/comments/${commentId}`, {
      method: 'DELETE'
    });

    console.log('Comment deleted');

    // Reload comments
    await loadComments(postId);

    // Update comment count
    const countElement = document.getElementById(`comments-count-${postId}`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent) || 0;
      countElement.textContent = Math.max(0, currentCount - 1);
    }

  } catch (error) {
    console.error('Error deleting comment:', error);
    alert('Failed to delete comment: ' + (error.message || 'Unknown error'));
  }
}

// Handle Enter key press in comment input
function handleCommentKeyPress(event, postId) {
  if (event.key === 'Enter') {
    event.preventDefault();
    addComment(postId);
  }
}

// ============== HELPER FUNCTION ==============
function formatTimestamp(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// Make functions globally available
window.toggleComments = toggleComments;
window.loadComments = loadComments;
window.addComment = addComment;
window.deleteComment = deleteComment;
window.handleCommentKeyPress = handleCommentKeyPress;

console.log('✅ Comment functionality loaded');
async function toggleLike(postId) {
  try {
    const result = await fetchAPI(`/api/posts/${postId}/like`, {
      method: "POST",
    });

    const likesElement = document.getElementById(`likes-${postId}`);
    if (likesElement) {
      likesElement.textContent = result.likes;
    }

    const btn = likesElement.closest(".action-btn");
    if (result.liked) {
      btn.classList.add("liked");
      btn.innerHTML = `❤️ <span id="likes-${postId}">${result.likes}</span>`;
    } else {
      btn.classList.remove("liked");
      btn.innerHTML = `🤍 <span id="likes-${postId}">${result.likes}</span>`;
    }
  } catch (error) {
    console.error("Error toggling like:", error);
  }
}

// ============== NOTIFICATIONS ==============
async function checkNotifications() {
  try {
    const result = await fetchAPI("/api/notifications/unread/count");
    const badge = document.getElementById("notificationBadge");

    if (result.count > 0) {
      badge.textContent = result.count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch (error) {
    console.error("Error checking notifications:", error);
  }
}

async function loadNotifications() {
  try {
    const container = document.getElementById("notifications-list");
    container.innerHTML =
      '<div style="padding:20px;text-align:center;color:#8b8d91;">Loading...</div>';

    const notifications = await fetchAPI("/api/notifications");

    if (!notifications || notifications.length === 0) {
      container.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">No notifications yet</div>';
      return;
    }

    container.innerHTML = notifications
      .map((n) => {
        const actor = n.actor || {};
        const actorName = actor.displayName || actor.username || "Someone";
        const avatar = actor.avatarUrl
          ? `<img src="${actor.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
          : "👤";

        let verbText = "";
        switch (n.verb) {
          case "follow":
            verbText = "started following you";
            break;
          case "like":
            verbText = "liked your post";
            break;
          case "comment":
            verbText = "commented on your post";
            break;
          default:
            verbText = n.verb;
        }

        const time = new Date(n.createdAt).toLocaleString();

        return `
                <div class="notification-item" style="padding:15px 20px;border-bottom:1px solid #2f3336;display:flex;gap:12px;align-items:center;${
                  !n.read ? "background:rgba(102,126,234,0.05);" : ""
                }">
                    <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;overflow:hidden;">
                        ${avatar}
                    </div>
                    <div style="flex:1;">
                        <div style="color:#e4e6eb;font-size:14px;margin-bottom:4px;">
                            <strong>${actorName}</strong> ${verbText}
                        </div>
                        <div style="color:#8b8d91;font-size:12px;">${time}</div>
                    </div>
                    ${
                      !n.read
                        ? `<button onclick="markNotificationRead('${n.id}')" style="padding:6px 12px;background:#667eea;border:none;border-radius:6px;color:white;cursor:pointer;font-size:12px;">Mark read</button>`
                        : ""
                    }
                </div>
            `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading notifications:", error);
    document.getElementById("notifications-list").innerHTML =
      '<div style="padding:20px;text-align:center;color:#ff7979;">Failed to load notifications</div>';
  }
}

async function markNotificationRead(notificationId) {
  try {
    await fetchAPI(`/api/notifications/${notificationId}/read`, {
      method: "PUT",
    });
    await loadNotifications();
    await checkNotifications();
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

// ============== VIEW SWITCHING ==============
function switchToHome(event) {
  document
    .querySelectorAll(".content")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("feed-view").classList.add("active");

  document
    .querySelectorAll(".menu-link")
    .forEach((el) => el.classList.remove("active"));
  if (event && event.target) event.target.classList.add("active");

  document
    .querySelectorAll(".toggle-btn")
    .forEach((el) => el.classList.remove("active"));
  const firstToggle = document.querySelector(".toggle-btn:first-child");
  if (firstToggle) firstToggle.classList.add("active");
}

function switchToNotifications(event) {
  document
    .querySelectorAll(".content")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("notifications-view").classList.add("active");

  document
    .querySelectorAll(".menu-link")
    .forEach((el) => el.classList.remove("active"));
  if (event && event.target) event.target.classList.add("active");

  loadNotifications();
}

function showFeed(event) {
  document
    .querySelectorAll(".content")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("feed-view").classList.add("active");

  document
    .querySelectorAll(".toggle-btn")
    .forEach((el) => el.classList.remove("active"));
  event.target.classList.add("active");

  // 🔥 KEEP INPUT BAR ALWAYS VISIBLE
  document.getElementById("globalChatInput").style.display = "flex";
}

// ============== SEARCH MODAL ==============
let searchTimeout;

function showSearchModal() {
  document.getElementById("searchModal").classList.add("active");
  document.getElementById("searchInput").focus();
}

function closeSearchModal() {
  document.getElementById("searchModal").classList.remove("active");
  document.getElementById("searchInput").value = "";
  document.getElementById("searchResults").innerHTML = "";
}

async function searchUsers() {
  const query = document.getElementById("searchInput").value.trim();
  const resultsContainer = document.getElementById("searchResults");

  clearTimeout(searchTimeout);

  if (query.length < 2) {
    resultsContainer.innerHTML = "";
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      resultsContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#8b8d91;">Searching...</div>';

      const users = await fetchAPI(
        `/api/users/search?q=${encodeURIComponent(query)}`
      );

      if (!users || users.length === 0) {
        resultsContainer.innerHTML =
          '<div style="padding:20px;text-align:center;color:#8b8d91;">No users found</div>';
        return;
      }

      resultsContainer.innerHTML = users
        .map(
          (user) => `
                <div class="search-result-item" style="display:flex;align-items:center;gap:15px;padding:12px;border-radius:8px;background:#18191a;margin-bottom:10px;">
                    <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;overflow:hidden;">
                        ${
                          user.avatarUrl
                            ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                            : "👤"
                        }
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;color:#e4e6eb;">${
                          user.displayName || user.username
                        }</div>
                        <div style="font-size:13px;color:#8b8d91;">@${
                          user.username
                        }</div>
                        <div style="font-size:12px;color:#666;">${
                          user.followersCount || 0
                        } followers</div>
                    </div>
                    <button class="follow-btn" id="follow-btn-${
                      user.id
                    }" onclick="toggleFollow('${
            user.id
          }')" style="padding:8px 20px;background:#667eea;color:white;border:none;border-radius:20px;font-weight:600;cursor:pointer;font-size:13px;">
                        Follow
                    </button>
                </div>
            `
        )
        .join("");

      // Check follow status for each user
      users.forEach((user) => checkFollowStatus(user.id));
    } catch (error) {
      console.error("Search error:", error);
      resultsContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#ff7979;">Search failed</div>';
    }
  }, 300);
}

async function checkFollowStatus(userId) {
  if (!userId || userId === "undefined" || userId === "null") {
    console.error("Invalid user ID for follow status check:", userId);
    return;
  }

  try {
    const result = await fetchAPI(`/api/users/${userId}/following`);
    const btn = document.getElementById(`follow-btn-${userId}`);

    if (btn) {
      if (result.following) {
        btn.textContent = "Unfollow";
        btn.style.background = "#2f3336";
      } else {
        btn.textContent = "Follow";
        btn.style.background = "#667eea";
      }
    }
  } catch (error) {
    console.error("Error checking follow status for user", userId, ":", error);
    // Don't show alert for status check failures
  }
}
async function toggleFollow(userId) {
  // Validate userId
  if (!userId || userId === "undefined" || userId === "null") {
    console.error("Invalid user ID:", userId);
    alert("Invalid user ID");
    return;
  }

  const btn = document.getElementById(`follow-btn-${userId}`);
  if (!btn) {
    console.error("Button not found for user:", userId);
    return;
  }

  const isFollowing = btn.textContent.trim() === "Unfollow";
  const originalText = btn.textContent;
  const originalBg = btn.style.background;

  try {
    // Disable button and show loading
    btn.disabled = true;
    btn.textContent = "...";

    console.log(`${isFollowing ? "Unfollowing" : "Following"} user: ${userId}`);

    let result;

    if (isFollowing) {
      // Unfollow
      result = await fetchAPI(`/api/users/${userId}/follow`, {
        method: "DELETE",
      });

      console.log("Unfollow result:", result);

      btn.textContent = "Follow";
      btn.style.background = "#667eea";
    } else {
      // Follow
      result = await fetchAPI(`/api/users/${userId}/follow`, {
        method: "POST",
      });

      console.log("Follow result:", result);

      btn.textContent = "Unfollow";
      btn.style.background = "#2f3336";
    }

    console.log("✅ Toggle follow successful");
  } catch (error) {
    console.error("❌ Toggle follow error:", error);

    // Restore button state
    btn.textContent = originalText;
    btn.style.background = originalBg;

    // Show user-friendly error
    if (error.message) {
      alert(`Error: ${error.message}`);
    } else {
      alert("Failed to update follow status. Please try again.");
    }
  } finally {
    // Always re-enable button
    btn.disabled = false;
  }
}
// ============== FOLLOWERS/FOLLOWING DISPLAY ==============
//are they needed here
async function showFollowersList(userId) {
  try {
    console.log("Loading followers for user:", userId);
    const followers = await fetchAPI(`/api/users/${userId}/followers`);
    displayUserListModal(followers, "Followers");
  } catch (error) {
    console.error("Error loading followers:", error);
    alert("Failed to load followers");
  }
}

async function showFollowingList(userId) {
  try {
    console.log("Loading following for user:", userId);
    const following = await fetchAPI(`/api/users/${userId}/following-list`);
    displayUserListModal(following, "Following");
  } catch (error) {
    console.error("Error loading following:", error);
    alert("Failed to load following");
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
                    ${
                      users.length === 0
                        ? `<div style="text-align:center;color:#8b8d91;padding:20px;">No ${title.toLowerCase()} yet</div>`
                        : ""
                    }
                    ${users
                      .map(
                        (user) => `
                        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;background:#18191a;margin-bottom:8px;">
                            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;flex-shrink:0;">
                                ${
                                  user.avatarUrl
                                    ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                                    : "👤"
                                }
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:600;font-size:14px;color:#e4e6eb;">${
                                  user.displayName || user.username
                                }</div>
                                <div style="font-size:13px;color:#8b8d91;">@${
                                  user.username
                                }</div>
                                <div style="font-size:12px;color:#666;">${
                                  user.followersCount || 0
                                } followers</div>
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
            </div>
        </div>
    `;

  // Remove existing modal if any
  const existing = document.getElementById("userListModal");
  if (existing) existing.remove();

  // Add new modal
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function closeUserListModal() {
  const modal = document.getElementById("userListModal");
  if (modal) modal.remove();
}

// Make functions globally available
window.showFollowersList = showFollowersList;
window.showFollowingList = showFollowingList;
window.closeUserListModal = closeUserListModal;

// ============== POST MODAL ==============
let selectedPostType = "text";

function showPostModal() {
  document.getElementById("postModal").classList.add("active");
  selectPostType("text");
}

function closePostModal() {
  document.getElementById("postModal").classList.remove("active");
  document.getElementById("textPostInput").value = "";
  document.getElementById("fileUploadInput").value = "";
  document.getElementById("fileCaptionInput").value = "";
}

function selectPostType(type, event) {
  selectedPostType = type;

  document
    .querySelectorAll(".type-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (event && event.target) event.target.classList.add("active");

  document
    .querySelectorAll(".post-form")
    .forEach((form) => form.classList.remove("active"));

  if (type === "text") {
    document.getElementById("textForm").classList.add("active");
  } else {
    document.getElementById("fileForm").classList.add("active");
  }
}

async function submitPost() {
  try {
    let content,
      mediaUrl = null;

    if (selectedPostType === "text") {
      content = document.getElementById("textPostInput").value.trim();
      if (!content) {
        alert("Please write something");
        return;
      }
    } else {
      const fileInput = document.getElementById("fileUploadInput");
      const caption = document.getElementById("fileCaptionInput").value.trim();

      if (!fileInput.files || !fileInput.files[0]) {
        alert("Please select a file");
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

      content = caption || "Posted a file";
    }

    const result = await fetchAPI("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        content,
        type: selectedPostType,
        mediaUrl,
      }),
    });

    closePostModal();
    await loadFeed(true);
  } catch (error) {
    console.error("Error creating post:", error);
    alert("Failed to create post");
  }
}

// ============== LOGOUT ==============

// ----------------- Desktop / In-page Notifications for messages -----------------
function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.warn("This browser does not support desktop notifications.");
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission()
      .then((permission) => {
        console.log("Notification permission:", permission);
      })
      .catch((err) =>
        console.warn("Notification permission request failed:", err)
      );
  }
}

function showDesktopNotification(message) {
  try {
    // only notify if the message is from someone else
    if (!message || !message.sender) return;
    if (
      window.currentRecipient &&
      window.currentRecipient.id === message.sender.id
    ) {
      // user currently viewing the conversation — no desktop notification needed
      return;
    }
    const title =
      message.sender.displayName || message.sender.username || "New message";
    const body =
      message.text && message.text.length > 120
        ? message.text.substring(0, 120) + "…"
        : message.text || "Sent you a message";
    const icon = message.sender.avatarUrl
      ? message.sender.avatarUrl
      : undefined;

    // In-app visual toast (simple)
    try {
      showInAppToast(
        title,
        body,
        icon,
        () => {
          const convId =
            message.conversationId ||
            [currentUser && currentUser.id, message.sender.id]
              .filter(Boolean)
              .sort()
              .join("_");
          openConversation(
            message.sender.id,
            message.sender.username,
            message.sender.displayName,
            message.sender.avatarUrl || "",
            convId
          );
          window.focus();
        },
        "Reply"
      );
    } catch (e) {
      // ignore if toast helper not present
    }

    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      const n = new Notification(title, { body, icon });
      n.onclick = () => {
        window.focus();
        // open conversation on click
        const convId =
          message.conversationId ||
          [currentUser && currentUser.id, message.sender.id].sort().join("_");
        openConversation(
          message.sender.id,
          message.sender.username,
          message.sender.displayName,
          message.sender.avatarUrl || "",
          convId
        );
        n.close();
      };
    } else if (Notification.permission === "default") {
      // prompt for permission
      requestNotificationPermission();
    }
  } catch (err) {
    console.warn("Failed to show desktop notification", err);
  }
}

// Simple in-app toast fallback (non-blocking)

// Simple in-app toast fallback (non-blocking) with an optional action button
function showInAppToast(title, body, icon, onClick, actionText = "Reply") {
  try {
    const toast = document.createElement("div");
    toast.className = "inapp-toast";
    toast.style =
      "position:fixed;right:20px;bottom:20px;background:#1f1f1f;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,0.5);z-index:9999;max-width:360px;cursor:default;display:flex;gap:12px;align-items:flex-start;";
    toast.innerHTML = `
            <div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#2b2b2b;">
                ${
                  icon
                    ? `<img src="${icon}" style="width:100%;height:100%;object-fit:cover;">`
                    : "💬"
                }
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
    toast
      .querySelector(".inapp-toast-reply")
      .addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (typeof onClick === "function") onClick();
        toast.remove();
      });
    // Dismiss button click
    toast
      .querySelector(".inapp-toast-dismiss")
      .addEventListener("click", (ev) => {
        ev.stopPropagation();
        toast.remove();
      });
    // Clicking anywhere on the toast also triggers onClick for convenience
    toast.addEventListener("click", () => {
      if (typeof onClick === "function") onClick();
      toast.remove();
    });
    document.body.appendChild(toast);
    // Auto-remove after 10s
    setTimeout(() => {
      if (toast && toast.parentNode) toast.remove();
    }, 10000);
  } catch (e) {
    console.warn("Could not show in-app toast", e);
  }
}

async function logout() {
  try {
    const token = sessionStorage.getItem("token");
    if (token) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });
    }
  } catch (err) {
    console.warn("Logout log failed (ignoring):", err);
  }

  // Clear token and redirect regardless
  sessionStorage.removeItem("token");
  window.location.href = "/login.html";
}

// ============== CLOSE MODALS ON OUTSIDE CLICK ==============
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
});

// ============== INITIALIZE ON LOAD ==============
document.addEventListener("DOMContentLoaded", init);

console.log("✅ Script loaded successfully");
async function showMyFollowers() {
  if (!currentUser || !currentUser.id) {
    console.error("Current user not loaded");
    return;
  }
  await showFollowersList(currentUser.id);
}

async function showMyFollowing() {
  if (!currentUser || !currentUser.id) {
    console.error("Current user not loaded");
    return;
  }
  await showFollowingList(currentUser.id);
}

// Update the loadUserData function to also update these counts
async function loadUserData() {
  try {
    const user = await fetchAPI("/api/users/me");
    currentUser = user;

    console.log("Current user loaded:", user);

    document.getElementById("account-name").textContent =
      user.displayName || user.username;
    document.getElementById(
      "account-username"
    ).textContent = `@${user.username}`;

    // UPDATE FOLLOWER COUNTS IF ELEMENTS EXIST
    const followersEl = document.getElementById("my-followers-count");
    const followingEl = document.getElementById("my-following-count");

    if (followersEl) followersEl.textContent = user.followersCount || 0;
    if (followingEl) followingEl.textContent = user.followingCount || 0;

    const avatarEl = document.querySelector(".account-avatar");
    if (user.avatarUrl) {
      avatarEl.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
  } catch (error) {
    console.error("Error loading user:", error);
  }
}

//check notification
async function checkNotifications() {
  try {
    const result = await fetchAPI("/api/notifications/unread/count");
    const badge = document.getElementById("notificationBadge");
    if (result.count > 0) {
      badge.textContent = result.count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }

    // keep sidebar badge synced too
    updateSidebarMessagesBadge();
  } catch (error) {
    console.error("Error checking notifications:", error);
  }
}

//for side bar
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 DOMContentLoaded fired, calling init()...");
  init(); // (your existing init call)
  // Add:
  updateSidebarMessagesBadge();
});

/* ---------- resilient sidebar badge + auth-aware fetch ---------- */

const SIDEBAR_BADGE_ID = "sidebarMessagesBadge";
const NOTIF_COUNT_PATH = "/api/notifications/unread/count"; // adjust if your server uses a different path

// Helper: fetch with Authorization header
async function fetchWithToken(path, opts = {}) {
  const token = sessionStorage.getItem("token");
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
}

// Update the badge element safely
function showSidebarBadge(count) {
  const badge = document.getElementById(SIDEBAR_BADGE_ID);
  if (!badge) return;
  if (Number(count) > 0) {
    badge.textContent = String(count);
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

// Resilient polling with backoff (prevents floods)
let _notifPoll = { timer: null, interval: 30000, attempts: 0 };

async function pollNotificationCountOnce() {
  try {
    // If no token, hide badge and stop polling
    const token = sessionStorage.getItem("token");
    if (!token) {
      showSidebarBadge(0);
      // don't poll until user logs in
      return;
    }

    const res = await fetchWithToken(NOTIF_COUNT_PATH, { method: "GET" });

    if (!res.ok) {
      // handle common non-ok responses gracefully
      if (res.status === 401) {
        console.warn(
          "Unread-count: unauthorized (401). Stopping polling until re-auth."
        );
        showSidebarBadge(0);
        stopNotificationsPolling();
        return;
      }
      if (res.status === 404) {
        console.warn(
          "Unread-count: endpoint not found (404). Stopping polling."
        );
        showSidebarBadge(0);
        stopNotificationsPolling();
        return;
      }
      // Other statuses: back off and retry later
      console.warn("Unread-count: non-ok status", res.status);
      throw new Error("Non-ok status " + res.status);
    }

    // success -> parse JSON and update
    const data = await res.json();
    showSidebarBadge(data.count || 0);

    // reset backoff on success
    _notifPoll.attempts = 0;
    _notifPoll.interval = 30000;
  } catch (err) {
    // On network/parse error, back off exponentially
    _notifPoll.attempts = (_notifPoll.attempts || 0) + 1;
    _notifPoll.interval = Math.min(
      300000,
      30000 * Math.pow(2, Math.min(_notifPoll.attempts - 1, 5))
    );
    console.warn(
      "pollNotificationCountOnce error (backing off):",
      err,
      "next interval:",
      _notifPoll.interval
    );
  }
}

function startNotificationsPolling() {
  if (_notifPoll.timer) return; // already running
  async function loop() {
    await pollNotificationCountOnce();
    _notifPoll.timer = setTimeout(loop, _notifPoll.interval);
  }
  loop();
}

function stopNotificationsPolling() {
  if (_notifPoll.timer) {
    clearTimeout(_notifPoll.timer);
    _notifPoll.timer = null;
  }
}

// init on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  // single immediate check
  pollNotificationCountOnce().catch(() => {});
  // start polling (resilient)
  startNotificationsPolling();

  // If you have a global function that refreshes notifications (checkNotifications),
  // call startNotificationsPolling() after that succeeds to keep things in sync.
});
