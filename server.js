require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
const Post = require('./models/Post');
const Message = require('./models/Message');
const Friendship = require('./models/Friendship');
const Document = require('./models/Document');
const Listing = require('./models/Listing');
const GameRoom = require('./models/GameRoom');
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(cors({
    origin: ['http://localhost:5500' 'https://diverse-frontend.vercel.app/index.html'], // Add your Vercel URL here later
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Database connection error:', err));

// --- API ROUTES ---

// POST: /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, terms } = req.body;

        if (!name || !email || password.length < 8 || terms !== 'on') {
            return res.status(400).json({ error: "Enter a valid name and email, use a password of at least 8 characters, and accept the terms." });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        await User.create({
            name,
            email: email.toLowerCase(),
            passwordHash
        });

        res.status(201).json({ created: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "The server could not complete this request." });
    }
});

// POST: /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: "Email or password is incorrect." });
        }

        const token = jwt.sign(
            { userId: user._id, role: 'user', email: user.email }, 
            process.env.JWT_SECRET, 
            { expiresIn: '8h' }
        );

        res.cookie('dv_session', token, { 
            httpOnly: true, 
            sameSite: 'lax', // Use 'none' and secure: true when deploying to production with HTTPS
            maxAge: 8 * 60 * 60 * 1000 
        });

        res.status(200).json({ signedIn: true, appealRequired: user.isBanned });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "The server could not complete this request." });
    }
});

// GET: /api/auth/me (Check session)
app.get('/api/auth/me', async (req, res) => {
    try {
        const token = req.cookies.dv_session;
        if (!token) return res.status(401).json({ error: "Please sign in to access your homepage." });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) return res.status(401).json({ error: "This account is no longer available. Please sign in again." });
        if (user.isBanned) return res.status(403).json({ error: "This account is banned. Submit an appeal to request a review." });

        res.status(200).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                pictureUrl: user.pictureUrl,
                isBanned: user.isBanned,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        res.status(401).json({ error: "Please sign in to access your homepage." });
    }
});

// --- AUTH MIDDLEWARE ---
const requireAuth = async (req, res, next) => {
    try {
        const token = req.cookies.dv_session;
        if (!token) return res.status(401).json({ error: "Please sign in." });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId);
        if (!req.user) throw new Error();
        next();
    } catch (err) {
        res.status(401).json({ error: "Please sign in." });
    }
};

// --- PROFILE ROUTES ---
app.get('/api/profile/me', requireAuth, async (req, res) => {
    res.status(200).json({
        profile: {
            name: req.user.name,
            email: req.user.email,
            bio: req.user.bio,
            skills: req.user.skills,
            pictureUrl: req.user.pictureUrl,
            createdAt: req.user.createdAt
        }
    });
});

app.post('/api/profile/update', requireAuth, async (req, res) => {
    try {
        const { name, bio, skills } = req.body;
        req.user.name = name;
        req.user.bio = bio;
        req.user.skills = skills;
        await req.user.save();
        res.status(200).json({ saved: true });
    } catch (err) {
        res.status(500).json({ error: "Could not update profile." });
    }
});

app.post('/api/profile/picture', requireAuth, async (req, res) => {
    try {
        const { mediaBase64, mediaContentType } = req.body;
        if (!mediaBase64) return res.status(400).json({ error: "No image provided." });

        const dataUri = `data:${mediaContentType};base64,${mediaBase64}`;
        const uploadRes = await cloudinary.uploader.upload(dataUri, { folder: "diverse/profiles" });
        
        req.user.pictureUrl = uploadRes.secure_url;
        await req.user.save();
        res.status(200).json({ saved: true, pictureUrl: uploadRes.secure_url });
    } catch (err) {
        res.status(500).json({ error: "Could not upload picture." });
    }
});

app.delete('/api/profile/picture', requireAuth, async (req, res) => {
    req.user.pictureUrl = null;
    await req.user.save();
    res.status(200).json({ removed: true });
});

// --- POST ROUTES ---
app.post('/api/posts', requireAuth, async (req, res) => {
    try {
        const { content, mediaBase64, mediaContentType } = req.body;
        let mediaUrl = null;

        if (mediaBase64) {
            const dataUri = `data:${mediaContentType};base64,${mediaBase64}`;
            const uploadRes = await cloudinary.uploader.upload(dataUri, { 
                folder: "diverse/posts",
                resource_type: "auto" // Automatically handles both images and videos
            });
            mediaUrl = uploadRes.secure_url;
        }

        await Post.create({
            userId: req.user._id,
            content,
            mediaUrl,
            mediaContentType
        });

        res.status(201).json({ posted: true });
    } catch (err) {
        res.status(500).json({ error: "Could not publish post." });
    }
});

