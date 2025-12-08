// =====================================================
//  CONFIG & GLOBAL STATE
// =====================================================

// const API_URL = `http://${window.location.hostname}:3000`;4
const API_BASE = "https://socialsync-ow8q.onrender.com";
const socket = io("https://socialsync-ow8q.onrender.com");

const API_URL = API_BASE;
const token = sessionStorage.getItem("token");

// Redirect to login if no token (kept as-is)
if (!token) {
  window.location.href = "/login.html";
}

let currentUser = null;
let nextCursor = null;
let isLoading = false;

// =====================================================
//  AUTHENTICATION CHECK (IIFE)
// =====================================================

// Skip auth check on login/signup
(function checkAuth() {
  const currentPage = window.location.pathname;
  if (
    currentPage.includes("login.html") ||
    currentPage.includes("signup.html")
  ) {
    console.log("🟡 On login/signup page - skipping auth check");
    return;
  }

  console.log("🔐 Checking authentication...");

  let token = sessionStorage.getItem("token");

  if (!token) {
    console.error("❌ No token found - redirecting to login");
    window.location.href = "/login.html";
    return;
  }

  // Clean token
  token = token.replace(/^"(.*)"$/, "$1").trim();

  console.log("✅ Token found (length):", token.length);
  console.log("✅ Token preview:", token.substring(0, 30) + "...");

  const parts = token.split(".");
  if (parts.length !== 3) {
    console.error("❌ Invalid token format - redirecting to login");
    sessionStorage.removeItem("token");
    window.location.href = "/login.html";
    return;
  }

  console.log("✅ Token format valid (3 parts)");

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
  }

  console.log("✅ Auth check passed - continuing to load page");
})();

// =====================================================
//  GENERIC HELPERS
// =====================================================

// Single API helper
async function fetchAPI(endpoint, options = {}) {
  const token = options.token || sessionStorage.getItem("token") || "";

  const defaultHeaders = {
    "Content-Type": "application/json",
  };
  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    credentials: "include",
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
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
  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

function formatTimestamp(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);

  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

// Small helper used by share search rendering
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Generic fetch-with-token (used by sidebar polling)
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

// =====================================================
//  USER DATA & FOLLOWERS
// =====================================================

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

    // follower counts (if present)
    const followersEl = document.getElementById("my-followers-count");
    const followingEl = document.getElementById("my-following-count");
    if (followersEl) followersEl.textContent = user.followersCount || 0;
    if (followingEl) followingEl.textContent = user.followingCount || 0;

    const avatarEl = document.querySelector(".account-avatar");
    if (user.avatarUrl && avatarEl) {
      avatarEl.innerHTML = `<img src="${user.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
  } catch (error) {
    console.error("Error loading user:", error);
  }
}

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

  const existing = document.getElementById("userListModal");
  if (existing) existing.remove();

  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function closeUserListModal() {
  const modal = document.getElementById("userListModal");
  if (modal) modal.remove();
}

// helpers bound to currentUser
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

// expose follower helpers
window.showFollowersList = showFollowersList;
window.showFollowingList = showFollowingList;
window.closeUserListModal = closeUserListModal;

// =====================================================
//  FEED & POSTS
// =====================================================

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

function createPostHTML(post) {
  const avatar =
    post.avatar !== "👤"
      ? `<img src="${post.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
      : "👤";

  const shareText = JSON.stringify(post.content || "");

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
        <button class="action-btn ${
          post.liked ? "liked" : ""
        }" onclick="toggleLike('${post.id}')">
          ${post.liked ? "❤️" : "🤍"} <span id="likes-${post.id}">${
    post.likes
  }</span>
        </button>
        <button class="action-btn" onclick="toggleComments('${post.id}')">
          💬 <span id="comments-count-${post.id}">${post.comments || 0}</span>
        </button>
        <button
          class="action-btn"
          onclick="openShareModal('${post.id}', ${shareText})"
        >
          📤
        </button>
      </div>

      <div class="comments-section" id="comments-${
        post.id
      }" style="display:none;margin-top:15px;border-top:1px solid #2f3336;padding-top:15px;">
        <div style="display:flex;gap:10px;margin-bottom:15px;align-items:center;">
          <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;flex-shrink:0;">
            ${
              currentUser && currentUser.avatarUrl
                ? `<img src="${currentUser.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                : "👤"
            }
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

        <div id="comments-list-${
          post.id
        }" style="display:flex;flex-direction:column;gap:12px;">
        </div>
      </div>
    </div>
  `;
}

