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

// Close menu when a nav link is clicked
document.addEventListener('click', function (e) {
    if (e.target.closest('.site-nav a') || e.target.closest('.site-nav button:not(.hamburger-btn)')) {
        _getNavRefs();
        if (_navLinks && _hamburgerBtn && window.innerWidth <= 768) {
            _navLinks.classList.remove('active');
            _hamburgerBtn.textContent = '☰';
        }
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
