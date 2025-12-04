const adminAuth = (req, res, next) => {
  const adminUsernames = process.env.ADMIN_USERNAMES?.split(',').map(u => u.trim()) || [];
  
  console.log('🔐 Admin check:', {
    user: req.user?.username,
    admins: adminUsernames,
    isAdmin: adminUsernames.includes(req.user?.username)
  });
  
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  if (!adminUsernames.includes(req.user.username)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

module.exports = adminAuth;


