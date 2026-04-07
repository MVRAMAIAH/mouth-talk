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
                    <span class="icon"><i class="fas fa-home"></i></span>
                    <span>HOME</span>
                </a>
                <a href="/pages/get-started.html" class="nav-item ${isActive('/pages/get-started.html')}" id="navExplore">
                    <span class="icon"><i class="fas fa-compass"></i></span>
                    <span>EXPLORE</span>
                </a>
                <div class="nav-item" id="navNotifMobile" style="cursor:pointer;">
                    <span class="icon"><i class="fas fa-bell"></i></span>
                    <span id="mobileBadge" class="notification-badge" style="display:none; position:absolute; top:8px; right:22%; font-size:9px; font-weight:bold; width:16px; height:16px; background:#FF073A; border-radius:50%; color:white; justify-content:center; align-items:center; border: 1px solid black; box-shadow: 0 0 10px rgba(255, 7, 58, 0.5);">0</span>
                    <span>ALERTS</span>
                </div>
                <a href="/pages/profile.html" class="nav-item ${isActive('/pages/profile.html')}" id="navProfile">
                    <span class="icon"><i class="fas fa-user-circle"></i></span>
                    <span>PROFILE</span>
                </a>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', navHtml);

        // Link Mobile Alerts to the header notification bell
        const mobileNotifBtn = document.getElementById('navNotifMobile');
        mobileNotifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bell = document.getElementById('notifBtn');
            const dropdown = document.getElementById('notifDropdown');
            if (bell) {
                bell.click();
            } else if (dropdown) {
                // Fallback direct toggle
                const isActive = dropdown.classList.toggle('active');
                if (isActive && typeof window.fetchNotifications === 'function') {
                    window.fetchNotifications();
                }
            } else {
                window.location.href = '/pages/profile.html';
            }
        });

        // Sync Badge with the main notification badge
        function syncBadge() {
            const mainBadge = document.getElementById('notifBadge');
            const mobileBadge = document.getElementById('mobileBadge');
            const menuBadge = document.getElementById('menuBadgeMobile');
            
            if (mainBadge) {
                const count = mainBadge.textContent;
                
                if (mobileBadge) {
                    mobileBadge.textContent = count;
                    mobileBadge.style.display = (count !== '0' && count !== '') ? 'flex' : 'none';
                }
                
                if (menuBadge) {
                    menuBadge.textContent = count;
                    menuBadge.style.display = (count !== '0' && count !== '') ? 'inline-flex' : 'none';
                }
            }
        }

        // Add Notification Link to the mobile burger menu if present
        function injectMenuLink() {
            const navLinks = document.querySelector('.header .nav-links');
            if (navLinks && !document.getElementById('menuNotifMobile')) {
                const notifLink = `
                    <a href="#" id="menuNotifMobile" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-bell" style="color: #FF073A;"></i>
                        ALERTS 
                        <span id="menuBadgeMobile" style="background:#FF073A; color:white; font-size:9px; font-weight:bold; padding: 2px 6px; border-radius:10px; display:none;">0</span>
                    </a>
                `;
                navLinks.insertAdjacentHTML('afterbegin', notifLink);
                
                document.getElementById('menuNotifMobile').addEventListener('click', (e) => {
                    e.preventDefault();
                    mobileNotifBtn.click();
                    // Close menu after click
                    navLinks.classList.remove('active');
                });
            }
        }

        injectMenuLink();
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
