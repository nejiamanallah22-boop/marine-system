const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

router.post('/login', AuthController.login);
router.post('/register', AuthController.register);
router.get('/me', AuthController.me);

module.exports = router;
