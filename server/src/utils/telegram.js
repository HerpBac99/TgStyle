const crypto = require('crypto');

// Telegram Bot Token (should be in environment variables in production)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN';

/**
 * Validates Telegram Web App data
 * @param {string} initDataString - The initData string from Telegram Web App
 * @returns {Object} - Validation result
 */
function validateTelegramWebAppData(initDataString) {
    try {
        // Parse the data
        const urlParams = new URLSearchParams(initDataString);
        const hash = urlParams.get('hash');
        
        if (!hash) {
            return {
                isValid: false,
                error: 'Hash is missing'
            };
        }
        
        // Remove hash from the data for validation
        urlParams.delete('hash');
        
        // Sort parameters alphabetically
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
            
        // Create a secret key from the bot token
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();
            
        // Calculate the hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
            
        // Compare the hashes
        if (calculatedHash !== hash) {
            return {
                isValid: false,
                error: 'Data verification failed'
            };
        }
        
        // Parse the user data
        const userJson = urlParams.get('user');
        const user = userJson ? JSON.parse(userJson) : null;
        
        if (!user) {
            return {
                isValid: false,
                error: 'User data is missing'
            };
        }
        
        return {
            isValid: true,
            data: {
                user,
                startParam: urlParams.get('start_param'),
                authDate: urlParams.get('auth_date'),
                raw: initDataString
            }
        };
    } catch (error) {
        console.error('Telegram validation error:', error);
        return {
            isValid: false,
            error: error.message
        };
    }
}

// For development/testing purposes, we can create a mock validation function
function mockValidateTelegramWebAppData(initDataString) {
    try {
        // Attempt to parse user data if available
        let user = null;
        try {
            const urlParams = new URLSearchParams(initDataString);
            const userJson = urlParams.get('user');
            user = userJson ? JSON.parse(userJson) : null;
        } catch (e) {
            // If parsing fails, create a mock user
            console.warn('Failed to parse initData, using mock user');
        }
        
        // Provide mock user if not available
        if (!user) {
            user = {
                id: 12345678,
                first_name: 'Test',
                last_name: 'User',
                username: 'testuser',
                language_code: 'en'
            };
        }
        
        return {
            isValid: true,
            data: {
                user,
                startParam: null,
                authDate: Math.floor(Date.now() / 1000),
                raw: initDataString
            }
        };
    } catch (error) {
        console.error('Mock validation error:', error);
        return {
            isValid: false,
            error: error.message
        };
    }
}

// Use the appropriate validation function based on environment
const isDevelopment = process.env.NODE_ENV === 'development';
const validateFunction = isDevelopment ? mockValidateTelegramWebAppData : validateTelegramWebAppData;

module.exports = {
    validateTelegramWebAppData: validateFunction
}; 