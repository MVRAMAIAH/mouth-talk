/**
 * Shared Admin logic for Movie Management
 */

function injectAdminModal() {
    if (document.getElementById('movieModal')) return;

    const modalHTML = `
    <div id="movieModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">Add New Movie</h2>
                <span class="close-btn" onclick="closeModal()">&times;</span>
            </div>
            <form id="addMovieForm">
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Movie ID (slug)</label>
                        <input type="text" id="movieId" class="premium-input" placeholder="e.g. hit3" required>
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Category</label>
                        <select id="movieCategory" class="premium-select" required>
                            <option value="tollywood">Tollywood</option>
                            <option value="kollywood">Kollywood</option>
                            <option value="bollywood">Bollywood</option>
                            <option value="mollywood">Mollywood</option>
                            <option value="sandalwood">Sandalwood</option>
                            <option value="hollywood">Hollywood</option>
                            <option value="webseries">Web Series</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Movie Title</label>
                    <input type="text" id="movieTitle" class="premium-input" placeholder="e.g. Hit: The Third Case" required>
                </div>
                <div class="form-group">
                    <label>Poster (Upload File OR Paste URL)</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="file" id="moviePosterFile" accept="image/*" class="premium-input" style="flex: 1; padding: 8px;">
                        <span style="color: #aaa; font-size: 12px;">OR</span>
                        <input type="text" id="moviePoster" class="premium-input" placeholder="Paste image URL" style="flex: 1;">
                    </div>
                    <div id="uploadStatus" style="color: #FF073A; font-size: 12px; margin-top: 5px; display: none;">Uploading...</div>
                    <img id="posterPreview" style="max-width: 100%; max-height: 200px; margin-top: 10px; display: none; border: 1px solid #FF073A; border-radius: 8px;" alt="Poster Preview">
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Actor</label>
                        <input type="text" id="movieActor" class="premium-input">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Actress</label>
                        <input type="text" id="movieActress" class="premium-input">
                    </div>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="form-group" style="flex: 1;">
                        <label>Director</label>
                        <input type="text" id="movieDirector" class="premium-input">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label>Music Director</label>
                        <input type="text" id="movieMusic" class="premium-input">
                    </div>
                </div>
                <div class="form-group">
                    <label>Producer</label>
                    <input type="text" id="movieProducer" class="premium-input">
                </div>
                <div class="form-group">
                    <label>Trailer URL (YouTube Embed)</label>
                    <input type="text" id="movieTrailer" class="premium-input">
                </div>
                <div class="form-group">
                    <label>Synopsis</label>
                    <textarea id="movieSynopsis" class="premium-input" rows="3"></textarea>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button type="submit" class="submit-btn premium-btn" id="saveBtn" style="flex: 2;">Save Movie</button>
                    <button type="button" class="delete-btn premium-btn" id="deleteBtn" style="flex: 1; margin-top: 20px; background: rgba(255, 7, 58, 0.1); border-color: rgba(255, 7, 58, 0.5); display: none;">Delete</button>
                </div>
            </form>
        </div>
    </div>
    <style>
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 2000;
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            background: #1a1a1a;
            padding: 30px;
            border-radius: 15px;
            width: 90%;
            max-width: 500px;
            border: 1px solid #FF073A;
            box-shadow: 0 0 20px rgba(255, 7, 58, 0.5);
            max-height: 90vh;
            overflow-y: auto;
            color: white;
            font-family: 'Orbitron', sans-serif;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .modal-header h2 {
            color: #FF073A;
            font-size: 24px;
        }
        .close-btn {
            color: white;
            font-size: 28px;
            cursor: pointer;
        }
        .form-group {
            margin-bottom: 15px;
            text-align: left;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }
        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
        }
        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: none;
        }
        .submit-btn {
            width: 100%;
            margin-top: 20px;
        }
        .edit-overlay {
            /* Handled globally via premium-buttons.css */
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10;
        }
    </style>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div);

    // Dynamically load Firebase Storage
    if (!firebase.apps.length || typeof firebase.storage !== 'function') {
        const script = document.createElement('script');
        script.src = "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js";
        document.head.appendChild(script);
    }

    // Apply premium-btn class to injected buttons
    const btns = div.querySelectorAll('.submit-btn, .edit-overlay');
    btns.forEach(b => b.classList.add('premium-btn'));

    document.getElementById('addMovieForm').addEventListener('submit', handleMovieSubmit);
    document.getElementById('deleteBtn').addEventListener('click', () => {
        const id = document.getElementById('movieId').value;
        handleDeleteMovie(id);
    });

    document.getElementById('moviePosterFile').addEventListener('change', handlePosterUpload);
    document.getElementById('moviePoster').addEventListener('input', (e) => {
        const preview = document.getElementById('posterPreview');
        if (e.target.value) {
            preview.src = e.target.value;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    });
}

function openModal(movieData = null) {
    const form = document.getElementById('addMovieForm');
    if (!form) {
        injectAdminModal();
    }

    document.getElementById('addMovieForm').reset();
    const uploadStatus = document.getElementById('uploadStatus');
    if (uploadStatus) {
        uploadStatus.style.display = 'none';
        uploadStatus.style.color = '#FF073A';
    }
    const preview = document.getElementById('posterPreview');
    if (preview) {
        preview.style.display = 'none';
        preview.src = '';
    }

    if (movieData) {
        document.getElementById('modalTitle').textContent = 'Edit Movie';
        document.getElementById('saveBtn').textContent = 'Update Movie';
        document.getElementById('movieId').value = movieData.id;
        document.getElementById('movieId').readOnly = true;
        document.getElementById('movieTitle').value = movieData.title || '';
        document.getElementById('movieCategory').value = movieData.category || 'tollywood';
        document.getElementById('moviePoster').value = movieData.poster || '';
        if (movieData.poster) {
            const tempPreview = document.getElementById('posterPreview');
            if (tempPreview) {
                tempPreview.src = movieData.poster;
                tempPreview.style.display = 'block';
            }
        }
        document.getElementById('movieActor').value = movieData.actor || '';
        document.getElementById('movieActress').value = movieData.actress || '';
        document.getElementById('movieDirector').value = movieData.director || '';
        document.getElementById('movieMusic').value = movieData.music || '';
        document.getElementById('movieProducer').value = movieData.producer || '';
        document.getElementById('movieTrailer').value = movieData.trailer || '';
        document.getElementById('movieSynopsis').value = movieData.synopsis || '';
        document.getElementById('deleteBtn').style.display = 'block';
    } else {
        document.getElementById('modalTitle').textContent = 'Add New Movie';
        document.getElementById('saveBtn').textContent = 'Save Movie';
        document.getElementById('movieId').readOnly = false;
        document.getElementById('deleteBtn').style.display = 'none';
    }

    document.getElementById('movieModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('movieModal').style.display = 'none';
}

async function handleMovieSubmit(e) {
    e.preventDefault();
    let trailerInput = document.getElementById('movieTrailer').value;
    if (trailerInput.includes('<iframe')) {
        const match = trailerInput.match(/src="([^"]+)"/);
        if (match) trailerInput = match[1];
    }

    let posterInput = document.getElementById('moviePoster').value.trim();
    const saveBtn = document.getElementById('saveBtn');

    if (posterInput && !posterInput.startsWith('http') && !posterInput.includes('.')) {
        posterInput += '.jpg';
    } else if (!posterInput) {
        alert('Please select a poster file or paste a URL.');
        return;
    }

    const movieData = {
        id: document.getElementById('movieId').value,
        title: document.getElementById('movieTitle').value,
        category: document.getElementById('movieCategory').value,
        poster: posterInput,
        actor: document.getElementById('movieActor').value,
        actress: document.getElementById('movieActress').value,
        director: document.getElementById('movieDirector').value,
        music: document.getElementById('movieMusic').value,
        producer: document.getElementById('movieProducer').value,
        trailer: trailerInput,
        synopsis: document.getElementById('movieSynopsis').value
    };

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Movie...';
        const res = await fetch('/api/movies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(movieData)
        });

        if (res.ok) {
            alert('🎬 Movie saved successfully!');
            closeModal();
            location.reload();
        } else {
            const err = await res.json();
            alert('Error: ' + err.error);
        }
    } catch (err) {
        alert('Connection error.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = document.getElementById('modalTitle').textContent.includes('Edit') ? 'Update Movie' : 'Save Movie';
    }
}

async function handlePosterUpload(e) {
    const file = e.target.files[0];
    if (!file) {
        const preview = document.getElementById('posterPreview');
        if (preview) preview.style.display = 'none';
        return;
    }

    const uploadStatus = document.getElementById('uploadStatus');
    const posterInput = document.getElementById('moviePoster');
    const preview = document.getElementById('posterPreview');
    const saveBtn = document.getElementById('saveBtn');

    // Show local preview instantly
    const reader = new FileReader();
    reader.onload = (e) => {
        if (preview) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);

    try {
        saveBtn.disabled = true;
        uploadStatus.style.display = 'block';
        uploadStatus.style.color = '#FF073A';
        uploadStatus.textContent = 'Uploading image to cloud... Please wait.';

        if (!firebase.apps.length || typeof firebase.storage !== 'function') {
            throw new Error('Cloud storage not ready yet. Please try again.');
        }

        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child('posters/' + Date.now() + '_' + file.name);
        await fileRef.put(file);
        const downloadURL = await fileRef.getDownloadURL();
        
        posterInput.value = downloadURL;
        
        uploadStatus.textContent = 'Upload successful!';
        uploadStatus.style.color = '#4caf50';
    } catch (err) {
        console.error('Upload Error:', err);
        uploadStatus.textContent = err.message || 'Image upload failed. Try pasting a URL instead.';
        uploadStatus.style.color = '#FF073A';
    } finally {
        saveBtn.disabled = false;
    }
}

async function handleDeleteMovie(id) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete movie "${id}"? This cannot be undone.`)) {
        return;
    }

    try {
        const res = await fetch(`/api/movies/${id}`, {
            method: 'DELETE'
        });

        if (res.ok) {
            alert('🗑️ Movie deleted successfully.');
            closeModal();
            location.reload();
        } else {
            const err = await res.json();
            alert('Error deleting movie: ' + err.error);
        }
    } catch (err) {
        alert('Connection error while deleting.');
    }
}
