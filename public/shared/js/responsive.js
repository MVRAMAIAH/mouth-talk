/*
  MTALK Responsive Navigation
  Hamburger menu toggle for mobile screens.
*/

function toggleMenu() {
    const navLinks = document.querySelector('.header .nav-links');
    const btn = document.querySelector('.hamburger-btn');
    if (!navLinks || !btn) return;

    navLinks.classList.toggle('active');
    btn.textContent = navLinks.classList.contains('active') ? '✕' : '☰';
}

// Close menu when a nav link is clicked
document.addEventListener('click', function (e) {
    if (e.target.closest('.nav-links a') || e.target.closest('.nav-links button:not(.hamburger-btn)')) {
        const navLinks = document.querySelector('.header .nav-links');
        const btn = document.querySelector('.hamburger-btn');
        if (navLinks && btn && window.innerWidth <= 768) {
            navLinks.classList.remove('active');
            btn.textContent = '☰';
        }
    }
});

// Close menu on resize to desktop
window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
        const navLinks = document.querySelector('.header .nav-links');
        const btn = document.querySelector('.hamburger-btn');
        if (navLinks) navLinks.classList.remove('active');
        if (btn) btn.textContent = '☰';
    }
});