app.get('/api/posts', requireAuth, async (req, res) => {
    try {
        const posts = await Post.find().populate('userId', 'name email').sort({ createdAt: -1 }).limit(100);
        
        const formattedPosts = posts.map(post => ({
            id: post._id,
            content: post.content,
            author: post.userId?.name || 'Unknown User', // Added fallback to prevent crashes
            authorEmail: post.userId?.email || 'Unknown',
            mediaContentType: post.mediaContentType,
            mediaUrl: post.mediaUrl,
            likeCount: post.likes.length,
            likedByMe: post.likes.includes(req.user._id),
            commentCount: post.comments.length,
            createdAt: post.createdAt
        }));

        res.status(200).json({ posts: formattedPosts });
    } catch (err) {
        console.error("Posts Fetch Error:", err); // Will show the exact error in your VS Code terminal
        res.status(500).json({ error: "Could not fetch posts." });
    }
});

app.post('/api/posts/like', requireAuth, async (req, res) => {
    try {
        const { postId } = req.body;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found." });

        const index = post.likes.indexOf(req.user._id);
        let liked = false;
        if (index === -1) {
            post.likes.push(req.user._id);
            liked = true;
        } else {
            post.likes.splice(index, 1);
        }
        await post.save();

        res.status(200).json({ liked, likeCount: post.likes.length });
    } catch (err) {
        res.status(500).json({ error: "Could not like post." });
    }
});

app.post('/api/posts/comments', requireAuth, async (req, res) => {
    try {
        const { postId, content } = req.body;
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ error: "Post not found." });

        post.comments.push({ userId: req.user._id, content });
        await post.save();
        res.status(201).json({ commented: true });
    } catch (err) {
        res.status(500).json({ error: "Could not post comment." });
    }
});

app.get('/api/posts/comments', requireAuth, async (req, res) => {
    try {
        const { postId } = req.query;
        const post = await Post.findById(postId).populate('comments.userId', 'name');
        if (!post) return res.status(404).json({ error: "Post not found." });

        const formattedComments = post.comments.map(c => ({
            id: c._id,
            content: c.content,
            author: c.userId.name,
            createdAt: c.createdAt
        })).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.status(200).json({ comments: formattedComments });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch comments." });
    }
});

// POST: /api/logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('dv_session');
    res.status(200).json({ signedOut: true });
});

// --- CHAT & FRIENDS ROUTES ---

// Check unread messages on page load
app.get('/api/chat/unread', requireAuth, async (req, res) => {
    try {
        const count = await Message.countDocuments({ recipientId: req.user._id, isRead: false });
        const latest = await Message.findOne({ recipientId: req.user._id, isRead: false })
            .sort({ createdAt: -1 })
            .populate('senderId', 'name');

        res.status(200).json({
            count,
            latest: latest ? {
                id: latest._id,
                content: latest.content,
                senderName: latest.senderId.name,
                createdAt: latest.createdAt
            } : null
        });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch unread messages." });
    }
});

// Load friends list
app.get('/api/friends', requireAuth, async (req, res) => {
    try {
        const friendships = await Friendship.find({
            $or: [{ requesterId: req.user._id }, { addresseeId: req.user._id }],
            status: 'accepted'
        }).populate('requesterId addresseeId', 'name email pictureUrl');

        const friends = friendships.map(f => {
            const friend = f.requesterId._id.equals(req.user._id) ? f.addresseeId : f.requesterId;
            return { id: friend._id, name: friend.name, email: friend.email, pictureUrl: friend.pictureUrl };
        });

        res.status(200).json({ friends });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch friends." });
    }
});

// Load pending friend requests
app.get('/api/friends/requests', requireAuth, async (req, res) => {
    try {
        const requests = await Friendship.find({ addresseeId: req.user._id, status: 'pending' })
            .populate('requesterId', 'name email pictureUrl');

        const formattedRequests = requests.map(f => ({
            id: f._id,
            userId: f.requesterId._id,
            name: f.requesterId.name,
            email: f.requesterId.email,
            pictureUrl: f.requesterId.pictureUrl
        }));

        res.status(200).json({ requests: formattedRequests });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch requests." });
    }
});

