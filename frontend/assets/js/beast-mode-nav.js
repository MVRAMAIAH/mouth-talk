/* 
  Mouth-Talk Beast-Mode Navigation 
  Dynamically injects the premium bottom navigation for mobile users.
*/

(function() {
    function initBeastNav() {
        // Find Nav Links (Mobile Hamburger Menu)
        const navLinks = document.querySelector('.header .nav-links');
        if (!navLinks) return;

        // 1. Inject Notification Item to Menu if not exists
        if (!document.getElementById('menuNotifMobile')) {
            const notifItem = `
                <a href="#" id="menuNotifMobile" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                    <i class="fas fa-bell" style="color: #FF073A;"></i>
                    ALERTS
                    <span id="menuBadgeMobile" class="notification-badge" style="display:none; background:#FF073A; color:white; font-size:9px; font-weight:bold; padding: 2px 6px; border-radius:10px; min-width:18px; text-align:center;">0</span>
                </a>
            `;
            navLinks.insertAdjacentHTML('afterbegin', notifItem);

            // Trigger the main notification bell when clicked
            document.getElementById('menuNotifMobile').addEventListener('click', (e) => {
                e.preventDefault();
                const mainBtn = document.getElementById('notifBtn');
                if (mainBtn) {
                    mainBtn.click();
                    // Close the menu
                    navLinks.classList.remove('active');
                } else {
                    // Fallback toggle for dropdown directly
                    const dropdown = document.getElementById('notifDropdown');
                    if (dropdown) {
                        const isActive = dropdown.classList.toggle('active');
                        if (isActive && typeof window.fetchNotifications === 'function') {
                            window.fetchNotifications();
                        }
                        navLinks.classList.remove('active');
                    }
                }
            });
        }

        // 2. Sync Badge with the main notification system
        function syncBadge() {
            const mainBadge = document.getElementById('notifBadge');
            const menuBadge = document.getElementById('menuBadgeMobile');
            
            if (mainBadge && menuBadge) {
                const count = mainBadge.textContent;
                menuBadge.textContent = count;
                menuBadge.style.display = (count !== '0' && count !== '') ? 'inline-block' : 'none';
            }
        }

        setInterval(syncBadge, 1000);
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBeastNav);
    } else {
        initBeastNav();
    }
})();
