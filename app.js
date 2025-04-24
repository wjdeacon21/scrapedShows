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

const findMatches = (topArtists, shows, likedArtists) => {
    // Create a Set of all user's artist names (case-insensitive)
    const userArtists = new Set([
        ...topArtists.map(artist => artist.name.toLowerCase().trim()),
        ...likedArtists.map(artist => artist.name.toLowerCase().trim())
    ]);

    console.log('User Artists Set:', Array.from(userArtists));
    console.log('Raw Shows Data:', JSON.stringify(shows, null, 2));

    // Find shows where any artist matches user's artists
    const matchingShows = shows.filter(show => {
        // Debug the show structure
        console.log('Processing show:', JSON.stringify(show, null, 2));
        
        // Check if show has the expected structure
        if (!show || typeof show !== 'object') {
            console.warn('Show is not an object:', show);
            return false;
        }

        if (!show.name || typeof show.name !== 'object') {
            console.warn('Show.name is not an object:', show);
            return false;
        }

        if (!show.name.name || typeof show.name.name !== 'object') {
            console.warn('Show.name.name is not an object:', show.name);
            return false;
        }

        if (!Array.isArray(show.name.name.artists)) {
            console.warn('Show.name.name.artists is not an array:', show.name.name.artists);
            return false;
        }

        console.log('Show artists array:', show.name.name.artists);

        const hasMatch = show.name.name.artists.some(artist => {
            if (!artist || typeof artist !== 'string') {
                console.warn('Invalid artist in array:', artist);
                return false;
            }
            const normalizedArtist = artist.toLowerCase().trim();
            const isMatch = userArtists.has(normalizedArtist);
            if (isMatch) {
                console.log(`Match found: ${artist} in show at ${show.name.name.venue}`);
            }
            return isMatch;
        });

        return hasMatch;
    });

    // Sort shows by date
    matchingShows.sort((a, b) => {
        try {
            const dateA = new Date(a.name.name.date);
            const dateB = new Date(b.name.name.date);
            return dateA - dateB;
        } catch (error) {
            console.warn('Error sorting dates:', error);
            return 0;
        }
    });

    console.log('Final matching shows:', JSON.stringify(matchingShows, null, 2));
    return matchingShows;
};

const updateArtistsLists = (topArtists, shows, likedArtists) => {
    // Log all data for debugging
    console.log('Top Artists:', topArtists.map(artist => ({
        name: artist.name,
        image: artist.image,
        genres: artist.genres,
        url: artist.url
    })));

    console.log('Liked Artists:', likedArtists.map(artist => ({
        name: artist.name,
        image: artist.image,
        genres: artist.genres,
        url: artist.url
    })));

    console.log('All Shows:', shows);

    // Find and display matching shows
    const matchingShows = findMatches(topArtists, shows, likedArtists);
    console.log('Matching Shows:', matchingShows);
    
    DOM_ELEMENTS.matchesList.innerHTML = matchingShows.length > 0 
        ? matchingShows.map(show => `
            <div class="artist-item">
                <div class="name">${show.name.name.artists.join(', ')}</div>
                <div class="details">
                    <div class="date">${show.name.name.date} at ${show.name.name.time}</div>
                    <div class="venue">${show.name.name.venue}</div>
                </div>
            </div>
        `).join('')
        : '<div class="artist-item"><div class="name">No upcoming shows found</div></div>';
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    DOM_ELEMENTS.loginButton.addEventListener('click', Auth.login);
    DOM_ELEMENTS.logoutButton.addEventListener('click', Auth.logout);
    Auth.checkForTokens();
}); 
