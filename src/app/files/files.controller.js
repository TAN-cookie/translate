const router = require('express').Router()

// service
const sEncryption = require('../../service/encryption.service')
const sFiles = require('../../service/files.service')
const sTranslation = require('../../service/translation.service')

// 로컬에 저장된 게임 파일 암호화/복호화 실행
router.route('/local')
    .post(async (req, res) => {
        try {
            const { filePath } = req.body
            if (!filePath) {
                return res.status(400).json({
                    success: false,
                    error: 'filePath가 필요합니다.'
                });
            }
            // 재귀적으로 모든 파일 탐색
            const allFiles = await sFiles.getAllFiles(filePath);
            // console.log(`총 ${allFiles.length}개 파일 발견`);
            for (const file of allFiles) {
                // 파일 읽기
                const fileBuffer = require('fs').readFileSync(file);
                // 암호화/복호화 처리
                const encryptionResult = sEncryption.gameFileEncode(fileBuffer);
                // action 결정
                const action = encryptionResult.wasEncrypted ? 'decrypt' : 'encrypt';
                // 파일명과 폴더 구조 처리
                const originalFileName = require('path').basename(file);
                const folderName = require('path').dirname(file) // 파일의 폴더 경로
                // 파일 출력
                const outputResult = sFiles.output(
                    encryptionResult.buffer,
                    originalFileName,
                    folderName,
                    action
                );
                console.log(`✅ ${originalFileName} → ${action} 완료 → ${outputResult.fileName}`);
            }

            res.status(200).json({
                success: true,
                message: `로컬 파일 ${allFiles.length}개의 파일이 암호화/복호화 요청을 성공적으로 처리되었습니다.`,
                inputPath: filePath,
                allFiles: allFiles,
            });
        } catch (e) {
            console.error('로컬 파일 암호화/복호화 오류:', e);
            res.status(400).json({
                success: false,
                error: '로컬 파일 암호화/복호화 중 오류가 발생했습니다: ' + e.message
            });
        }
    })

// 파일이 여러개로 업로드 할 수 있음
router.route('/upload')
    .post(sFiles.memory().array('files'), (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '업로드된 파일이 없습니다.'
                });
            }

            const results = [];
            for (const file of req.files) {
                try {
                    // 1. 암호화/복호화 처리
                    const encryptionResult = sEncryption.gameFileEncode(file.buffer);

                    // 2. action 결정 (wasEncrypted가 true면 복호화, false면 암호화)
                    const action = encryptionResult.wasEncrypted ? 'decrypt' : 'encrypt';

                    // 3. 파일 출력
                    const outputResult = sFiles.output(
                        encryptionResult.buffer,
                        file.originalname,
                        req.body.folder,
                        action
                    );

                    results.push({
                        success: true,
                        originalFile: file.originalname,
                        action: action,
                        wasEncrypted: encryptionResult.wasEncrypted,
                        nowEncrypted: encryptionResult.isEncrypted,
                        outputFile: outputResult.fileName,
                        folder: outputResult.folder,
                        fileSize: {
                            original: file.buffer.length,
                            processed: encryptionResult.buffer.length
                        }
                    });

                    console.log(`✅ ${file.originalname} → ${action} → ${outputResult.fileName}`);

                } catch (error) {
                    console.error(`❌ ${file.originalname} 처리 실패:`, error.message);
                    results.push({
                        success: false,
                        originalFile: file.originalname,
                        error: error.message
                    });
                }
            }

            const successCount = results.filter(r => r.success).length;

            res.json({
                success: true,
                message: `총 ${results.length}개 파일 중 ${successCount}개 처리 완료`,
                results: results
            });

        } catch (error) {
            console.error('파일 업로드 처리 오류:', error);
            res.status(400).json({
                success: false,
                error: '파일 업로드 처리 중 오류가 발생했습니다: ' + error.message
            });
        }
    })

module.exports = router
