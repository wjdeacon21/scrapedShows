const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const querystring = require('querystring');

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

// Generate a random string for state parameter
function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

// Login endpoint
app.get('/login', (req, res) => {
    const state = generateRandomString(16);
    const scope = 'user-read-private user-read-email user-top-read user-read-currently-playing';
    
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: scope,
            redirect_uri: REDIRECT_URI,
            state: state
        }));
});

// Callback endpoint
app.get('/callback', async (req, res) => {
    const code = req.query.code || null;
    const state = req.query.state || null;

    if (state === null) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
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

            const response = await axios.post(authOptions.url, 
                querystring.stringify(authOptions.form),
                { headers: authOptions.headers }
            );

            const access_token = response.data.access_token;
            const refresh_token = response.data.refresh_token;
            
            // Get user profile
            const userResponse = await axios.get('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            });
            
            const username = userResponse.data.display_name;
            
            // Store tokens (in a real app, you'd use a database)
            const userId = generateRandomString(16);
            userTokens.set(userId, {
                access_token,
                refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000),
                username
            });

            // Redirect to frontend with tokens
            res.redirect(`/#${querystring.stringify({
                access_token,
                refresh_token,
                userId,
                username
            })}`);

        } catch (error) {
            console.error('Error getting user tokens:', error);
            res.redirect('/#' +
                querystring.stringify({
                    error: 'invalid_token'
                }));
        }
    }
});

// Refresh token endpoint
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

// Search endpoint (now using user token)
app.get('/api/search', async (req, res) => {
    try {
        const { artist, userId } = req.query;
        
        if (!artist) {
            return res.status(400).json({ error: 'Artist name is required' });
        }

        if (!userId || !userTokens.has(userId)) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const userToken = userTokens.get(userId);
        
        // Check if token needs refresh
        if (Date.now() >= userToken.expires_at) {
            const refreshResponse = await axios.get(`/refresh_token?refresh_token=${userToken.refresh_token}`);
            userToken.access_token = refreshResponse.data.access_token;
            userToken.expires_at = Date.now() + (refreshResponse.data.expires_in * 1000);
        }

        // Search for the artist
        const searchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`, {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        const artistId = searchResponse.data.artists.items[0]?.id;
        
        if (!artistId) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        // Get artist's top tracks
        const topTracksResponse = await axios.get(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        const topTrack = topTracksResponse.data.tracks[0];
        
        if (!topTrack) {
            return res.status(404).json({ error: 'No tracks found for this artist' });
        }

        // Return the top track information
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

app.get('/api/top-artists', async (req, res) => {
    const { userId } = req.query;

    if (!userId || !userTokens.has(userId)) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const userToken = userTokens.get(userId);

    // Check if token needs refreshing
    if (Date.now() >= userToken.expires_at) {
        try {
            const refreshResponse = await axios.get(`/refresh_token?refresh_token=${userToken.refresh_token}`);
            userToken.access_token = refreshResponse.data.access_token;
            userToken.expires_at = Date.now() + (refreshResponse.data.expires_in * 1000);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to refresh token' });
        }
    }

    try {
        const topArtistsResponse = await axios.get('https://api.spotify.com/v1/me/top/artists?limit=50', {
            headers: {
                'Authorization': `Bearer ${userToken.access_token}`
            }
        });

        const topArtists = topArtistsResponse.data.items.map(artist => ({
            name: artist.name,
            image: artist.images[0]?.url,
            genres: artist.genres,
            url: artist.external_urls.spotify
        }));

        res.json({ topArtists });

    } catch (error) {
        console.error('Error fetching top artists:', error);
        res.status(500).json({ error: 'Failed to get top artists' });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

