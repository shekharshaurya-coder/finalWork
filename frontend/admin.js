const API_BASE = '/api';

// Check admin access on page load
document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAdminAccess();
    if (!isAdmin) {
        window.location.href = 'login.html';
        return;
    }
    loadAdminInfo();
    loadOverview();
});

async function checkAdminAccess() {
    try {
        let token = sessionStorage.getItem('token');
        if (!token) return false;
        
        token = token.replace(/^"(.*)"$/, '$1').trim();
        const res = await fetch('/api/admin/info', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return res.ok;
    } catch (error) {
        console.error('Admin check error:', error);
        return false;
    }
}

async function apiFetch(path, opts = {}) {
    let token = sessionStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        throw new Error('No token');
    }

    token = token.replace(/^"(.*)"$/, '$1').trim();

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...opts.headers
    };

    const res = await fetch(API_BASE + path, {
        ...opts,
        headers
    });

    if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('token');
        window.location.href = 'login.html';
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || res.statusText);
    }

    return res.json();
}

function showSection(section) {
    // hide all sections
    document.querySelectorAll('.content-section').forEach(el => el.classList.remove('active'));

    // clear nav active state
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    // show requested section
    const sectionEl = document.getElementById(section + '-section');
    if (sectionEl) sectionEl.classList.add('active');

    // try to mark the clicked nav button as active. event may be undefined when called from inline handlers,
    // so find the nav button by its onclick attribute or by data-section attribute.
    let activated = false;
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        const dataSection = btn.dataset.section || '';
        if (onclick.includes(`showSection('${section}')`) || dataSection === section) {
            btn.classList.add('active');
            activated = true;
        }
    });

    // fallback: if no nav button matched, try to add active to the first button
    if (!activated) {
        const firstBtn = document.querySelector('.nav-btn');
        if (firstBtn) firstBtn.classList.add('active');
    }

    // Load data for section
    if (section === 'overview') loadOverview();
    if (section === 'logs') searchLogs();
    if (section === 'users') loadUsers();
    if (section === 'analytics') loadAnalytics();
    if (section === 'kibana') initKibana();   // 🔥 added
}

// 🔗 Change this URL after you create & share your dashboard in Kibana
const KIBANA_DASHBOARD_URL =
  "http://localhost:5601/app/dashboards#/view/<your-dashboard-id>?embed=true&_g=(time:(from:now-24h,to:now))";

function initKibana() {
    const frame = document.getElementById("kibanaFrame");
    if (!frame) return;

    // only set src once, so switching tabs doesn't keep reloading Kibana
    if (!frame.src || frame.src === "about:blank") {
        frame.src = KIBANA_DASHBOARD_URL;
    }
}

function refreshKibana() {
    const frame = document.getElementById("kibanaFrame");
    if (frame && frame.contentWindow) {
        frame.contentWindow.location.reload();
    }
}

async function loadAdminInfo() {
    try {
        const data = await apiFetch('/admin/info');
        document.getElementById('adminUsername').textContent = data.username || 'Admin';
    } catch (error) {
        console.error('Failed to load admin info:', error);
    }
}

async function loadOverview() {
    try {
        const data = await apiFetch('/admin/stats');
        
        document.getElementById('totalUsers').textContent = data.totalUsers || 0;
        document.getElementById('activeToday').textContent = data.totalLogins || 0;
        document.getElementById('totalPosts').textContent = data.totalPosts || 0;
        document.getElementById('postsToday').textContent = data.postsToday || 0;
        document.getElementById('totalEngagement').textContent = data.totalEngagement || 0;
        document.getElementById('highPriorityEvents').textContent = data.highPriorityEvents || 0;

        displayActivitySummary(data.topEvents || []);
        hideError('overviewError');
    } catch (error) {
        showError('overviewError', error.message);
    }
}

function displayActivitySummary(events) {
    const tbody = document.getElementById('activitySummary');

    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">No activity data</td></tr>';
        return;
    }

    tbody.innerHTML = events.slice(0, 5).map(event => `
        <tr>
            <td><span class="event-badge">${event.eventType}</span></td>
            <td>${event.count}</td>
            <td>📈</td>
        </tr>
    `).join('');
}

