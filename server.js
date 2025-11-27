const express = require('express');
const cors = require('cors');
require('dotenv').config()

const app = express();
const PORT = process.env.PORT || 2060;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Main router
const Router = require('./src/app');
app.use('/api/v1', Router);

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
    console.log('기능:');
    console.log('- 파일 암호화/복호화');
    console.log('- 게임 텍스트 번역');
});