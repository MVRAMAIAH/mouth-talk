/**
 * Interactive Heading Engine
 * Handles split-text injection and neighbor-aware scaling logic.
 */

(function () {
    function initInteractiveHeading() {
        const headings = document.querySelectorAll('.heading-interactive-trigger');

        headings.forEach(container => {
            const text = container.getAttribute('data-text') || container.textContent.trim();
            container.innerHTML = ''; // Clear existing

            // Split text into letters, preserving spaces
            const letters = text.split('').map((char, i) => {
                const span = document.createElement('span');
                span.style.setProperty('--delay', `${i * 0.15}s`); // For floating animation offset

                if (char === ' ') {
                    span.innerHTML = '&nbsp;';
                    span.className = 'interactive-letter space';
                } else {
                    span.textContent = char;
                    span.className = 'interactive-letter';
                    span.setAttribute('data-letter', char);

                    // Staggered Premium Entry
                    span.style.opacity = '0';
                    span.style.transform = 'translateY(15px) scale(0.8)';
                    setTimeout(() => {
                        span.style.transition = 'all 0.8s cubic-bezier(0.2, 1, 0.3, 1)';
                        span.style.opacity = '1';
                        span.style.transform = 'translateY(0) scale(1)';

                        // Detach entry transition after finish to not interfere with hover
                        setTimeout(() => {
                            span.style.transition = '';
                        }, 800);
                    }, i * 60);
                }
                container.appendChild(span);
                return span;
            });

            // Interaction Logic
            container.addEventListener('mousemove', (e) => {
                const rect = container.getBoundingClientRect();

                letters.forEach((span, index) => {
                    if (span.classList.contains('space')) return;

                    const spanRect = span.getBoundingClientRect();
                    const spanCenter = spanRect.left + spanRect.width / 2;

                    // Calculate distance from cursor to letter center
                    const distance = Math.abs(e.clientX - spanCenter);

                    // Tighter range for premium control
                    const maxDistance = 110;

                    if (distance < maxDistance) {
                        const proximity = 1 - (distance / maxDistance);

                        // Cubic out easing for high-end feel
                        const easeOutCubic = 1 - Math.pow(1 - proximity, 3);
                        const scale = 1 + (easeOutCubic * 0.5);

                        span.style.transform = `scale(${scale})`;

                        if (proximity > 0.85) {
                            span.classList.add('active');
                        } else {
                            span.classList.remove('active');
                        }
                    } else {
                        span.style.transform = '';
                        span.classList.remove('active');
                    }
                });
            });

            // Reset on leave
            container.addEventListener('mouseleave', () => {
                letters.forEach(span => {
                    span.style.transform = 'scale(1)';
                    span.style.color = 'rgba(255, 255, 255, 0.2)';
                    span.classList.remove('active');
                });
            });
        });
    }

    // Run on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInteractiveHeading);
    } else {
        initInteractiveHeading();
    }
})();
