/* nav-search.js */
(function() {
    let searchTimeout = null;

    function initSearch() {
        // 1. Inject HTML into the navbar
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks) return;

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
                <!-- Results akan dirender di sini -->
            </div>
        `;

        // 2. Add search logic to navbar
        // Insert search container BEFORE the first nav link
        navLinks.insertBefore(searchContainer, navLinks.firstChild);

        const toggleBtn = document.getElementById('searchToggleBtn');
        const inputWrapper = document.getElementById('searchInputWrapper');
        const input = document.getElementById('navSearchInput');
        const dropdown = document.getElementById('searchResultsDropdown');

        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            inputWrapper.classList.toggle('active');
            if (inputWrapper.classList.contains('active')) {
                input.focus();
            } else {
                dropdown.classList.remove('active');
            }
        };

        input.oninput = (e) => {
            const query = e.target.value.trim();
            if (query.length < 2) {
                dropdown.classList.remove('active');
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
                inputWrapper.classList.remove('active');
                dropdown.classList.remove('active');
            }
        };

        dropdown.onclick = (e) => e.stopPropagation();
    }

    async function performSearch(query) {
        const dropdown = document.getElementById('searchResultsDropdown');
        dropdown.innerHTML = `
            <div class="search-loading">
                <div class="spinner"></div>
                Searching for "${esc(query)}"...
            </div>
        `;
        dropdown.classList.add('active');

        try {
            const res = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`);
            if (!res.ok) throw new Error('Search failed');

            const users = await res.json();

            if (users.length === 0) {
                dropdown.innerHTML = `<div class="search-no-results">No users found for "${esc(query)}"</div>`;
                return;
            }

            dropdown.innerHTML = users.map(u => `
                <div class="search-result-item" onclick="window.location.href='/pages/user-details.html?id=${u.uid}'">
                    <img class="search-result-avatar" src="${u.picture || 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Icon-round-Question_mark.svg/768px-Icon-round-Question_mark.svg.png'}" alt="">
                    <div class="search-result-info">
                        <div class="search-result-name">${esc(u.username)}</div>
                        ${u.badge ? `<div class="search-result-badge">${u.badge}</div>` : ''}
                    </div>
                </div>
            `).join('');

        } catch (err) {
            console.error(err);
            dropdown.innerHTML = `<div class="search-no-results" style="color:#ff073a">Error searching users.</div>`;
        }
    }

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSearch);
    } else {
        initSearch();
    }
})();
