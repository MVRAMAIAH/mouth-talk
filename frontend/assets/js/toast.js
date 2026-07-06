/**
 * MTALK Global Toast System
 * Replaces all native alert() calls with premium toast notifications.
 * Usage: mtToast('Message', 'success' | 'error' | 'warning' | 'info')
 */
(function () {
    // Create container on first load
    let container = null;

    function ensureContainer() {
        if (container && document.body.contains(container)) return container;
        container = document.createElement('div');
        container.className = 'mt-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('role', 'status');
        document.body.appendChild(container);
        return container;
    }

    const ICONS = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - 'success' | 'error' | 'warning' | 'info'
     * @param {number} duration - Auto-dismiss in ms (default 3000)
     */
    window.mtToast = function (message, type = 'info', duration = 3000) {
        const c = ensureContainer();

        const toast = document.createElement('div');
        toast.className = 'mt-toast ' + type;
        toast.innerHTML = `
            <span class="mt-toast-icon">${ICONS[type] || ICONS.info}</span>
            <span>${message}</span>
            <div class="mt-toast-progress" style="animation-duration: ${duration}ms"></div>
        `;

        c.appendChild(toast);

        // Auto-dismiss
        const timer = setTimeout(() => {
            toast.classList.add('exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);

        // Click to dismiss early
        toast.addEventListener('click', () => {
            clearTimeout(timer);
            toast.classList.add('exit');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        });
    };

    // Override native alert to use toast
    window._originalAlert = window.alert;
    window.alert = function (msg) {
        window.mtToast(msg, 'info');
    };
})();
