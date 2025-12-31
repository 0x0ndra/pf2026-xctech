/**
 * PF 2026 Leaderboard API Server
 * Simple Express server for score storage with anti-cheat measures
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3026;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Secret key for token signing (in production, use environment variable)
const SECRET_KEY = 'pf2026-xctech-' + crypto.randomBytes(16).toString('hex');

// Store active game sessions (in production, use Redis)
const gameSessions = new Map();

// Clean up old sessions every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of gameSessions) {
        if (now - session.startTime > 30 * 60 * 1000) { // 30 minutes max
            gameSessions.delete(token);
        }
    }
}, 10 * 60 * 1000);

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting - 10 requests per minute for score submission
const submitLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { success: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for session start - 20 per minute
const sessionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Initialize scores file if doesn't exist
if (!fs.existsSync(SCORES_FILE)) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify([], null, 2));
}

// GET - Return all scores (no rate limit needed)
app.get('/scores', (req, res) => {
    try {
        const scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')) || [];

        // Sort by time (ascending - fastest first)
        scores.sort((a, b) => a.time - b.time);

        // Return top 50
        res.json({
            success: true,
            scores: scores.slice(0, 50)
        });
    } catch (error) {
        console.error('Error loading scores:', error);
        res.status(500).json({ success: false, error: 'Failed to load scores' });
    }
});

// POST - Start a new game session
app.post('/session/start', sessionLimiter, (req, res) => {
    try {
        // Generate unique session token
        const token = crypto.randomBytes(32).toString('hex');
        const startTime = Date.now();

        // Create signature for verification
        const signature = crypto
            .createHmac('sha256', SECRET_KEY)
            .update(token + startTime)
            .digest('hex');

        // Store session
        gameSessions.set(token, {
            startTime,
            signature,
            interactions: 0,
            submitted: false
        });

        res.json({
            success: true,
            token,
            signature: signature.substring(0, 16) // Send partial signature for client
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ success: false, error: 'Failed to create session' });
    }
});

// POST - Record interaction (for anti-cheat verification)
app.post('/session/interact', (req, res) => {
    const { token } = req.body;
    const session = gameSessions.get(token);

    if (session && !session.submitted) {
        session.interactions++;
        session.lastInteraction = Date.now();
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// POST - Add new score
app.post('/scores', submitLimiter, (req, res) => {
    try {
        const { name, cinema, email, time, token, sig } = req.body;

        // Validate required fields
        if (!name || !cinema || !time) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, cinema, time'
            });
        }

        // Sanitize input
        const sanitizedName = String(name).trim().slice(0, 50);
        const sanitizedCinema = String(cinema).trim().slice(0, 100);
        const sanitizedEmail = email ? String(email).trim().slice(0, 100) : null;
        const sanitizedTime = parseInt(time);

        // Time validation: minimum 3 seconds (realistic), maximum 10 minutes
        if (sanitizedTime < 3000 || sanitizedTime > 600000) {
            return res.status(400).json({
                success: false,
                error: 'Invalid time value'
            });
        }

        // Session validation (if token provided)
        let validSession = false;
        let session = null;

        if (token) {
            session = gameSessions.get(token);
            if (session && !session.submitted) {
                const sessionDuration = Date.now() - session.startTime;

                // Check if claimed time is plausible
                // Allow some tolerance (claimed time should be <= session duration + 2 seconds buffer)
                if (sanitizedTime <= sessionDuration + 2000) {
                    // Check for minimum interactions (at least moved some sliders)
                    if (session.interactions >= 3) {
                        validSession = true;
                        session.submitted = true;
                    }
                }
            }
        }

        // Load existing scores
        let scores = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf8')) || [];

        // Add new score
        const newScore = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            name: sanitizedName,
            cinema: sanitizedCinema,
            email: sanitizedEmail,
            time: sanitizedTime,
            date: new Date().toISOString(),
            verified: validSession, // Mark if session was valid
            mobile: req.body.mobile === true // Mark if played on mobile
        };

        scores.push(newScore);

        // Sort by time
        scores.sort((a, b) => a.time - b.time);

        // Keep only top 500 scores
        scores = scores.slice(0, 500);

        // Save
        fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2));

        // Find rank of new score
        const rank = scores.findIndex(s => s.id === newScore.id) + 1;

        // Clean up session
        if (token) {
            gameSessions.delete(token);
        }

        res.json({
            success: true,
            rank: rank,
            score: newScore
        });
    } catch (error) {
        console.error('Error saving score:', error);
        res.status(500).json({ success: false, error: 'Failed to save score' });
    }
});

app.listen(PORT, () => {
    console.log(`PF 2026 Leaderboard API running on port ${PORT}`);
});
