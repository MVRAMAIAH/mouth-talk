/**
 * Global Premium Button Logic
 * Implements magnetic pull effect for all .premium-btn elements
 */

(function () {
    function initMagneticButtons() {
        const buttons = document.querySelectorAll('.premium-btn');

        buttons.forEach(btn => {
            btn.addEventListener('mousemove', function (e) {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                // Pull effect relative to button size
                const pullX = x * 0.35;
                const pullY = y * 0.35;

                btn.style.transform = `translate(${pullX}px, ${pullY}px) scale(1.05)`;
            });

            btn.addEventListener('mouseleave', function () {
                btn.style.transform = '';
            });
        });
    }

    // Observer to handle dynamically added buttons (like admin modal)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                initMagneticButtons();
            }
        });
    });

    window.addEventListener('DOMContentLoaded', () => {
        initMagneticButtons();
        observer.observe(document.body, { childList: true, subtree: true });
    });
})();
