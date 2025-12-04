// SERVER HEALTH CHECK
// Save this as check-server.js and run: node check-server.js

require('dotenv').config();
const mongoose = require('mongoose');

async function checkServer() {
    console.log('=== SERVER HEALTH CHECK ===\n');
    
    // 1. Check environment variables
    console.log('1. Environment Variables:');
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');
    console.log('   MONGODB_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing');
    console.log('   PORT:', process.env.PORT || 3000);
    
    // 2. Check MongoDB connection
    console.log('\n2. MongoDB Connection:');
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/socialsync';
        await mongoose.connect(mongoUri);
        console.log('   ✅ Connected to MongoDB');
        
        // 3. Check collections
        console.log('\n3. Database Collections:');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('   Available collections:');
        collections.forEach(c => console.log(`   - ${c.name}`));
        
        // 4. Check models
        console.log('\n4. Checking Models:');
        try {
            const User = require('./models/User');
            console.log('   ✅ User model loaded');
            
            const userCount = await User.countDocuments();
            console.log(`   - Users in DB: ${userCount}`);
        } catch (e) {
            console.error('   ❌ User model error:', e.message);
        }
        
        try {
            const Follow = require('./models/Follow');
            console.log('   ✅ Follow model loaded');
            
            const followCount = await Follow.countDocuments();
            console.log(`   - Follows in DB: ${followCount}`);
            
            // Check Follow schema
            console.log('   Follow schema fields:', Object.keys(Follow.schema.paths));
        } catch (e) {
            console.error('   ❌ Follow model error:', e.message);
        }
        
        try {
            const Post = require('./models/Post');
            console.log('   ✅ Post model loaded');
            
            const postCount = await Post.countDocuments();
            console.log(`   - Posts in DB: ${postCount}`);
        } catch (e) {
            console.error('   ❌ Post model error:', e.message);
        }
        
        try {
            const Notification = require('./models/Notification');
            console.log('   ✅ Notification model loaded');
            
            const notifCount = await Notification.countDocuments();
            console.log(`   - Notifications in DB: ${notifCount}`);
        } catch (e) {
            console.error('   ❌ Notification model error:', e.message);
        }
        
        // 5. Check Counter model
        console.log('\n5. Checking Counter Model:');
        try {
            const Counter = require('./models/Counter');
            console.log('   ✅ Counter model loaded');
            
            const counters = await Counter.find();
            console.log('   Counters:');
            counters.forEach(c => console.log(`   - ${c.name}: ${c.value}`));
        } catch (e) {
            console.error('   ❌ Counter model error:', e.message);
        }
        
        // 6. Test Follow creation
        console.log('\n6. Testing Follow Model:');
        try {
            const Follow = require('./models/Follow');
            const users = await mongoose.connection.db.collection('users').find().limit(2).toArray();
            
            if (users.length >= 2) {
                console.log('   Testing with users:', users.map(u => u.username).join(', '));
                
                // Try to create a test follow (don't save)
                const testFollow = new Follow({
                    follower: users[0]._id,
                    followee: users[1]._id
                });
                
                const validation = testFollow.validateSync();
                if (validation) {
                    console.error('   ❌ Validation error:', validation.message);
                } else {
                    console.log('   ✅ Follow model validation passed');
                }
            } else {
                console.log('   ⚠️  Need at least 2 users to test follow');
            }
        } catch (e) {
            console.error('   ❌ Follow test error:', e.message);
            console.error('   Stack:', e.stack);
        }
        
        await mongoose.connection.close();
        console.log('\n=== CHECK COMPLETE ===');
        
    } catch (error) {
        console.error('   ❌ MongoDB Error:', error.message);
        console.log('\n   Solutions:');
        console.log('   1. Make sure MongoDB is running');
        console.log('   2. Check MONGODB_URI in .env file');
        console.log('   3. Try: mongosh to test connection');
    }
}

checkServer().then(() => process.exit(0)).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});