// --- PDF LIBRARY ROUTES ---
app.post('/api/documents', requireAuth, async (req, res) => {
    try {
        const { fileName, contentBase64 } = req.body;
        if (!contentBase64 || !fileName) return res.status(400).json({ error: "Invalid file." });

        const dataUri = `data:application/pdf;base64,${contentBase64}`;
        const uploadRes = await cloudinary.uploader.upload(dataUri, { 
            folder: "diverse/docs",
            resource_type: "auto"
        });

        const doc = await Document.create({
            userId: req.user._id,
            fileName,
            fileUrl: uploadRes.secure_url
        });

        res.status(201).json({ uploaded: true, id: doc._id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not upload document." });
    }
});

app.get('/api/documents', requireAuth, async (req, res) => {
    try {
        const documents = await Document.find().populate('userId', 'name').sort({ createdAt: -1 }).limit(100);
        
        const formattedDocs = documents.map(doc => ({
            id: doc._id,
            fileName: doc.fileName,
            uploader: doc.userId?.name || 'Unknown',
            createdAt: doc.createdAt
        }));

        res.status(200).json({ documents: formattedDocs });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch documents." });
    }
});

app.get('/api/documents/:id/download', async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).send("Document not found");
        res.redirect(doc.fileUrl);
    } catch (err) {
        res.status(500).send("Error downloading document");
    }
});

