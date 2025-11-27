const multer = require('multer');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

// 경로 정규화 공통 함수
function normalizePath(inputPath) {
    if (path.isAbsolute(inputPath)) {
        // 절대 경로인 경우 그대로 사용
        return path.resolve(inputPath);
    } else {
        // 상대 경로인 경우 baseDir과 결합
        const baseDir = path.join(__dirname, '../../../');
        return path.resolve(baseDir, inputPath);
    }
}


function memory() {
    return multer({ storage: multer.memoryStorage() });
}

// 파일 출력 함수 - 폴더별로 분류하여 저장
function output(value, originalName, folder, action) {
    try {
        // 기본 경로 (server.js와 같은 라인)
        const baseDir = path.join(__dirname, '../../../');
        // 폴더에 중복으로 baseDir를 사용하지 않도록 folder를 baseDir를 제외시키고 출력 예를 들어 baseDir가 C:\\DEV\\study\\nodejs\\ 라고 하고 folder가 C:\\DEV\\study\\nodejs\\encrypt\\심진기2.3.0\\Assets\\Texture\\FortuiousBigBG 올 경우
        const targetFolder = folder ? folder.replace(baseDir, '') : '';

        // action에 따라 폴더 결정 (decrypt 또는 encrypt)
        const timestamp = dayjs().format('YYYYMMDDHHmmss');

        const outputDir = path.join(baseDir, action, `${targetFolder || timestamp}`);
        // 폴더가 없으면 생성
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 파일명: timestamp-originalname
        const fileName = `${originalName}`;
        const filePath = path.join(outputDir, fileName);
        // buffer 인지, json 인지 확인
        if (Buffer.isBuffer(value)) {
            // 버퍼일 경우 파일 저장
            fs.writeFileSync(filePath, value);
        } else if (typeof value === 'object' && value !== null) {
            // JSON인 경우 파일로 저장
            fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
        } else if (typeof value === 'string') {
            fs.writeFileSync(filePath, value);
        }

        return {
            success: true,
            fileName: fileName,
            filePath: filePath,
            folder: action,
            size: fs.statSync(filePath).size,
        };

    } catch (error) {
        throw new Error(`파일 출력 실패: ${error.message}`);
    }
}

function readFolder(folder) {
    try {
        const folderPath = normalizePath(folder);

        if (!fs.existsSync(folderPath)) {
            throw new Error(`폴더가 존재하지 않습니다: ${folderPath}`);
        }

        const files = fs.readdirSync(folderPath);
        return files.map(file => path.join(folderPath, file));
    } catch (error) {
        throw new Error(`폴더 읽기 실패: ${error.message}`);
    }
}

function readFile(filePath) {
    try {
        const normalizedPath = normalizePath(filePath);

        if (!fs.existsSync(normalizedPath)) {
            throw new Error(`파일이 존재하지 않습니다: ${normalizedPath}`);
        }

        // 파일인지 폴더인지 구분 필요
        if (fs.lstatSync(normalizedPath).isDirectory()) {
            return {
                type: 'folder',
                content: readFolder(normalizedPath),
                path: normalizedPath
            };
        }

        return {
            type: 'file',
            content: fs.readFileSync(normalizedPath),
            path: normalizedPath,
            filename: path.basename(normalizedPath),
            size: fs.statSync(normalizedPath).size,
        }
    } catch (error) {
        throw new Error(`파일 읽기 실패: ${error.message}`);
    }
}

// Using Strategy Pattern for JSON file reading
async function readJson(filePath) {
    try {
        const normalizedPath = normalizePath(filePath);

        if (!fs.existsSync(normalizedPath)) {
            throw new Error(`파일이 존재하지 않습니다: ${normalizedPath}`);
        }

        const fileContent = fs.readFileSync(normalizedPath, 'utf8');
        // JSON 파싱 시 에러 처리
        const jsonContent = JSON.parse(fileContent);
        return {
            content: jsonContent,
            length: jsonContent.length,
            type: 'json',
            path: path.dirname(normalizedPath),
            filename: path.basename(normalizedPath),
            size: fs.statSync(normalizedPath).size,
        };

    } catch (error) {
        throw new Error(`JSON 파일 읽기 실패: ${error.message}`);
    }
}

// 폴더 생성 함수
function createFolder(folderPath) {
    try {
        const normalizedPath = normalizePath(folderPath);

        if (!fs.existsSync(normalizedPath)) {
            fs.mkdirSync(normalizedPath, { recursive: true });
            return `폴더가 생성되었습니다: ${normalizedPath}`;
        } else {
            return `폴더가 이미 존재합니다: ${normalizedPath}`;
        }
    } catch (error) {
        throw new Error(`폴더 생성 실패: ${error.message}`);
    }
}

// 재귀적으로 폴더를 탐색하여 모든 파일을 찾는 함수
async function getAllFiles(dirPath, fileList = []) {
    try {
        const normalizedPath = normalizePath(dirPath);

        if (!fs.existsSync(normalizedPath)) {
            throw new Error(`경로가 존재하지 않습니다: ${normalizedPath}`);
        }

        if (fs.lstatSync(normalizedPath).isFile()) {
            // 파일인 경우 바로 추가
            fileList.push(normalizedPath);
            return fileList;
        }

        // 폴더인 경우 내용물 탐색
        const items = fs.readdirSync(normalizedPath);

        for (const item of items) {
            const fullPath = path.join(normalizedPath, item);
            const stat = fs.lstatSync(fullPath);

            if (stat.isDirectory()) {
                // 폴더인 경우 재귀 호출
                await getAllFiles(fullPath, fileList);
            } else if (stat.isFile()) {
                // 파일인 경우 리스트에 추가
                fileList.push(fullPath)
            }
        }

        return fileList;
    } catch (error) {
        throw new Error(`파일 탐색 실패: ${error.message}`);
    }
}


