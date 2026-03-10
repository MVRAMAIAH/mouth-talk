// Auth Guard — include this script on every page that requires login.
// It checks /api/auth/me and redirects to login.html if not authenticated.
// It also hides the page body until auth is confirmed to prevent content flash.
(function () {
    // Skip guard on login and onboarding pages to avoid redirect loop
    if (window.location.pathname.includes('login.html') || window.location.pathname.includes('onboarding.html')) return;

    // Hide body immediately to prevent content flash
    document.documentElement.style.visibility = 'hidden';

    // Determine correct login path based on whether we're in /pages/ or root
    var isInPages = window.location.pathname.includes('/pages/');
    var loginPath = isInPages ? 'login.html' : 'pages/login.html';

    var onboardingPath = isInPages ? 'onboarding.html' : 'pages/onboarding.html';

    fetch('/api/auth/me')
        .then(function (res) {
            if (!res.ok) {
                window.location.href = loginPath;
            } else {
                return res.json();
            }
        })
        .then(function (user) {
            if (!user) return;
            // If user hasn't completed onboarding, redirect them
            if (!user.onboardingComplete) {
                window.location.href = onboardingPath;
                return;
            }
            // Auth OK + onboarding done — show the page
            document.documentElement.style.visibility = 'visible';
        })
        .catch(function () {
            window.location.href = loginPath;
        });
})();
