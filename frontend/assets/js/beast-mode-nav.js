/* 
  Mouth-Talk Beast-Mode Navigation 
  Dynamically injects the premium bottom navigation for mobile users.
*/

(function() {
    function initBeastNav() {
        // Prevent double injection
        if (document.getElementById('mobileBottomNav')) return;

        const navHtml = `
            <div class="mobile-bottom-nav" id="mobileBottomNav">
                <a href="/index.html" class="nav-item ${isActive('/')}" id="navHome">
                    <span class="icon">🏠</span>
                    <span>HOME</span>
                </a>
                <a href="/pages/review.html" class="nav-item ${isActive('/pages/review.html')}" id="navExplore">
                    <span class="icon">💎</span>
                    <span>EXPLORE</span>
                </a>
                <div class="nav-item" id="navNotifMobile" style="cursor:pointer;">
                    <span class="icon">🔔</span>
                    <span id="mobileBadge" class="notification-badge" style="display:none; position:absolute; top:10px; right:20%; font-size:9px; width:15px; height:15px; background:red; border-radius:50%; color:white; display:none; justify-content:center; align-items:center;">0</span>
                    <span>ALERTS</span>
                </div>
                <a href="/pages/profile.html" class="nav-item ${isActive('/pages/profile.html')}" id="navProfile">
                    <span class="icon">👤</span>
                    <span>PROFILE</span>
                </a>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', navHtml);

        // Link Mobile Alerts to the header notification bell
        const mobileNotifBtn = document.getElementById('navNotifMobile');
        mobileNotifBtn.addEventListener('click', () => {
            const bell = document.getElementById('notifBtn');
            if (bell) {
                bell.click();
            } else {
                // Fallback: If no bell in header, redirect to notifications page or show custom alert
                window.location.href = '/pages/profile.html';
            }
        });

        // Sync Badge with the main notification badge
        function syncBadge() {
            const mainBadge = document.getElementById('notifBadge');
            const mobileBadge = document.getElementById('mobileBadge');
            if (mainBadge && mobileBadge) {
                const count = mainBadge.textContent;
                mobileBadge.textContent = count;
                mobileBadge.style.display = (count !== '0' && count !== '') ? 'flex' : 'none';
            }
        }

        setInterval(syncBadge, 1000);
    }

    function isActive(path) {
        return window.location.pathname.endsWith(path) ? 'active' : '';
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBeastNav);
    } else {
        initBeastNav();
    }
})();
