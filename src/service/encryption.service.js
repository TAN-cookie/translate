// service
const sFiles = require('./files.service');

// 게임 파일 암호화/복호화 설정
const s1 = ",.?<aH.5:.L;_=-A%K/DF4s";
const s2 = "1b8bg-/%ePe]P[-/921CG";
const s3 = "\0";

// 게임 파일 암호화/복호화 함수
function gameFileEncode(buffer) {
    let currentS2 = s2;

    // s3와 s2 substring(1)을 붙인 값이 파일 앞과 같으면 s2의 첫글자 교체
    const prefixCheck = s3 + s2.substring(1);
    let prefixMatches = true;
    for (let i = 0; i < prefixCheck.length && i < buffer.length; i++) {
        if (buffer[i] !== prefixCheck.charCodeAt(i)) {
            prefixMatches = false;
            break;
        }
    }

    if (prefixMatches) {
        currentS2 = s3 + s2.substring(1);
    }

    // 프리픽스(currentS2)가 정확히 붙어있으면 암호화되어있는 상태로 간주
    let isEncrypted = true;
    for (let i = 0; i < currentS2.length && i < buffer.length; i++) {
        if (buffer[i] !== currentS2.charCodeAt(i)) {
            isEncrypted = false;
            break;
        }
    }

    // 처리할 바이트 배열 크기 계산
    const newSize = buffer.length + (isEncrypted ? -currentS2.length : currentS2.length);
    const processedBytes = Buffer.alloc(newSize);

    if (isEncrypted) {
        // 복호화: 프리픽스 제거하고 바이트 연산
        for (let i = 0; i < buffer.length - currentS2.length; i++) {
            const originalByte = buffer[i + currentS2.length];
            const keyByte = s1.charCodeAt(i % s1.length);
            processedBytes[i] = (originalByte - keyByte + 256) % 256;
        }
    } else {
        // 암호화: 프리픽스 추가하고 바이트 연산
        // 프리픽스 추가
        for (let i = 0; i < currentS2.length; i++) {
            processedBytes[i] = currentS2.charCodeAt(i);
        }
        // 바이트 연산
        for (let i = 0; i < buffer.length; i++) {
            const originalByte = buffer[i];
            const keyByte = s1.charCodeAt(i % s1.length);
            processedBytes[i + currentS2.length] = (originalByte + keyByte) % 256;
        }
    }

    return {
        buffer: processedBytes,
        isEncrypted: !isEncrypted, // 처리 후 상태
        wasEncrypted: isEncrypted   // 처리 전 상태
    };
}
module.exports = {
    gameFileEncode
};
