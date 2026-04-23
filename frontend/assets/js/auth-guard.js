// Auth Guard — refactored for Optimistic Rendering and high performance
(function () {
    const isLoginOrOnboarding = window.location.pathname.includes('login.html') || window.location.pathname.includes('onboarding.html');
    if (isLoginOrOnboarding) return;

    const isInPages = window.location.pathname.includes('/pages/');
    const loginPath = isInPages ? 'login.html' : 'pages/login.html';
    const onboardingPath = isInPages ? 'onboarding.html' : 'pages/onboarding.html';

    // 1. Check for cached user in sessionStorage
    const cachedUser = sessionStorage.getItem('mt_user');
    if (cachedUser) {
        try {
            window.__USER__ = JSON.parse(cachedUser);
            // Optimistically reveal the page immediately
            document.documentElement.style.visibility = 'visible';
            console.log('Auth Guard: Optimistic reveal from cache');
        } catch (e) {
            sessionStorage.removeItem('mt_user');
            document.documentElement.style.visibility = 'hidden';
        }
    } else {
        // No cache: hide and wait (classic mode, but only for the first load)
        document.documentElement.style.visibility = 'hidden';
    }

    // 2. Background Re-verification (Lite Mode)
    fetch('/api/auth/me?lite=true')
        .then(function (res) {
            if (!res.ok) throw new Error('Not logged in');
            return res.json();
        })
        .then(function (user) {
            if (!user) {
                sessionStorage.removeItem('mt_user');
                window.location.href = loginPath;
                return;
            }

            // Sync cache and global state
            sessionStorage.setItem('mt_user', JSON.stringify(user));
            window.__USER__ = user;

            if (!user.onboardingComplete) {
                window.location.href = onboardingPath;
                return;
            }

            // Ensure page is shown
            document.documentElement.style.visibility = 'visible';

            // Dispatch global event for other scripts to know auth is ready
            window.dispatchEvent(new CustomEvent('authReady', { detail: user }));
        })
        .catch(function (err) {
            console.error('Auth Guard Error:', err);
            sessionStorage.removeItem('mt_user');
            window.location.href = loginPath;
        });

    // Safety timeout
    setTimeout(function () {
        if (document.documentElement.style.visibility === 'hidden') {
            console.warn('Auth guard timeout — forcing visibility');
            document.documentElement.style.visibility = 'visible';
        }
    }, 2500);
})();
