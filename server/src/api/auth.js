const express = require('express');
const router = express.Router();
const { validateTelegramWebAppData } = require('../utils/telegram');
const User = require('../models/User');

/**
 * Handle Telegram authentication
 * POST /api/auth
 */
router.post('/', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({
                success: false,
                error: 'No initData provided'
            });
        }
        
        // Validate Telegram initData
        const validationResult = validateTelegramWebAppData(initData);
        
        if (!validationResult.isValid) {
            return res.status(401).json({
                success: false,
                error: validationResult.error
            });
        }
        
        // Extract user information
        const { user } = validationResult.data;
        
        // Check if user exists, if not create one
        let userDoc = await User.findOne({ telegramId: user.id });
        
        if (!userDoc) {
            userDoc = new User({
                telegramId: user.id,
                firstName: user.first_name,
                lastName: user.last_name || '',
                username: user.username || ''
            });
            await userDoc.save();
        }
        
        return res.json({
            success: true,
            user: {
                id: userDoc.telegramId,
                firstName: userDoc.firstName,
                lastName: userDoc.lastName,
                username: userDoc.username
            }
        });
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

module.exports = router; 