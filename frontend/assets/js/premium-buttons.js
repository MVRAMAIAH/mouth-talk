/**
 * Global Premium Button Logic
 * Implements optimized magnetic pull effect for all .premium-btn elements with zero layout thrashing
 * PERF: passive mousemove listeners, cached rect
 */

(function () {
    function initMagneticButtons() {
        // Only select buttons that haven't been initialized yet to prevent duplicate bindings
        const buttons = document.querySelectorAll('.premium-btn:not([data-magnetic-init])');

        buttons.forEach(btn => {
            btn.setAttribute('data-magnetic-init', 'true');
            let rect = null;
            let rafId = null;

            // Cache bounding box on mouseenter to avoid calling getBoundingClientRect on every mousemove (no layout thrashing!)
            btn.addEventListener('mouseenter', () => {
                rect = btn.getBoundingClientRect();
            });

            // PERF: passive: true allows browser to optimize scroll handling alongside mousemove
            btn.addEventListener('mousemove', function (e) {
                if (!rect) {
                    rect = btn.getBoundingClientRect();
                }

                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                // Pull effect relative to button size
                const pullX = x * 0.35;
                const pullY = y * 0.35;

                // Debounce rendering to requestAnimationFrame for 60fps rendering aligned with the browser refresh rate
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    btn.style.transform = `translate3d(${pullX}px, ${pullY}px, 0) scale3d(1.05, 1.05, 1)`;
                });
            }, { passive: true });

            btn.addEventListener('mouseleave', function () {
                rect = null;
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    btn.style.transform = '';
                });
            });
        });
    }

    // Observer to handle dynamically added buttons (like admin modal)
    const observer = new MutationObserver((mutations) => {
        let hasNewButtons = false;
        for (let i = 0; i < mutations.length; i++) {
            const addedNodes = mutations[i].addedNodes;
            for (let j = 0; j < addedNodes.length; j++) {
                const node = addedNodes[j];
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList && node.classList.contains('premium-btn') && !node.hasAttribute('data-magnetic-init')) {
                        hasNewButtons = true;
                        break;
                    }
                    if (node.querySelector && node.querySelector('.premium-btn:not([data-magnetic-init])')) {
                        hasNewButtons = true;
                        break;
                    }
                }
            }
            if (hasNewButtons) break;
        }

        if (hasNewButtons) {
            initMagneticButtons();
        }
    });

    function start() {
        initMagneticButtons();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
