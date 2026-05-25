/**
 * Interactive Heading Engine
 * Handles split-text injection and neighbor-aware scaling logic.
 * PERF: Batched entry animations, cached space checks, optimized mousemove
 */

(function () {
    function initInteractiveHeading() {
        const headings = document.querySelectorAll('.heading-interactive-trigger');

        headings.forEach(container => {
            const text = container.getAttribute('data-text') || container.textContent.trim();
            container.innerHTML = ''; // Clear existing

            // Split text into letters, preserving spaces
            // PERF: Cache isSpace flag during init to avoid classList check during mousemove
            const letters = [];
            const chars = text.split('');
            const fragment = document.createDocumentFragment();

            chars.forEach((char, i) => {
                const span = document.createElement('span');
                span.style.setProperty('--delay', `${i * 0.15}s`);

                let isSpace = false;
                if (char === ' ') {
                    span.innerHTML = '&nbsp;';
                    span.className = 'interactive-letter space';
                    isSpace = true;
                } else {
                    span.textContent = char;
                    span.className = 'interactive-letter';
                    span.setAttribute('data-letter', char);

                    // PERF: Staggered entry via single rAF loop instead of N individual setTimeouts
                    span.style.opacity = '0';
                    span.style.transform = 'translateY(15px) scale(0.8)';
                }
                fragment.appendChild(span);
                letters.push({ el: span, isSpace: isSpace });
            });

            container.appendChild(fragment);

            // PERF: Single rAF-based stagger loop for entry animation
            // Replaces N individual setTimeout calls that each trigger separate paint
            const entryStartTime = performance.now();
            const STAGGER_MS = 60;
            const TRANSITION_MS = 800;
            let entryDone = false;

            function animateEntry(now) {
                let allDone = true;
                for (let i = 0; i < letters.length; i++) {
                    const data = letters[i];
                    if (data.isSpace) continue;

                    const triggerTime = entryStartTime + (i * STAGGER_MS);
                    if (now < triggerTime) {
                        allDone = false;
                        continue;
                    }

                    const elapsed = now - triggerTime;
                    if (elapsed < 1) {
                        // Just triggered — apply entry transition
                        data.el.style.transition = 'all 0.8s cubic-bezier(0.2, 1, 0.3, 1)';
                        data.el.style.opacity = '1';
                        data.el.style.transform = 'translateY(0) scale(1)';
                        allDone = false;
                    } else if (elapsed >= TRANSITION_MS && data.el.style.transition !== '') {
                        // Entry complete — detach transition so it doesn't interfere with hover
                        data.el.style.transition = '';
                    } else if (elapsed < TRANSITION_MS) {
                        allDone = false;
                    }
                }

                if (!allDone) {
                    requestAnimationFrame(animateEntry);
                } else {
                    entryDone = true;
                }
            }
            requestAnimationFrame(animateEntry);

            // Cache for letter centers and container rect to prevent layout thrashing
            let letterCenters = null;
            let containerRect = null;
            let rafId = null;

            function cacheCenters() {
                containerRect = container.getBoundingClientRect();
                letterCenters = new Float64Array(letters.length);
                for (let i = 0; i < letters.length; i++) {
                    if (letters[i].isSpace) {
                        letterCenters[i] = -1; // sentinel for space
                    } else {
                        const spanRect = letters[i].el.getBoundingClientRect();
                        letterCenters[i] = spanRect.left + spanRect.width / 2;
                    }
                }
            }

            container.addEventListener('mouseenter', () => {
                cacheCenters();
            });

            // PERF: Debounce resize cache refresh
            let resizeTimer = null;
            window.addEventListener('resize', () => {
                if (letterCenters) {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(cacheCenters, 150);
                }
            });

            // Interaction Logic
            container.addEventListener('mousemove', (e) => {
                if (!letterCenters) {
                    cacheCenters();
                }

                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    const clientX = e.clientX;
                    const maxDistance = 110;

                    for (let i = 0; i < letters.length; i++) {
                        // PERF: Use cached isSpace flag instead of classList.contains
                        if (letters[i].isSpace) continue;

                        const spanCenter = letterCenters[i];
                        if (spanCenter < 0) continue;

                        const span = letters[i].el;
                        const distance = Math.abs(clientX - spanCenter);

                        if (distance < maxDistance) {
                            const proximity = 1 - (distance / maxDistance);
                            const easeOutCubic = 1 - Math.pow(1 - proximity, 3);
                            const scale = 1 + (easeOutCubic * 0.5);

                            span.style.transform = `scale3d(${scale}, ${scale}, 1)`;

                            if (proximity > 0.85) {
                                span.classList.add('active');
                            } else {
                                span.classList.remove('active');
                            }
                        } else {
                            span.style.transform = '';
                            span.classList.remove('active');
                        }
                    }
                });
            });

            // Reset on leave
            container.addEventListener('mouseleave', () => {
                if (rafId) cancelAnimationFrame(rafId);
                letterCenters = null; // Clear cache to allow recalculation next time

                requestAnimationFrame(() => {
                    for (let i = 0; i < letters.length; i++) {
                        const span = letters[i].el;
                        span.style.transform = '';
                        span.style.color = 'rgba(255, 255, 255, 0.2)';
                        span.classList.remove('active');
                    }
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