async function searchLogs() {
    try {
        const eventType = document.getElementById('eventTypeFilter').value;
        const username = document.getElementById('usernameFilter').value;

        const params = new URLSearchParams();
        if (eventType) params.append('eventType', eventType);
        if (username) params.append('username', username);

        const data = await apiFetch(`/admin/logs?${params}`);
        displayLogs(data.logs || []);
        hideError('logsError');
    } catch (error) {
        console.error('Search error:', error);
        showError('logsError', error.message);
    }
}

function displayLogs(logs) {
    const tbody = document.getElementById('logsTableBody');
    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No logs found</td></tr>';
        return;
    }

    const eventIcons = {
        'LOGIN': '🔐',
        'SIGNUP': '✨',
        'POST_CREATED': '📝',
        'COMMENT_ADDED': '💬',
        'LIKE_ADDED': '❤️',
        'USER_FOLLOWS': '👥',
        'SOMEONE_FOLLOWS_YOU': '⭐',
        'MESSAGE_SENT': '💌',
        'PROFILE_UPDATED': '✏️'
    };

    tbody.innerHTML = logs.map(log => {
        const icon = eventIcons[log.eventType] || '📌';
        const priorityClass = log.priority === 'high' ? 'high' : log.priority === 'medium' ? 'medium' : '';
        
        return `
        <tr>
            <td><span class="event-badge ${priorityClass}">${icon} ${log.eventType}</span></td>
            <td>${log.username || '-'}</td>
            <td>${log.description || '-'}</td>
            <td>${formatDetails(log)}</td>
            <td><span class="timestamp">${formatTime(log.timestamp)}</span></td>
        </tr>
        `;
    }).join('');
}

function formatDetails(log) {
    const details = [];
    if (log.metadata?.device) details.push(`Device: ${log.metadata.device.substring(0, 20)}...`);
    if (log.metadata?.ip) details.push(`IP: ${log.metadata.ip}`);
    if (log.metadata?.postId) details.push(`Post: ${log.metadata.postId}`);
    return details.join(' | ') || '-';
}

function formatTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { 
        month: 'short',
        day: 'numeric',
        hour: '2-digit', 
        minute: '2-digit'
    });
}

async function loadUsers() {
    try {
        const data = await apiFetch('/admin/users');
        displayUsers(data.users || []);
        hideError('usersError');
    } catch (error) {
        showError('usersError', error.message);
    }
}

function displayUsers(users) {
    const grid = document.getElementById('usersGrid');

    if (!users || users.length === 0) {
        grid.innerHTML = '<div class="no-data">No users found</div>';
        return;
    }

    grid.innerHTML = users.map(user => `
        <div class="user-card">
            <div class="name">${user.displayName || user.username}</div>
            <div class="username">@${user.username}</div>
            <div class="stats">
                <div class="stat-item">
                    <div class="value">${user.followersCount || 0}</div>
                    <div class="label">Followers</div>
                </div>
                <div class="stat-item">
                    <div class="value">${user.followingCount || 0}</div>
                    <div class="label">Following</div>
                </div>
                <div class="stat-item">
                    <div class="value">${user.postsCount || 0}</div>
                    <div class="label">Posts</div>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadAnalytics() {
    try {
        const data = await apiFetch('/admin/stats');
        displayTopEvents(data.topEvents || []);
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

function displayTopEvents(events) {
    const tbody = document.getElementById('topEventsBody');

    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-data">No events</td></tr>';
        return;
    }

    const total = events.reduce((sum, e) => sum + e.count, 0);

    tbody.innerHTML = events.map(event => `
        <tr>
            <td>${event.eventType}</td>
            <td>${event.count}</td>
            <td>${((event.count / total) * 100).toFixed(2)}%</td>
        </tr>
    `).join('');
}

//function refreshKibana() {
  //  const frame = document.getElementById('kibanaFrame');
    //frame.src = frame.src;
//}

function logout() {
    if (confirm('Logout from admin panel?')) {
        sessionStorage.removeItem('token');
        window.location.href = 'login.html';
    }
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    el.textContent = `Error: ${message}`;
    el.style.display = 'block';
}

function hideError(elementId) {
    document.getElementById(elementId).style.display = 'none';
}
//loading kibana 

function initKibana() {
  const frame = document.getElementById("kibanaFrame");
  if (frame && frame.src === "about:blank") {
    frame.src = KIBANA_DASHBOARD_URL;
  }
}

function refreshKibana() {
  const frame = document.getElementById("kibanaFrame");
  if (frame) {
    // simple reload
    frame.contentWindow.location.reload();
  }
}
