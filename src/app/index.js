const router = require('express').Router()

// 컨트롤러
const filesCtrl = require('./files/files.controller')
router.use('/files', filesCtrl)

const translationCtrl = require('./translation/translation.controller')
router.use('/translation', translationCtrl)

module.exports = router
