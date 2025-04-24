//adding a comment so i can see the changes

// DOM Elements
const DOM_ELEMENTS = {
    authContainer: document.getElementById('authContainer'),
    appContainer: document.getElementById('appContainer'),
    loginButton: document.getElementById('loginButton'),
    logoutButton: document.getElementById('logoutButton'),
    errorMessage: document.getElementById('errorMessage'),
    loading: document.getElementById('loading'),
    username: document.getElementById('username'),
    topArtistsList: document.getElementById('topArtistsList'),
    upcomingArtistsList: document.getElementById('upcomingArtistsList'),
    matchesList: document.getElementById('matchesList')
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
            fetchArtists();
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
                    fetchArtists();
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
            fetchArtists();
        } catch (error) {
            console.error('Error refreshing token:', error);
            Auth.logout();
        }
    }
};

// Artist Functions
const fetchArtists = async () => {
    if (!state.userId || !state.accessToken) return;

    try {
        UIState.showLoading();
        UIState.hideError();

        const [topArtistsResponse, upcomingArtistsResponse, likedArtistsResponse] = await Promise.all([
            fetch(`/api/top-artists?userId=${state.userId}`, {
                headers: {
                    'Authorization': `Bearer ${state.accessToken}`
                }
            }),
            fetch('/api/upcoming-artists'),
            fetch(`/api/liked-artists?userId=${state.userId}`, {
                headers: {
                    'Authorization': `Bearer ${state.accessToken}`
                }
            })
        ]);

        if (topArtistsResponse.status === 401 || likedArtistsResponse.status === 401) {
            await Auth.refreshToken();
            return fetchArtists();
        }

        const [topArtistsData, upcomingArtistsData, likedArtistsData] = await Promise.all([
            topArtistsResponse.json(),
            upcomingArtistsResponse.json(),
            likedArtistsResponse.json()
        ]);

        if (topArtistsData.error) {
            throw new Error(topArtistsData.error);
        }

        if (upcomingArtistsData.error) {
            throw new Error(upcomingArtistsData.error);
        }

        if (likedArtistsData.error) {
            throw new Error(likedArtistsData.error);
        }

        updateArtistsLists(topArtistsData.topArtists, upcomingArtistsData.upcomingArtists, likedArtistsData.likedArtists);
    } catch (error) {
        console.error('Error fetching artists:', error);
        UIState.showError('Failed to load artists');
    } finally {
        UIState.hideLoading();
    }
};

const findMatches = (topArtists, upcomingArtists, likedArtists) => {
    const topArtistNames = new Set(topArtists.map(artist => artist.name.toLowerCase().trim()));
    const likedArtistNames = new Set(likedArtists.map(artist => artist.name.toLowerCase().trim()));
    const allArtistNames = new Set([...topArtistNames, ...likedArtistNames]);
    
    return upcomingArtists
        .filter(artist => allArtistNames.has(artist.name.toLowerCase().trim()))
        .map(artist => artist.name);
};

const updateArtistsLists = (topArtists, upcomingArtists, likedArtists) => {
    // Update top artists list
    DOM_ELEMENTS.topArtistsList.innerHTML = topArtists.map(artist => `
        <div class="artist-item">
            <div class="name">${artist.name}</div>
        </div>
    `).join('');

    // Update upcoming artists list
    DOM_ELEMENTS.upcomingArtistsList.innerHTML = upcomingArtists.map(artist => `
        <div class="artist-item">
            <div class="name">${artist.name}</div>
        </div>
    `).join('');

    // Find and display matches
    const matches = findMatches(topArtists, upcomingArtists, likedArtists);
    DOM_ELEMENTS.matchesList.innerHTML = matches.length > 0 
        ? matches.map(name => `
            <div class="artist-item">
                <div class="name">${name}</div>
            </div>
        `).join('')
        : '<div class="artist-item"><div class="name">No matches found</div></div>';
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    DOM_ELEMENTS.loginButton.addEventListener('click', Auth.login);
    DOM_ELEMENTS.logoutButton.addEventListener('click', Auth.logout);
    Auth.checkForTokens();
}); 
