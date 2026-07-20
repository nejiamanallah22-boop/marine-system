const express = require('express');
const router = express.Router();
const VesselController = require('../controllers/vesselController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, VesselController.getAll);
router.post('/', authenticate, authorize('مسؤول', 'محرر'), VesselController.create);
router.put('/:id', authenticate, authorize('مسؤول', 'محرر'), VesselController.update);
router.delete('/:id', authenticate, authorize('مسؤول'), VesselController.delete);

module.exports = router;
