const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const querystring = require('querystring');
const getArtistNames = require('./scraper');


// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8888;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Spotify API credentials
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${port}/callback`;

// Store user tokens
const userTokens = new Map();

function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

app.get('/login', (req, res) => {
    const state = generateRandomString(16);
    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing user-library-read';

    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state
        }));
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
    } else {
        try {
            const authOptions = {
                url: 'https://accounts.spotify.com/api/token',
                form: {
                    code: code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code'
                },
                headers: {
                    'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                json: true
            };

            const response = await axios.post(authOptions.url, querystring.stringify(authOptions.form), { headers: authOptions.headers });

            const access_token = response.data.access_token;
            const refresh_token = response.data.refresh_token;

            const userResponse = await axios.get('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });

            const username = userResponse.data.display_name;
            const userId = generateRandomString(16);

            userTokens.set(userId, {
                access_token,
                refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000),
                username
            });

            res.redirect(`/#${querystring.stringify({ access_token, refresh_token, userId, username })}`);

        } catch (error) {
            console.error('Error getting user tokens:', error);
            res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
        }
    }
});

app.get('/refresh_token', async (req, res) => {
    const { refresh_token } = req.query;

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', 
            querystring.stringify({
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            }),
            {
                headers: {
                    'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        res.json({
            access_token: response.data.access_token,
            expires_in: response.data.expires_in
        });
    } catch (error) {
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const { artist, userId } = req.query;

        if (!artist) return res.status(400).json({ error: 'Artist name is required' });
        if (!userId || !userTokens.has(userId)) return res.status(401).json({ error: 'User not authenticated' });

        const userToken = userTokens.get(userId);

        if (Date.now() >= userToken.expires_at) {
            const response = await axios.post('https://accounts.spotify.com/api/token', 
                querystring.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: userToken.refresh_token
                }),
                {
                    headers: {
                        'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            userToken.access_token = response.data.access_token;
            userToken.expires_at = Date.now() + (response.data.expires_in * 1000);
        }

        const searchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`, {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        const artistId = searchResponse.data.artists.items[0]?.id;
        if (!artistId) return res.status(404).json({ error: 'Artist not found' });

        const topTracksResponse = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        const topTrack = topTracksResponse.data.tracks[0];
        if (!topTrack) return res.status(404).json({ error: 'No tracks found for this artist' });

        res.json({
            songName: topTrack.name,
            artistName: topTrack.artists[0].name,
            albumCover: topTrack.album.images[0].url
        });

    } catch (error) {
        console.error('Error in search endpoint:', error.message);
        res.status(500).json({ error: 'Failed to fetch artist information' });
    }
});

async function getTopArtists(userId) {
    if (!userId || !userTokens.has(userId)) {
        console.error('User not authenticated:', { userId, hasToken: userTokens.has(userId) });
        throw new Error('User not authenticated');
    }

    const userToken = userTokens.get(userId);
    console.log('User token status:', { 
        userId, 
        hasAccessToken: !!userToken.access_token,
        hasRefreshToken: !!userToken.refresh_token,
        expiresAt: new Date(userToken.expires_at).toISOString(),
        currentTime: new Date().toISOString()
    });

    if (Date.now() >= userToken.expires_at) {
        console.log('Token expired, refreshing...');
        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', 
                querystring.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: userToken.refresh_token
                }),
                {
                    headers: {
                        'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            userToken.access_token = response.data.access_token;
            userToken.expires_at = Date.now() + (response.data.expires_in * 1000);
            console.log('Token refreshed successfully');
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw new Error('Failed to refresh token');
        }
    }

    try {
        const topArtistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=50', {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        return topArtistsResponse.data.items.map(artist => ({
            name: artist.name,
            image: artist.images[0]?.url,
            genres: artist.genres,
            url: artist.external_urls.spotify
        }));
    } catch (error) {
        console.error('Error fetching top artists from Spotify:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw new Error('Failed to fetch top artists from Spotify');
    }
}

app.get('/api/top-artists', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const topArtists = await getTopArtists(userId);
        res.json({ topArtists });
    } catch (error) {
        console.error('Error in top-artists endpoint:', error.message);
        if (error.message === 'User not authenticated') {
            res.status(401).json({ error: 'User not authenticated' });
        } else if (error.message === 'Failed to refresh token') {
            res.status(401).json({ error: 'Authentication expired. Please log in again.' });
        } else {
            res.status(500).json({ error: 'Failed to get top artists' });
        }
    }
});

async function getLikedArtists(userId) {
    if (!userId || !userTokens.has(userId)) {
        console.error('User not authenticated:', { userId, hasToken: userTokens.has(userId) });
        throw new Error('User not authenticated');
    }

    const userToken = userTokens.get(userId);
    console.log('User token status:', { 
        userId, 
        hasAccessToken: !!userToken.access_token,
        hasRefreshToken: !!userToken.refresh_token,
        expiresAt: new Date(userToken.expires_at).toISOString(),
        currentTime: new Date().toISOString()
    });

    if (Date.now() >= userToken.expires_at) {
        console.log('Token expired, refreshing...');
        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', 
                querystring.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: userToken.refresh_token
                }),
                {
                    headers: {
                        'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            userToken.access_token = response.data.access_token;
            userToken.expires_at = Date.now() + (response.data.expires_in * 1000);
            console.log('Token refreshed successfully');
        } catch (error) {
            console.error('Error refreshing token:', error.response?.data || error.message);
            throw new Error('Failed to refresh token');
        }
    }

    try {
        let allArtists = new Set();
        let nextURL = 'https://api.spotify.com/v1/me/tracks?limit=50';

        while (nextURL) {
            const response = await axios.get(nextURL, {
                headers: {
                    'Authorization': `Bearer ${userToken.access_token}`
                }
            });

            response.data.items.forEach(item => {
                item.track.artists.forEach(artist => {
                    allArtists.add(JSON.stringify({
                        name: artist.name,
                        image: artist.images?.[0]?.url,
                        genres: artist.genres || [],
                        url: artist.external_urls.spotify
                    }));
                });
            });

            nextURL = response.data.next;
        }

        return Array.from(allArtists).map(JSON.parse);
    } catch (error) {
        console.error('Error fetching liked artists from Spotify:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw new Error('Failed to fetch liked artists from Spotify');
    }
}

app.get('/api/liked-artists', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const likedArtists = await getLikedArtists(userId);
        res.json({ likedArtists });
    } catch (error) {
        console.error('Error in liked-artists endpoint:', error.message);
        if (error.message === 'User not authenticated') {
            res.status(401).json({ error: 'User not authenticated' });
        } else if (error.message === 'Failed to refresh token') {
            res.status(401).json({ error: 'Authentication expired. Please log in again.' });
        } else {
            res.status(500).json({ error: 'Failed to get liked artists' });
        }
    }
});

app.get('/api/upcoming-artists', async (req, res) => {
    try {
        const artists = await getArtistNames();
        res.json({ upcomingArtists: artists.map(name => ({ name })) });
    } catch (error) {
        console.error('Error fetching upcoming artists:', error);
        res.status(500).json({ error: 'Failed to get upcoming artists' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = { getTopArtists };
