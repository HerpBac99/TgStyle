const mongoose = require('mongoose');

const analysisHistorySchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now
    },
    sourceType: {
        type: String,
        enum: ['photo', 'pinterest'],
        default: 'photo'
    },
    analysis: {
        type: String,
        required: true
    }
}, { _id: true });

const userSchema = new mongoose.Schema({
    telegramId: {
        type: Number,
        required: true,
        unique: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        default: ''
    },
    username: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    analysisHistory: [analysisHistorySchema]
});

module.exports = mongoose.model('User', userSchema); 