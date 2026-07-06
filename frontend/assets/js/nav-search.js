/* nav-search.js
   PERF: Reusable esc element, cached DOM refs, lazy init */
(function() {
    let searchTimeout = null;

    // PERF: Reusable element for HTML escaping instead of creating new div per call
    const _escDiv = document.createElement('div');
    function esc(str) {
        _escDiv.textContent = str || '';
        return _escDiv.innerHTML;
    }

    // PERF: Cached DOM references
    let _toggleBtn, _inputWrapper, _input, _dropdown;

    function initSearch() {
        // 1. Inject HTML into the header bar (between logo and hamburger)
        const siteHeader = document.querySelector('.site-header');
        if (!siteHeader) return;

        // Create the search container
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <div class="search-input-wrapper" id="searchInputWrapper">
                <input type="text" class="nav-search-input" id="navSearchInput" placeholder="Search users...">
            </div>
            <button class="search-toggle-btn" id="searchToggleBtn" title="Search Users">
                🔍
            </button>
            <div class="search-results-dropdown" id="searchResultsDropdown">
                <!-- Results rendered here -->
            </div>
        `;

        // 2. Insert before the hamburger button (or before the nav if no hamburger)
        const hamburger = siteHeader.querySelector('.hamburger-btn');
        if (hamburger) {
            siteHeader.insertBefore(searchContainer, hamburger);
        } else {
            const nav = siteHeader.querySelector('.site-nav');
            if (nav) {
                siteHeader.insertBefore(searchContainer, nav);
            } else {
                siteHeader.appendChild(searchContainer);
            }
        }

        // PERF: Cache refs once at init
        _toggleBtn = document.getElementById('searchToggleBtn');
        _inputWrapper = document.getElementById('searchInputWrapper');
        _input = document.getElementById('navSearchInput');
        _dropdown = document.getElementById('searchResultsDropdown');

        _toggleBtn.onclick = (e) => {
            e.stopPropagation();
            _inputWrapper.classList.toggle('active');
            if (_inputWrapper.classList.contains('active')) {
                _input.focus();
            } else {
                _dropdown.classList.remove('active');
            }
        };

        _input.oninput = (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                _dropdown.classList.remove('active');
                return;
            }

            // Debounce
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(query);
            }, 300);
        };

        // Close on outside click
        document.onclick = (e) => {
            if (!searchContainer.contains(e.target)) {
                _inputWrapper.classList.remove('active');
                _dropdown.classList.remove('active');
            }
        };

        _dropdown.onclick = (e) => e.stopPropagation();
    }

    async function performSearch(query) {
        if (!_dropdown) return;
        _dropdown.innerHTML = `
            <div class="search-loading">
                <div class="spinner"></div>
                Searching for "${esc(query)}"...
            </div>
        `;
        _dropdown.classList.add('active');

        try {
            const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Search failed');

            const users = await res.json();

            if (users.length === 0) {
                _dropdown.innerHTML = `<div class="search-no-results">No users found for "${esc(query)}"</div>`;
                return;
            }

            // PERF: Single innerHTML assignment
            _dropdown.innerHTML = users.map(u => `
                <div class="search-result-item" onclick="window.location.href='/pages/user-details.html?id=${u.uid}'">
                    <img class="search-result-avatar" src="${u.picture || 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Icon-round-Question_mark.svg/768px-Icon-round-Question_mark.svg.png'}" alt="" loading="lazy" decoding="async">
                    <div class="search-result-info">
                        <div class="search-result-name">${esc(u.username)}</div>
                        ${u.badge ? `<div class="search-result-badge">${u.badge}</div>` : ''}
                    </div>
                </div>
            `).join('');

        } catch (err) {
            console.error(err);
            _dropdown.innerHTML = `<div class="search-no-results" style="color:#ff073a">Error searching users.</div>`;
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
})();
