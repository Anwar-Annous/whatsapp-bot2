const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');

router.get('/status', apiController.getStatus);
router.get('/qr', apiController.getQr);
router.get('/conversations', apiController.getConversations);
router.get('/conversations/:id/messages', apiController.getMessages);
router.post('/conversations/:id/reply', apiController.sendReply);
router.post('/conversations/:id/close', apiController.closeConversation);
router.get('/contacts', apiController.getContacts);
router.post('/contacts/:id', apiController.updateContact);
router.get('/automation', apiController.getAutomation);
router.post('/automation', apiController.saveAutomation);
router.get('/metrics', apiController.getMetrics);
router.post('/campaign', apiController.sendCampaign);
router.get('/media', apiController.getMedia);
router.get('/logs', apiController.getLogs);
router.get('/search', apiController.searchContacts);

module.exports = router;
