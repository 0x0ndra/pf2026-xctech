/**
 * PF 2026 Leaderboard API Server
 * Simple Express server for score storage
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3026;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize scores file if doesn't exist
if (!fs.existsSync(SCORES_FILE)) {
    fs.writeFileSync(SCORES_FILE, JSON.stringify([], null, 2));
}

// GET - Return all scores
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

// POST - Add new score
app.post('/scores', (req, res) => {
    try {
        const { name, cinema, email, time } = req.body;

        // Validate input
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

        if (sanitizedTime < 1000 || sanitizedTime > 600000) {
            return res.status(400).json({
                success: false,
                error: 'Invalid time value'
            });
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
            date: new Date().toISOString()
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
