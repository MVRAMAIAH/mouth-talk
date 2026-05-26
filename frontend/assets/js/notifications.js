/* notifications.js
   PERF: Cached DOM refs at init, reusable esc element, avoid redundant getElementById calls */
(function() {
    const NOTIF_POLL_INTERVAL = 60000; // Poll every 60 seconds

    // PERF: Reusable element for HTML escaping instead of creating a new one per call
    const _escDiv = document.createElement('div');
    function esc(str) {
        _escDiv.textContent = str || '';
        return _escDiv.innerHTML;
    }

    // PERF: Cached DOM references — avoids getElementById on every poll/render cycle
    let _btn, _dropdown, _markAll, _badge, _list;

    function initNotifications() {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;

        // Create Notification Wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'nav-notification-wrapper';
        wrapper.id = 'navNotifWrapper';
        wrapper.innerHTML = `
            <button class="notification-btn" id="notifBtn" title="Notifications">
                <span class="bell-icon">🔔</span>
                <span class="notification-badge" id="notifBadge">0</span>
            </button>
            <div class="notifications-dropdown" id="notifDropdown">
                <div class="notifications-header">
                    <h3>Notifications</h3>
                    <button class="mark-all-btn" id="markAllRead">Mark all as read</button>
                </div>
                <div class="notifications-list" id="notifList">
                    <div class="no-notifications">Loading...</div>
                </div>
            </div>
        `;

        // Prepend to nav-links (or adjust placement as needed)
        navLinks.insertBefore(wrapper, navLinks.firstChild);

        // PERF: Cache all DOM refs once at init
        _btn = document.getElementById('notifBtn');
        _dropdown = document.getElementById('notifDropdown');
        _markAll = document.getElementById('markAllRead');
        _badge = document.getElementById('notifBadge');
        _list = document.getElementById('notifList');

        _btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = _dropdown.classList.toggle('active');
            if (isActive) {
                fetchNotifications();
            }
        });

        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                _dropdown.classList.remove('active');
            }
        });

        _markAll.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await fetch('/api/notifications/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                updateUnreadCount();
                fetchNotifications();
            } catch (err) {
                console.error('Mark all read error:', err);
            }
        });

        // Initial Load
        updateUnreadCount();
        setInterval(updateUnreadCount, NOTIF_POLL_INTERVAL);
    }

    async function updateUnreadCount() {
        try {
            const res = await fetch('/api/notifications/unread-count');
            if (!res.ok) return;
            const { count } = await res.json();
            if (!_badge) return;
            if (count > 0) {
                _badge.textContent = count > 99 ? '99+' : count;
                _badge.classList.add('active');
            } else {
                _badge.classList.remove('active');
            }
        } catch (err) {
            // Ignore error for polling
        }
    }

    async function fetchNotifications() {
        if (!_list) return;
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('Fetch failed');
            const notifications = await res.json();

            if (notifications.length === 0) {
                _list.innerHTML = '<div class="no-notifications">No notifications yet.</div>';
                return;
            }

            // PERF: Build HTML string in one pass, assign once (single innerHTML write)
            _list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.isRead ? '' : 'unread'}" onclick="handleNotifClick('${n._id}', '${n.type}', '${n.referenceId}')">
                    <img class="notif-avatar" src="${n.senderAvatar || 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Icon-round-Question_mark.svg/768px-Icon-round-Question_mark.svg.png'}" alt="" loading="lazy" decoding="async">
                    <div class="notif-content">
                        <div class="notif-text"><span class="notif-sender">${esc(n.senderName)}</span> ${n.text}</div>
                        <div class="notif-time">${formatTime(n.createdAt)}</div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            _list.innerHTML = '<div class="no-notifications">Failed to load notifications.</div>';
        }
    }

    window.handleNotifClick = async (notifId, type, refId) => {
        try {
            // Mark as read
            await fetch('/api/notifications/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: notifId })
            });
            updateUnreadCount();

            // Navigate based on type
            if (type === 'follow') {
                window.location.href = `/pages/user-details.html?id=${refId}`;
            } else if (type === 'review_like' || type === 'comment_new' || type === 'comment_reply' || type === 'comment_like') {
                window.location.href = `/pages/user-details.html?id=${refId}`; // Fallback
            }
        } catch (err) {
            console.error('Handle notification error:', err);
        }
    };

    function formatTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHr / 24);

        if (diffSec < 60) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;
        if (diffDay < 7) return `${diffDay}d ago`;
        return date.toLocaleDateString();
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initNotifications();
            registerServiceWorker();
        });
    } else {
        initNotifications();
        registerServiceWorker();
    }

    async function registerServiceWorker() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js');
                console.log('SW Registered:', reg.scope);
                
                // If user is logged in, attempt to subscribe
                checkAndSubscribe(reg);
            } catch (err) {
                console.error('SW Registration failed:', err);
            }
        }
    }

    async function checkAndSubscribe(reg) {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) return; // Not logged in
            
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;

            const publicVapidKey = 'BK5otuuQHAJeflU6ObzqGX9h35G6G_JhYd8Uni2DQnekgpNV_mTt7uyxr03UiwE3thLei62ESEwOuR0zyMASq1U';
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
            });

            await fetch('/api/notifications/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription })
            });
            console.log('Push Subscribed');
        } catch (err) {
            console.error('Subscription error:', err);
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
})();
