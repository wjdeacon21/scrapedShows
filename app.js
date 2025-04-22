//adding a comment so i can see the changes

// DOM Elements
const DOM_ELEMENTS = {
    authContainer: document.getElementById('authContainer'),
    appContainer: document.getElementById('appContainer'),
    loginButton: document.getElementById('loginButton'),
    logoutButton: document.getElementById('logoutButton'),
    searchButton: document.getElementById('searchButton'),
    artistInput: document.getElementById('artistInput'),
    resultContainer: document.getElementById('resultContainer'),
    errorMessage: document.getElementById('errorMessage'),
    loading: document.getElementById('loading'),
    songCover: document.getElementById('songCover'),
    songTitle: document.getElementById('songTitle'),
    artistName: document.getElementById('artistName'),
    username: document.getElementById('username'),
    topArtists: document.getElementById('topArtists')
};

// State Management
const state = {
    userId: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
    username: null
};

// UI State Management
const UIState = {
    showElement: (element) => element.style.display = 'block',
    hideElement: (element) => element.style.display = 'none',
    clearElement: (element) => element.innerHTML = '',
    showLoading: () => DOM_ELEMENTS.loading.classList.add('show'),
    hideLoading: () => DOM_ELEMENTS.loading.classList.remove('show'),
    showResults: () => DOM_ELEMENTS.resultContainer.classList.add('show'),
    hideResults: () => DOM_ELEMENTS.resultContainer.classList.remove('show'),
    showError: (message) => {
        DOM_ELEMENTS.errorMessage.textContent = message;
        DOM_ELEMENTS.errorMessage.classList.add('show');
    },
    hideError: () => DOM_ELEMENTS.errorMessage.classList.remove('show')
};

// Authentication Functions
const Auth = {
    login: () => {
        window.location.href = '/login';
    },

    logout: () => {
        state.userId = null;
        state.accessToken = null;
        state.refreshToken = null;
        state.expiresAt = null;
        state.username = null;
        localStorage.removeItem('userId');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('expiresAt');
        localStorage.removeItem('username');
        DOM_ELEMENTS.username.textContent = '';
        UIState.hideElement(DOM_ELEMENTS.appContainer);
        UIState.showElement(DOM_ELEMENTS.authContainer);
    },

    checkForTokens: () => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        
        if (params.has('access_token')) {
            state.accessToken = params.get('access_token');
            state.refreshToken = params.get('refresh_token');
            state.userId = params.get('userId');
            state.username = params.get('username');
            state.expiresAt = Date.now() + (3600 * 1000); // 1 hour from now
            
            localStorage.setItem('accessToken', state.accessToken);
            localStorage.setItem('refreshToken', state.refreshToken);
            localStorage.setItem('userId', state.userId);
            localStorage.setItem('username', state.username);
            localStorage.setItem('expiresAt', state.expiresAt);
            
            DOM_ELEMENTS.username.textContent = state.username;
            window.location.hash = '';
            UIState.hideElement(DOM_ELEMENTS.authContainer);
            UIState.showElement(DOM_ELEMENTS.appContainer);
            fetchTopArtists();
        } else {
            state.accessToken = localStorage.getItem('accessToken');
            state.refreshToken = localStorage.getItem('refreshToken');
            state.userId = localStorage.getItem('userId');
            state.username = localStorage.getItem('username');
            state.expiresAt = parseInt(localStorage.getItem('expiresAt'));
            
            if (state.accessToken && state.userId) {
                if (Date.now() >= state.expiresAt) {
                    Auth.refreshToken();
                } else {
                    DOM_ELEMENTS.username.textContent = state.username;
                    UIState.hideElement(DOM_ELEMENTS.authContainer);
                    UIState.showElement(DOM_ELEMENTS.appContainer);
                    fetchTopArtists();
                }
            }
        }
    },

    refreshToken: async () => {
        try {
            const response = await fetch(`/refresh_token?refresh_token=${state.refreshToken}`);
            const data = await response.json();
            
            state.accessToken = data.access_token;
            state.expiresAt = Date.now() + (data.expires_in * 1000);
            
            localStorage.setItem('accessToken', state.accessToken);
            localStorage.setItem('expiresAt', state.expiresAt);
            
            UIState.hideElement(DOM_ELEMENTS.authContainer);
            UIState.showElement(DOM_ELEMENTS.appContainer);
        } catch (error) {
            console.error('Error refreshing token:', error);
            Auth.logout();
        }
    }
};

// Search Function
const searchArtist = async () => {
    const artistName = DOM_ELEMENTS.artistInput.value.trim();
    if (!artistName) {
        UIState.showError('Please enter an artist name');
        return;
    }

    if (!state.userId || !state.accessToken) {
        UIState.showError('Please log in first');
        return;
    }

    try {
        UIState.showLoading();
        UIState.hideResults();
        UIState.hideError();

        const response = await fetch(`/api/search?artist=${encodeURIComponent(artistName)}&userId=${state.userId}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`
            }
        });
        
        if (response.status === 401) {
            await Auth.refreshToken();
            return searchArtist();
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        DOM_ELEMENTS.songTitle.textContent = data.songName;
        DOM_ELEMENTS.artistName.textContent = data.artistName;
        DOM_ELEMENTS.songCover.src = data.albumCover;
        UIState.showResults();
    } catch (error) {
        UIState.showError(error.message || 'An error occurred while searching');
    } finally {
        UIState.hideLoading();
    }
};

const fetchTopArtists = async () => {
    if (!state.userId || !state.accessToken) return;

    try {
        const response = await fetch(`/api/top-artists?userId=${state.userId}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`
            }
        });
        
        if (response.status === 401) {
            await Auth.refreshToken();
            return fetchTopArtists();
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        updateTopArtists(data.topArtists);
    } catch (error) {
        console.error('Error fetching top artists:', error);
        UIState.showError('Failed to load top artists');
    }
};

const updateTopArtists = (artists) => {
    DOM_ELEMENTS.topArtists.innerHTML = artists.map(artist => `
        <a href="${artist.url}" target="_blank" class="artist-card">
            <img src="${artist.image}" alt="${artist.name}" class="artist-image">
            <div class="artist-name">${artist.name}</div>
            <div class="artist-genres">${artist.genres.join(', ')}</div>
        </a>
    `).join('');
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    DOM_ELEMENTS.loginButton.addEventListener('click', Auth.login);
    DOM_ELEMENTS.logoutButton.addEventListener('click', Auth.logout);
    DOM_ELEMENTS.searchButton.addEventListener('click', searchArtist);
    DOM_ELEMENTS.artistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchArtist();
        }
    });
    Auth.checkForTokens();
}); 