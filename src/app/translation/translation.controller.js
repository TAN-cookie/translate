const router = require('express').Router()

// service
const sFiles = require('../../service/files.service')
const sTranslation = require('../../service/translation.service')

// 실패한 번역 다시 시도
router.route('/local/retry')
    .post(async (req, res) => {
        try {

        } catch (e) {
            console.error('재시도 오류:', e);
            res.status(500).json({
                success: false,
                error: '재시도 중 오류가 발생했습니다: ' + e.message
            });
        }
    })

// 로컬 번역 완료
router.route('/local/complete')
    .post(async (req, res) => {
        try {

            const { filename } = req.body
            if (!filename) {
                return res.status(400).json({
                    success: false,
                    error: 'filename이 필요합니다.'
                });
            }
            // decrypt/translated 경로부터 시작
            // console.log(completeTranslation('decrypt/translated/Mod_심진기2.3.0/ModExcel/patch_drama/RoleLogLocal.json'))
            const translatedData = await sTranslation.completeTranslation(filename)

            res.status(200).json(translatedData)
        } catch (e) {
            console.error('완료 오류:', e);
            res.status(500).json({
                success: false,
                error: '완료 중 오류가 발생했습니다: ' + e.message
            });

        }
    })
// 로컬 폴더 전체 번역 완료
router.route('/local/complete/folder')
    .post(async (req, res) => {
        try {

            const { folderPath } = req.body
            if (!folderPath) {
                return res.status(400).json({
                    success: false,
                    error: 'folderPath가 필요합니다.'
                });
            }

            await sTranslation.completeTranslationFolders(folderPath)

            res.status(200).json({ success: true })
        } catch (e) {
            console.error('완료 오류:', e);
            res.status(500).json({
                success: false,
                error: '완료 중 오류가 발생했습니다: ' + e.message
            });

        }
    })

// 번역 시작
router.route('/local/active')
    .post(async (req, res) => {
        try {
            // decrypt 경로부터 시작
            const { filename, originKey, targetKey, translatedFile, oldJsonFile, useAi = true } = req.body
            // console.log(jsonTranslate('decrypt/Mod_심진기2.3.0/ModExcel/patch_drama/RoleLogLocal.json'));
            // const translatedData = await sTranslation.jsonTranslate(filename, translatedFile, originKey, targetKey)

            // 사용 예시
            // translateCompareBatch({
            //     newJsonPath: 'decrypt/Mod_심진기2.4.4/ModExcel/patch_item/DramaDialogue.json',
            //     // newJsonPath: 'decrypt/translated/Mod_심진기2.4.4/ModExcel/patch_feature/Complete_RoleCreateFeature.json',
            //     oldJsonPath: 'lagacy/Mod_심진기2.0.0/ModExcel/patch_item/DramaDialogue.json',
            //     idKey: 'id',
            //     textKey: 'dialogue',
            //     // addKey: 'kr'
            // });
            const translatedData = await sTranslation.translateCompareBatch(
                {
                    newJsonPath: filename,
                    oldJsonPath: oldJsonFile,
                    idKey: 'id',
                    textKey: originKey,
                    addKey: targetKey,
                    useAi: useAi
                })

            res.status(200).json(translatedData)
        } catch (e) {
            console.error('활성화 오류:', e);
            res.status(500).json({
                success: false,
                error: '활성화 중 오류가 발생했습니다: ' + e.message
            });

        }
    })

// JSON 파일 비교 및 번역
router.route('/compare')
    .post(async (req, res) => {
        try {
            const { legacyPath, decryptPath } = req.body;

            if (!legacyPath || !decryptPath) {
                return res.status(400).json({
                    success: false,
                    error: 'legacyPath와 decryptPath가 필요합니다.'
                });
            }
            // console.log(readFolder('decrypt/Mod_심진기/ModExcel/patch_drama'))
            // 파일 존재 확인
            const fullLegacyPath = path.join(__dirname, '../../../', legacyPath);
            const fullDecryptPath = path.join(__dirname, '../../../', decryptPath);

            if (!fs.existsSync(fullLegacyPath)) {
                return res.status(404).json({
                    success: false,
                    error: `Legacy 파일을 찾을 수 없습니다: ${legacyPath}`
                });
            }

            if (!fs.existsSync(fullDecryptPath)) {
                return res.status(404).json({
                    success: false,
                    error: `Decrypt 파일을 찾을 수 없습니다: ${decryptPath}`
                });
            }

            // JSON 파일 읽기
            const legacyData = JSON.parse(fs.readFileSync(fullLegacyPath, 'utf8'));
            const decryptData = JSON.parse(fs.readFileSync(fullDecryptPath, 'utf8'));

            // 비교 및 번역 실행
            console.log('📋 JSON 파일 비교 및 번역 시작...');


        } catch (error) {
            console.error('번역 비교 오류:', error);
            res.status(500).json({
                success: false,
                error: '번역 비교 중 오류가 발생했습니다: ' + error.message
            });
        }
    })

/**
 * 폴더 읽고, files.json에 저장
 * 기본 베이스 폴더 경로 baseFolder = decrypt/Mod_심진기2.4.4/ModExcel
 * path: 폴더 경로 예) baseFolder/files.path = decrypt/Mod_심진기2.4.4/ModExcel/patch_all/DramaDialogue.json
 * textKeys: 번역할 키 배열 예) ['dialogue', 'option1', 'option2']
 * addKey: 추가할 키 예) 'kr'
 */
router.route('/local/folder/read')
    .post(async (req, res) => {
        try {
            const { baseFolder } = req.body;

            if (!baseFolder) {
                return res.status(400).json({
                    success: false,
                    error: 'baseFolder가 필요합니다.'
                });
            }

            // 폴더 스캔하여 한글 키가 포함된 파일 목록 생성
            const scanResult = await sFiles.scanFolderForKoreanKeys(baseFolder);

            // files.json에 저장
            const savedPath = sFiles.saveFilesJson(scanResult);

            res.status(200).json({
                success: true,
                message: `${scanResult.files.length}개의 파일이 스캔되었습니다.`,
                savedPath: savedPath,
                data: scanResult
            });
        } catch (e) {
            console.error('폴더 읽기 오류:', e);
            res.status(500).json({
                success: false,
                error: '폴더 읽기 중 오류가 발생했습니다: ' + e.message
            });
        }
    })

/**
 * files.json을 읽어서 순차적으로 번역 실행
 * filesJsonPath: files.json 경로 (기본: json/ggfh/files.json)
 * oldBasePath: 이전 버전 폴더 경로 (optional, 비교 번역용)
 * useAi: AI 사용 여부 (기본: true)
 */
router.route('/local/folder/translate')
    .post(async (req, res) => {
        try {
            const { filesJsonPath = 'json/ggfh/files.json', oldBasePath = null, useAi = true } = req.body;

            console.log(`📂 files.json 기반 번역 시작: ${filesJsonPath}`);

            const result = await sTranslation.translateFromFilesJson(filesJsonPath, oldBasePath, useAi);

            res.status(200).json({
                success: true,
                message: `번역 완료: 총 ${result.total}개 중 ${result.success}개 성공, ${result.failed}개 실패`,
                data: result
            });
        } catch (e) {
            console.error('폴더 번역 오류:', e);
            res.status(500).json({
                success: false,
                error: '폴더 번역 중 오류가 발생했습니다: ' + e.message
            });
        }
    })

module.exports = router
