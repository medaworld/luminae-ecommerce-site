const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth');
const isAuth = require('../middleware/is-auth');

// /sign-in => GET
router.get('/login', authController.getLogIn);

// /register=> GET
router.get('/registration', authController.getRegistration);

// /sign-in => POST
router.post('/login', authController.postLogIn);

// /register=> POST
router.post('/registration', authController.postRegistration);

// /logout => POST
router.post('/logoutuser', authController.postLogOut);

// /user => GET
router.get('/user/:userId', isAuth, authController.getUser);

// /user/orders => GET
router.get('/user/:userId/orders', isAuth, authController.getOrders);

module.exports = router;
