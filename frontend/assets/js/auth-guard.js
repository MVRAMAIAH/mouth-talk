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
                throw new Error('Not logged in');
            }
            return res.json();
        })
        .then(function (user) {
            if (!user) {
                window.location.href = loginPath;
                return;
            }
            // If user hasn't completed onboarding, redirect them
            if (!user.onboardingComplete) {
                window.location.href = onboardingPath;
                return;
            }
            // Auth OK — show the page
            document.documentElement.style.visibility = 'visible';
        })
        .catch(function (err) {
            console.error('Auth Guard Error:', err);
            // If it's a real auth failure, redirect. 
            // If it's a network error, we might still want to show the page (degraded mode)
            // but for now, we enforce login.
            window.location.href = loginPath;
        });

    // Safety timeout: if auth takes too long (e.g. backend hanging), show the page anyway
    // to prevent a permanent white screen, though the user won't be able to do much.
    setTimeout(function () {
        if (document.documentElement.style.visibility === 'hidden') {
            console.warn('Auth guard timeout — forcing visibility');
            document.documentElement.style.visibility = 'visible';
        }
    }, 3000);
})();