let regexPatterns = null;
async function getRegexText() {
    // regexPatterns가 null인 경우에만 파일에서 읽기
    if (!regexPatterns) {
        const regexPath = readFile('translate/regex/_AutoGeneratedTranslations_regex.txt');
        console.log(regexPath)
        // if (regexPath.type === 'file' && fs.existsSync(regexPath.path)) {
        //     regexPatterns = { path: regexPath.path, pattern: fs.readFileSync(regexPath.path, 'utf8') };
        // }
    }
    return regexPatterns || '';
}
/**
 * 한글이 포함되어 있는지 확인
 * @param {string} text
 * @returns {boolean}
 */
function containsKorean(text) {
    if (typeof text !== 'string') return false;
    return /[가-힣]/.test(text);
}

/**
 * 객체 내에서 한글이 포함된 키들을 찾아 반환
 * @param {Object} obj - 검사할 객체
 * @returns {string[]} - 한글이 포함된 키 배열
 */
function findKoreanKeys(obj) {
    if (!obj || typeof obj !== 'object') return [];

    const koreanKeys = new Set();

    for (const [key, value] of Object.entries(obj)) {
        if (containsKorean(value)) {
            koreanKeys.add(key);
        }
    }

    return Array.from(koreanKeys);
}

/**
 * 베이스 폴더 내 모든 JSON 파일을 스캔하여 한글이 포함된 키를 가진 파일 목록 생성
 * @param {string} baseFolder - 기본 폴더 경로
 * @param {string} addKey - 추가할 키 (선택)
 * @returns {Promise<Object>} - files.json에 저장될 데이터
 */
async function scanFolderForKoreanKeys(baseFolder, addKey = null) {
    try {
        const normalizedBase = normalizePath(baseFolder);
        const allFiles = await getAllFiles(normalizedBase);
        const result = {
            baseFolder: baseFolder,
            scannedAt: new Date().toISOString(),
            files: []
        };

        for (const filePath of allFiles) {
            // JSON 파일만 처리
            if (!filePath.endsWith('.json')) continue;

            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(fileContent);

                // 배열인 경우 첫 번째 객체에서 키 탐색
                const sampleObj = Array.isArray(jsonData) && jsonData.length > 0
                    ? jsonData[0]
                    : jsonData;

                // 'ch' 키 존재 여부 확인 및 한글 키 찾기
                let hasCh = false;
                let koreanKeys = new Set();

                if (Array.isArray(jsonData)) {
                    for (const item of jsonData) {
                        if (item && typeof item === 'object') {
                            if ('ch' in item) {
                                hasCh = true;
                            }
                            const keys = findKoreanKeys(item);
                            // 'kr' 키는 제외
                            keys.filter(k => k !== 'kr').forEach(k => koreanKeys.add(k));
                        }
                    }
                } else if (jsonData && typeof jsonData === 'object') {
                    if ('ch' in jsonData) {
                        hasCh = true;
                    }
                    // 'kr' 키는 제외
                    findKoreanKeys(jsonData).filter(k => k !== 'kr').forEach(k => koreanKeys.add(k));
                }

                const textKeys = Array.from(koreanKeys);

                // ch가 있거나 한글 키가 있는 경우에만 추가
                if (hasCh || textKeys.length > 0) {
                    // baseFolder 기준 상대 경로로 변환
                    let relativePath = filePath.replace(normalizedBase, '').replace(/\\/g, '/');
                    // 앞의 슬래시 제거
                    relativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;

                    const fileEntry = {
                        path: relativePath,
                        textKeys: hasCh ? ['ch', ...textKeys.filter(k => k !== 'ch')] : textKeys
                    };

                    // 'ch' 키가 존재하는 경우에만 addKey를 'kr'로 설정
                    if (hasCh) {
                        fileEntry.addKey = 'kr';
                    }

                    result.files.push(fileEntry);
                }
            } catch (parseError) {
                // JSON 파싱 실패 시 건너뛰기
                console.warn(`JSON 파싱 실패: ${filePath}`, parseError.message);
            }
        }

        return result;
    } catch (error) {
        throw new Error(`폴더 스캔 실패: ${error.message}`);
    }
}

/**
 * files.json 파일 저장
 * @param {Object} data - 저장할 데이터
 * @param {string} outputPath - 출력 경로 (기본: json/ggfh/files.json)
 */
function saveFilesJson(data, outputPath = 'json/ggfh/files.json') {
    try {
        const normalizedPath = normalizePath(outputPath);
        const dir = path.dirname(normalizedPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(normalizedPath, JSON.stringify(data, null, 2), 'utf8');
        return normalizedPath;
    } catch (error) {
        throw new Error(`files.json 저장 실패: ${error.message}`);
    }
}

module.exports = {
    normalizePath,
    memory,
    output,
    readFolder,
    readFile,
    readJson,
    createFolder,
    getAllFiles,
    getRegexText,
    containsKorean,
    findKoreanKeys,
    scanFolderForKoreanKeys,
    saveFilesJson,
}