const express = require('express');
const workspaceController = require('../../controllers/workspaceController');
const { ensureLoggedIn } = require('../../middleware/auth');

const router = express.Router();

router.get('/', ensureLoggedIn, workspaceController.list);
router.post('/', ensureLoggedIn, workspaceController.create);
router.get('/:id', ensureLoggedIn, workspaceController.get);
router.put('/:id', ensureLoggedIn, workspaceController.update);
router.delete('/:id', ensureLoggedIn, workspaceController.remove);
router.get('/:id/status', ensureLoggedIn, workspaceController.getStatus);
router.post('/:id/connect', ensureLoggedIn, workspaceController.connect);
router.post('/:id/disconnect', ensureLoggedIn, workspaceController.disconnect);

module.exports = router;