async function toggleLike(postId) {
  try {
    const result = await fetchAPI(`/api/posts/${postId}/like`, {
      method: "POST",
    });

    const likesElement = document.getElementById(`likes-${postId}`);
    if (likesElement) {
      likesElement.textContent = result.likes;
      const btn = likesElement.closest(".action-btn");
      if (result.liked) {
        btn.classList.add("liked");
        btn.innerHTML = `❤️ <span id="likes-${postId}">${result.likes}</span>`;
      } else {
        btn.classList.remove("liked");
        btn.innerHTML = `🤍 <span id="likes-${postId}">${result.likes}</span>`;
      }
    }
  } catch (error) {
    console.error("Error toggling like:", error);
  }
}

// =====================================================
//  COMMENTS
// =====================================================

async function toggleComments(postId) {
  const commentsSection = document.getElementById(`comments-${postId}`);

  if (!commentsSection) {
    console.error("Comments section not found for post:", postId);
    return;
  }

  if (commentsSection.style.display === "none") {
    commentsSection.style.display = "block";
    await loadComments(postId);
  } else {
    commentsSection.style.display = "none";
  }
}

async function loadComments(postId) {
  try {
    const commentsList = document.getElementById(`comments-list-${postId}`);

    if (!commentsList) {
      console.error("Comments list element not found");
      return;
    }

    commentsList.innerHTML =
      '<div style="text-align:center;color:#8b8d91;padding:10px;">Loading comments...</div>';

    const comments = await fetchAPI(`/api/posts/${postId}/comments`);

    if (!comments || comments.length === 0) {
      commentsList.innerHTML =
        '<div style="text-align:center;color:#8b8d91;padding:10px;">No comments yet. Be the first to comment!</div>';
      return;
    }

    commentsList.innerHTML = comments
      .map((comment) => {
        const author = comment.author || {};
        const commentId = comment._id || comment.id;
        const commentText = comment.text || comment.content || "";
        const avatar = author.avatarUrl
          ? `<img src="${author.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
          : "👤";

        const isMyComment =
          currentUser &&
          (currentUser.id === author.id ||
            currentUser._id === author._id ||
            currentUser.id === author._id);

        return `
          <div class="comment-item" data-comment-id="${commentId}" style="display:flex;gap:10px;padding:12px;background:#18191a;border-radius:8px;transition:all 0.3s ease;">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:16px;overflow:hidden;flex-shrink:0;">
              ${avatar}
            </div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
                <div>
                  <span style="font-weight:600;color:#e4e6eb;font-size:14px;">${
                    author.displayName || author.username || "Unknown"
                  }</span>
                  <span style="color:#8b8d91;font-size:12px;margin-left:8px;">@${
                    author.username || "unknown"
                  }</span>
                </div>
                ${
                  isMyComment
                    ? `
                  <button 
                    onclick="deleteComment('${commentId}', '${postId}')" 
                    style="background:none;border:none;color:#ff7979;cursor:pointer;font-size:18px;padding:4px 8px;"
                    title="Delete comment">
                    🗑️
                  </button>
                `
                    : ""
                }
              </div>
              <div style="color:#e4e6eb;font-size:14px;margin-bottom:5px;">${commentText}</div>
              <div style="color:#8b8d91;font-size:12px;">${formatTimestamp(
                comment.createdAt
              )}</div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading comments:", error);
    const commentsList = document.getElementById(`comments-list-${postId}`);
    if (commentsList) {
      commentsList.innerHTML =
        '<div style="text-align:center;color:#ff7979;padding:10px;">Failed to load comments</div>';
    }
  }
}

async function addComment(postId) {
  try {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();

    if (!text) {
      alert("Please write a comment");
      return;
    }

    input.disabled = true;

    const result = await fetchAPI(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });

    console.log("✅ Comment added:", result);

    input.value = "";
    input.disabled = false;

    const countElement = document.getElementById(`comments-count-${postId}`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent) || 0;
      countElement.textContent = currentCount + 1;
      console.log(
        `📊 Updated comment count from ${currentCount} to ${currentCount + 1}`
      );
    }

    await loadComments(postId);
  } catch (error) {
    console.error("❌ Error adding comment:", error);
    alert("Failed to add comment: " + (error.message || "Unknown error"));

    const input = document.getElementById(`comment-input-${postId}`);
    if (input) input.disabled = false;
  }
}

