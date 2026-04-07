/* 
  Mouth-Talk Beast-Mode Navigation 
  Dynamically injects the premium bottom navigation for mobile users.
*/

(function() {
    function initBeastNav() {
        // Find Nav Links (Mobile Hamburger Menu)
        const navLinks = document.querySelector('.header .nav-links');
        if (!navLinks) return;

        // The ALERTS button integration has been removed as requested.
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBeastNav);
    } else {
        initBeastNav();
    }
})();