// --- MARKETPLACE ROUTES ---
app.post('/api/marketplace', requireAuth, async (req, res) => {
    try {
        const { category, title, description, price, mediaBase64, mediaContentType } = req.body;
        let mediaUrl = null;

        if (mediaBase64) {
            const dataUri = `data:${mediaContentType};base64,${mediaBase64}`;
            const uploadRes = await cloudinary.uploader.upload(dataUri, { 
                folder: "diverse/marketplace",
                resource_type: "auto" 
            });
            mediaUrl = uploadRes.secure_url;
        }

        await Listing.create({
            userId: req.user._id,
            category,
            title,
            description,
            price: price || null,
            mediaUrl,
            mediaContentType
        });

        res.status(201).json({ created: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not publish listing." });
    }
});

app.get('/api/marketplace', requireAuth, async (req, res) => {
    try {
        const listings = await Listing.find().populate('userId', 'name email').sort({ createdAt: -1 }).limit(100);
        
        const formattedListings = listings.map(list => ({
            id: list._id,
            category: list.category,
            title: list.title,
            description: list.description,
            price: list.price,
            seller: list.userId?.name || 'Unknown',
            sellerEmail: list.userId?.email || 'Unknown',
            mediaContentType: list.mediaContentType,
            mediaUrl: list.mediaUrl,
            createdAt: list.createdAt
        }));

        res.status(200).json({ listings: formattedListings });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch listings." });
    }
});

// --- GAME ROOM ROUTES ---

app.get('/api/games/rooms', requireAuth, async (req, res) => {
    try {
        const rooms = await GameRoom.find({ status: 'waiting' })
            .populate('hostId', 'name')
            .sort({ createdAt: -1 })
            .limit(40);
            
        res.status(200).json({ rooms: rooms.map(r => ({
            code: r.code,
            game: r.game,
            stakeCredits: r.stakeCredits,
            hostName: r.hostId?.name || 'Unknown',
            createdAt: r.createdAt
        }))});
    } catch (err) {
        res.status(500).json({ error: "Could not fetch rooms." });
    }
});

app.get('/api/games/wallet', requireAuth, async (req, res) => {
    res.status(200).json({ balance: req.user.creditBalance });
});

app.post('/api/games/create', requireAuth, async (req, res) => {
    try {
        const { game, stakeCredits, state } = req.body;
        if (!['chess', 'snooker', 'ludo', 'whot'].includes(game)) return res.status(400).json({ error: "Invalid game." });
        if (req.user.creditBalance < stakeCredits) return res.status(400).json({ error: "Not enough credits." });

        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await GameRoom.create({
            code,
            game,
            hostId: req.user._id,
            stakeCredits,
            stateJson: JSON.stringify(state)
        });

        res.status(201).json({ code, game, revision: 1, stakeCredits });
    } catch (err) {
        res.status(500).json({ error: "Could not create game room." });
    }
});

app.post('/api/games/join', requireAuth, async (req, res) => {
    try {
        const { code } = req.body;
        const room = await GameRoom.findOne({ code, status: 'waiting' }).populate('hostId');
        if (!room) return res.status(404).json({ error: "Room unavailable." });
        if (room.hostId._id.equals(req.user._id)) return res.status(400).json({ error: "Cannot join your own room." });

        if (req.user.creditBalance < room.stakeCredits || room.hostId.creditBalance < room.stakeCredits) {
            return res.status(400).json({ error: "Insufficient credits for this table." });
        }

        // Deduct stakes
        if (room.stakeCredits > 0) {
            req.user.creditBalance -= room.stakeCredits;
            room.hostId.creditBalance -= room.stakeCredits;
            await req.user.save();
            await room.hostId.save();
        }

        room.guestId = req.user._id;
        room.status = 'active';
        room.revision += 1;
        await room.save();

        res.status(200).json({ joined: true, code });
    } catch (err) {
        res.status(500).json({ error: "Could not join room." });
    }
});

app.get('/api/games/room', requireAuth, async (req, res) => {
    try {
        const room = await GameRoom.findOne({ code: req.query.code })
            .populate('hostId guestId', 'name');
        if (!room) return res.status(404).json({ error: "Room not found." });

        res.status(200).json({ room: {
            code: room.code,
            game: room.game,
            status: room.status,
            state: JSON.parse(room.stateJson),
            stakeCredits: room.stakeCredits,
            hostResult: room.hostResult,
            guestResult: room.guestResult,
            settledAt: room.settledAt,
            payoutCredits: room.payoutCredits,
            sinkCredits: room.sinkCredits,
            revision: room.revision,
            hostId: room.hostId._id,
            guestId: room.guestId?._id,
            hostName: room.hostId.name,
            guestName: room.guestId?.name,
            myId: req.user._id
        }});
    } catch (err) {
        res.status(500).json({ error: "Could not fetch room." });
    }
});

app.post('/api/games/state', requireAuth, async (req, res) => {
    try {
        const { code, revision, state } = req.body;
        const room = await GameRoom.findOne({ code, status: 'active' });
        
        if (!room || room.revision !== revision) return res.status(409).json({ error: "Game state mismatch. Refresh the room." });

        room.stateJson = JSON.stringify(state);
        room.revision += 1;
        await room.save();

        res.status(200).json({ revision: room.revision });
    } catch (err) {
        res.status(500).json({ error: "Could not update state." });
    }
});

app.post('/api/games/result', requireAuth, async (req, res) => {
    try {
        const { code, result } = req.body;
        const room = await GameRoom.findOne({ code, status: 'active' }).populate('hostId guestId');
        if (!room) return res.status(404).json({ error: "Room not active." });

        const isHost = room.hostId._id.equals(req.user._id);
        if (isHost) room.hostResult = result;
        else room.guestResult = result;
        
        room.revision += 1;
        let settled = false;

        // Both players submitted the same result
        if (room.hostResult !== null && room.guestResult !== null && room.hostResult === room.guestResult) {
            room.status = 'finished';
            room.settledAt = new Date();
            settled = true;

            if (room.stakeCredits > 0) {
                if (room.hostResult === 2) { // Draw - Refund
                    room.hostId.creditBalance += room.stakeCredits;
                    room.guestId.creditBalance += room.stakeCredits;
                } else { // Win - Payout
                    const winner = room.hostResult === 0 ? room.hostId : room.guestId;
                    room.payoutCredits = (room.stakeCredits * 18) / 10; // 90% payout
                    room.sinkCredits = (room.stakeCredits * 2) - room.payoutCredits; // 10% sink
                    winner.creditBalance += room.payoutCredits;
                }
                await room.hostId.save();
                await room.guestId.save();
            }
        }

        await room.save();
        res.status(200).json({ 
            settled, 
            hostResult: room.hostResult, 
            guestResult: room.guestResult,
            payoutCredits: room.payoutCredits,
            sinkCredits: room.sinkCredits
        });
    } catch (err) {
        res.status(500).json({ error: "Could not submit result." });
    }
});

const PORT = process.env.PORT || 8765;
app.listen(PORT, () => console.log(`DI-VERSE Express API running on port ${PORT}`));