async function deleteComment(commentId, postId) {
  if (!confirm("Are you sure you want to delete this comment?")) {
    return;
  }

  try {
    const commentElement = document.querySelector(
      `[data-comment-id="${commentId}"]`
    );
    if (commentElement) {
      commentElement.style.opacity = "0.5";
      commentElement.style.pointerEvents = "none";
    }

    await fetchAPI(`/api/comments/${commentId}`, {
      method: "DELETE",
    });

    console.log("✅ Comment deleted successfully");

    const countElement = document.getElementById(`comments-count-${postId}`);
    if (countElement) {
      const currentCount = parseInt(countElement.textContent) || 0;
      const newCount = Math.max(0, currentCount - 1);
      countElement.textContent = newCount;
      console.log(`📊 Updated count from ${currentCount} to ${newCount}`);
    }

    if (commentElement) {
      commentElement.style.transition = "all 0.3s ease";
      commentElement.style.opacity = "0";
      commentElement.style.transform = "translateX(-20px)";

      setTimeout(() => {
        commentElement.remove();

        const commentsList = document.getElementById(`comments-list-${postId}`);
        if (commentsList && commentsList.children.length === 0) {
          commentsList.innerHTML =
            '<div style="text-align:center;color:#8b8d91;padding:10px;">No comments yet. Be the first to comment!</div>';
        }
      }, 300);
    }
  } catch (error) {
    console.error("❌ Error deleting comment:", error);

    const commentElement = document.querySelector(
      `[data-comment-id="${commentId}"]`
    );
    if (commentElement) {
      commentElement.style.opacity = "1";
      commentElement.style.pointerEvents = "auto";
    }

    alert("Failed to delete comment: " + (error.message || "Unknown error"));
  }
}

function handleCommentKeyPress(event, postId) {
  if (event.key === "Enter") {
    event.preventDefault();
    addComment(postId);
  }
}

// make comment helpers global
window.toggleComments = toggleComments;
window.loadComments = loadComments;
window.addComment = addComment;
window.deleteComment = deleteComment;
window.handleCommentKeyPress = handleCommentKeyPress;

console.log("✅ Comment functionality loaded");

// =====================================================
//  NOTIFICATIONS (CENTER + SIDEBAR BADGE)
// =====================================================

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

    // keep sidebar badge in sync
    updateSidebarMessagesBadge && updateSidebarMessagesBadge();
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

// sidebar unread badge + polling
const SIDEBAR_BADGE_ID = "sidebarMessagesBadge";
const NOTIF_COUNT_PATH = "/api/notifications/unread/count";

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

let _notifPoll = { timer: null, interval: 30000, attempts: 0 };

async function pollNotificationCountOnce() {
  try {
    const token = sessionStorage.getItem("token");
    if (!token) {
      showSidebarBadge(0);
      return;
    }

    const res = await fetchWithToken(NOTIF_COUNT_PATH, { method: "GET" });

    if (!res.ok) {
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
      console.warn("Unread-count: non-ok status", res.status);
      throw new Error("Non-ok status " + res.status);
    }

    const data = await res.json();
    showSidebarBadge(data.count || 0);

    _notifPoll.attempts = 0;
    _notifPoll.interval = 30000;
  } catch (err) {
    _notifPoll.attempts = (_notifPoll.attempts || 0) + 1;
    _notifPoll.interval = Math.min(
      300000,
      30000 * Math.pow(Math.min(_notifPoll.attempts - 1, 5), 2)
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
  if (_notifPoll.timer) return;
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

// =====================================================
//  SEARCH (USER SEARCH) + FOLLOW / UNFOLLOW
// =====================================================

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
              <div style="font-size:13px;color:#8b8d91;">@${user.username}</div>
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
  }
}

async function toggleFollow(userId) {
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
    btn.disabled = true;
    btn.textContent = "...";

    console.log(`${isFollowing ? "Unfollowing" : "Following"} user: ${userId}`);

    let result;

    if (isFollowing) {
      result = await fetchAPI(`/api/users/${userId}/follow`, {
        method: "DELETE",
      });
      console.log("Unfollow result:", result);
      btn.textContent = "Follow";
      btn.style.background = "#667eea";
    } else {
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
    btn.textContent = originalText;
    btn.style.background = originalBg;

    if (error.message) {
      alert(`Error: ${error.message}`);
    } else {
      alert("Failed to update follow status. Please try again.");
    }
  } finally {
    btn.disabled = false;
  }
}

// =====================================================
//  POST CREATION MODAL
// =====================================================

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

    console.log("Post created:", result);
    closePostModal();
    await loadFeed(true);
  } catch (error) {
    console.error("Error creating post:", error);
    alert("Failed to create post");
  }
}

