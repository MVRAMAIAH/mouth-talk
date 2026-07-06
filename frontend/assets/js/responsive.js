/*
  MTALK Responsive Navigation
  Hamburger menu toggle for mobile screens.
  PERF: Debounced resize, cached DOM refs
*/

// PERF: Cache DOM refs once
let _navLinks = null;
let _hamburgerBtn = null;

function _getNavRefs() {
    if (!_navLinks) _navLinks = document.querySelector('.site-nav');
    if (!_hamburgerBtn) _hamburgerBtn = document.querySelector('.hamburger-btn');
}

function toggleMenu() {
    _getNavRefs();
    if (!_navLinks || !_hamburgerBtn) return;

    _navLinks.classList.toggle('active');
    _hamburgerBtn.textContent = _navLinks.classList.contains('active') ? '✕' : '☰';
}

// Close menu when a nav link is clicked, or when clicking outside
document.addEventListener('click', function (e) {
    _getNavRefs();
    if (!_navLinks || !_hamburgerBtn || window.innerWidth > 768) return;

    // Check if click was inside nav or hamburger
    const clickedInsideNav = e.target.closest('.site-nav');
    const clickedHamburger = e.target.closest('.hamburger-btn');
    const clickedNavLink = e.target.closest('.site-nav a') || e.target.closest('.site-nav button');

    // Close if clicked a link, or clicked outside both nav and hamburger
    if (clickedNavLink || (!clickedInsideNav && !clickedHamburger)) {
        _navLinks.classList.remove('active');
        _hamburgerBtn.textContent = '☰';
    }
});

// PERF: Debounced resize handler — prevents firing on every resize frame
let _resizeTimer = null;
window.addEventListener('resize', function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
        if (window.innerWidth > 768) {
            _getNavRefs();
            if (_navLinks) _navLinks.classList.remove('active');
            if (_hamburgerBtn) _hamburgerBtn.textContent = '☰';
        }
    }, 100);
});