// =====================================================
//  DESKTOP + IN-APP MESSAGE NOTIFICATIONS
// =====================================================

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
    if (!message || !message.sender) return;
    if (
      window.currentRecipient &&
      window.currentRecipient.id === message.sender.id
    ) {
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
    } catch (e) {}

    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      const n = new Notification(title, { body, icon });
      n.onclick = () => {
        window.focus();
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
      requestNotificationPermission();
    }
  } catch (err) {
    console.warn("Failed to show desktop notification", err);
  }
}

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

    toast
      .querySelector(".inapp-toast-reply")
      .addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (typeof onClick === "function") onClick();
        toast.remove();
      });

    toast
      .querySelector(".inapp-toast-dismiss")
      .addEventListener("click", (ev) => {
        ev.stopPropagation();
        toast.remove();
      });

    toast.addEventListener("click", () => {
      if (typeof onClick === "function") onClick();
      toast.remove();
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast && toast.parentNode) toast.remove();
    }, 10000);
  } catch (e) {
    console.warn("Could not show in-app toast", e);
  }
}

// =====================================================
//  SHARE MODAL (POST → DM)
// =====================================================

let shareSearchTimeout = null;
let shareTarget = null; // { id, text }

function openShareModal(postId, textToShare) {
  shareTarget = {
    id: postId,
    text: textToShare,
  };

  const modal = document.getElementById("shareModal");
  const input = document.getElementById("shareSearchInput");
  const results = document.getElementById("shareSearchResults");

  if (!modal || !input || !results) {
    console.error("Share modal elements not found!");
    return;
  }

  modal.classList.remove("hidden");
  input.value = "";
  results.innerHTML = "";

  setTimeout(() => input.focus(), 100);
}

function closeShareModal() {
  const modal = document.getElementById("shareModal");
  if (modal) {
    modal.classList.add("hidden");
  }

  shareTarget = null;

  const results = document.getElementById("shareSearchResults");
  if (results) results.innerHTML = "";

  const input = document.getElementById("shareSearchInput");
  if (input) input.value = "";
}

async function searchUsersForShare() {
  const input = document.getElementById("shareSearchInput");
  const resultsContainer = document.getElementById("shareSearchResults");

  if (!input || !resultsContainer) return;

  const query = input.value.trim();

  clearTimeout(shareSearchTimeout);

  if (query.length < 2) {
    resultsContainer.innerHTML = "";
    return;
  }

  shareSearchTimeout = setTimeout(async () => {
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
        .map((user) => {
          const safeUserId = String(user.id).replace(/'/g, "\\'");
          const safeUsername = String(user.username || "unknown").replace(
            /'/g,
            "\\'"
          );
          const safeDisplayName = escapeHtml(
            user.displayName || user.username || "Unknown"
          );
          const safeAvatarUrl = user.avatarUrl
            ? String(user.avatarUrl).replace(/'/g, "\\'")
            : "";

          return `
            <div class="share-result-item" style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #2f3336;cursor:pointer;transition:0.2s;">
              <div class="share-result-avatar" style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;font-size:24px;overflow:hidden;flex-shrink:0;">
                ${
                  safeAvatarUrl
                    ? `<img src="${safeAvatarUrl}" style="width:100%;height:100%;object-fit:cover;">`
                    : "👤"
                }
              </div>
              <div class="share-result-info" style="flex:1;">
                <div class="share-result-name" style="font-weight:600;color:#e4e6eb;font-size:14px;">
                  ${safeDisplayName}
                </div>
                <div class="share-result-username" style="color:#8b8d91;font-size:13px;">
                  @${escapeHtml(user.username || "unknown")}
                </div>
              </div>
              <button
                class="share-result-send-btn"
                onclick="shareMessageToUser('${safeUserId}', '${safeUsername}')"
                style="padding:8px 16px;background:#667eea;color:white;border:none;border-radius:20px;cursor:pointer;font-weight:600;font-size:13px;transition:0.2s;"
                onmouseover="this.style.background='#5568d3'"
                onmouseout="this.style.background='#667eea'"
              >
                Send
              </button>
            </div>
          `;
        })
        .join("");
    } catch (error) {
      console.error("Search error (share):", error);
      resultsContainer.innerHTML =
        '<div style="padding:20px;text-align:center;color:#ff7979;">Search failed</div>';
    }
  }, 300);
}

async function shareMessageToUser(recipientId, username) {
  if (!shareTarget) {
    alert("Nothing to share!");
    return;
  }

  if (!socket || !socket.connected) {
    alert("Not connected to chat. Please refresh the page.");
    return;
  }

  try {
    const textToSend =
      shareTarget.text && shareTarget.text.length
        ? `📤 Shared: "${shareTarget.text.substring(0, 100)}${
            shareTarget.text.length > 100 ? "..." : ""
          }"`
        : `📤 Shared a post with you.`;

    const modal = document.getElementById("shareModal");
    if (modal) {
      modal.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#8b8d91;">Sending...</div>';
    }

    socket.emit("send_message", {
      recipientId,
      text: textToSend,
      sharedPostId: shareTarget.id,
    });

    try {
      await fetchAPI("/api/notifications", {
        method: "POST",
        body: JSON.stringify({
          user: recipientId,
          actor: currentUser?.id || currentUser?._id,
          verb: "system",
          targetType: "Post",
          targetId: shareTarget.id,
          read: false,
        }),
      });
    } catch (notifErr) {
      console.warn("Could not create notification:", notifErr);
    }

    if (modal) {
      modal.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:#00d084;font-weight:600;">✓ Shared! Opening messages...</div>';
    }

    setTimeout(() => {
      closeShareModal();
      window.location.href = `/messages.html?to=${encodeURIComponent(
        username
      )}`;
    }, 800);

    console.log(`✅ Shared post ${shareTarget.id} to @${username}`);
  } catch (error) {
    console.error("❌ Error sharing:", error);
    alert(`Failed to share: ${error.message || "Unknown error"}`);
    closeShareModal();
  }
}

// expose share helpers
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.searchUsersForShare = searchUsersForShare;
window.shareMessageToUser = shareMessageToUser;

console.log("✅ Share modal functionality loaded");

// =====================================================
//  VIEW SWITCHING (FEED / NOTIFICATIONS)
// =====================================================

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

  const bar = document.getElementById("globalChatInput");
  if (bar) bar.style.display = "flex";
}

// =====================================================
//  LOGOUT
// =====================================================

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

  sessionStorage.removeItem("token");
  window.location.href = "/login.html";
}

// =====================================================
//  GLOBAL MODAL CLICK HANDLER
// =====================================================

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("active");
  }
});

// =====================================================
//  INIT + DOMCONTENTLOADED
// =====================================================

async function init() {
  console.log("✅ init() called!");
  try {
    await loadUserData();
    await loadFeed(true);
    await checkNotifications();

    // Initialize Socket.IO (defined elsewhere)
    initSocket && initSocket();

    // central notification polling
    setInterval(checkNotifications, 30000);

    // sidebar badge periodic update (simple)
    console.log("🚀 Page loaded - updating badges...");
    updateSidebarMessagesBadge && updateSidebarMessagesBadge();
    setInterval(
      () => updateSidebarMessagesBadge && updateSidebarMessagesBadge(),
      30000
    );

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

// Single DOMContentLoaded hook for everything
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 DOMContentLoaded fired, calling init()...");
  init();

  // immediate sidebar badge & resilient polling
  pollNotificationCountOnce().catch(() => {});
  startNotificationsPolling();
});

console.log("✅ Script loaded successfully");
