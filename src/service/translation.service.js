const { GoogleGenAI, createUserContent, createPartFromUri, createPartFromText } = require('@google/genai'); // ESM import
const sFiles = require('./files.service');
const fs = require('fs')
const crypto = require('crypto')
const path = require('path'); // 목적: 경로 안전 처리


const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_PROCTA411,
    model: 'gemini-3-pro-preview'
})

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Using DI Pattern to inject secret

const glossary = require('../../../json/ggfh/glossary.json'); // Load glossary from JSON file

// Using Factory Pattern for constant-time glossary existence check => 한글로 번역 : "상수 시간 용어집 존재 확인을 위한 팩토리 패턴 사용"
function createGlossaryChecker(glossary = []) {
    const set = new Set(glossary.map(g => g?.original).filter(v => typeof v === 'string' && v.length));
    return (text) => set.has(text); // exact-match, case-sensitive
}

// 기존 glossary 업데이트
function updateGlossary(original, translated, human, ai) {
    try {
        // const glossary = require('../../../json/ggfh/glossary.json'); // Load glossary from JSON file
        // 기존 glossary에 count 추가
        const existingEntry = glossary.find(item => item.original === original);
        const conflicts = [];

        if (existingEntry && existingEntry.translated !== translated) {
            conflicts.push({
                original,
                existing: existingEntry.translated,
                new: translated
            });
            console.warn(`🚨 번역 불일치: "${original}"`);
            console.warn(`   기존: ${existingEntry.translated}`);
            console.warn(`   신규: ${translated}`);
            return { success: false, conflicts, hasConflicts: true };
        }

        // Using Error Handling Pattern for new entries
        // 한글로 번역하자면 "오류 처리 패턴을 사용하여 새 항목 추가"
        // 새로운 항목이 glossary에 없으면 추가
        if (!existingEntry) {
            glossary.push({ original, translated, human, ai });
            console.log(`✅ 새 용어 추가: "${original}" → "${translated}" (인간: ${human}, AI: ${ai})`);
        }

        fs.writeFileSync('../json/ggfh/glossary.json', JSON.stringify(glossary, null, 2), 'utf8');

        return {
            success: true,
            conflicts,
            hasConflicts: false
        };
    } catch (error) {
        console.error('Glossary update error:', error);
    }
}

async function translateFileUpload(path, filename, desc, mimeType) {
    try {
        const fileUpload = await ai.files.upload({
            // file: '../json/ggfh/glossary.json',
            file: path,
            config: {
                mimeType: mimeType,
                // description: 'GLOSSARY (highest priority; exact-match, case-sensitive) glossary.json DO-NOT-TRANSLATE (verbatim)'
                // description: desc

            },
            name: filename
        })
        console.log(fileUpload)
        return fileUpload
    } catch (e) {
        console.error('파일 업로드 오류:', e);
    }
}
// translateFileUpload('../json/glossary.txt', 'glossary.txt', 'GLOSSARY (highest priority; exact-match, case-sensitive) glossary.txt DO-NOT-TRANSLATE (verbatim)', 'text/plain')

async function completeTranslation(filename, test = true) {
    try {
        // JSON 파일 읽기
        const readJson = await sFiles.readJson(filename);
        const notTranslateJson = readJson.content;
        // translated 변수 삭제
        for (let i = 0; i < notTranslateJson.length; i++) {
            const element = notTranslateJson[i];
            // 번역이 완료되지 않은 경우 즉시 중단하고 알린다.
            if (!element.translated) {
                console.log(`번역이 완료되지 않은 항목: ${JSON.stringify(element)}`);
                break;
            }
            delete element.translated;
        }

        const result = test
            ? sFiles.output(notTranslateJson, `Complete_${readJson.filename}`, `${readJson.path.split('decrypt\\')[1]}`, `decrypt`)
            : sFiles.output(notTranslateJson, `${readJson.filename}`, `${readJson.path.split('decrypt\\')[1]}`, `decrypt`);

        return notTranslateJson;
    } catch (e) {
        console.log(filename)
        console.error('JSON 번역 오류:', e);
    }
}

// 폴더 안에 있는 파일 번역 완료 처리
async function completeTranslationFolders(path) {
    try {
        const files = await sFiles.getAllFiles(path);
        for (const file of files) {
            // console.log(file)
            await completeTranslation(file, false);
        }
    } catch (e) {
        console.error('폴더 번역 오류:', e);
    }
}
// completeTranslationFolders('decrypt/translated/Mod_심진기2.4.4/ModExcel')
// const testFile = require('../../trash/test.json');
// console.log(JSON.stringify(testFile))

// glossary에 원문 단어랑 번역된 단어중 일부를 변경하는 함수
function replaceInTranslation(originalWord, translatedWord, newTranslatedWord) {
    let count = 0;
    const updatedArray = glossary.map(item => {
        if (item.original.includes(originalWord) && item.translated.includes(translatedWord)) {
            console.log(`✅ 용어 변경: "${item.original}"의 "${item.translated}"을(를) "${newTranslatedWord}"으로(로) 변경했습니다.`);
            count++;
            return {
                ...item,
                translated: item.translated.replace(translatedWord, newTranslatedWord)
            };
        }
        return item;
    });
    console.log(count);
    // 변경된 내용을 JSON 파일로 저장
    fs.writeFileSync('../json/ggfh/glossary.json', JSON.stringify(updatedArray, null, 2), 'utf8');
    return updatedArray;
}
replaceInTranslation('玉足', '옥족에', '발에')

/**
 * 원문과 이전에 번역된 내용 비교
 * 1. 수집·정렬: 원문(source), 기존 번역(human), AI 후보(ai)를 같은 key로 1:1 매칭
 * 2. 보호 전처리: {0}, %s, <color>, \n 등 포맷/플레이스홀더를 마스킹(“Do-Not-Translate” 규칙)
 * 3. AI 후보 생성: 동일 프롬프트·용어집·스타일가이드로 일관 번역(온도 0)
 * 4. 자동 평가 3종
 * - (A) 품질추정(QE): 참조 없이 “원문↔번역” 정확도를 수치화(예: COMET-QE 계열)
 * - (B) 포맷/규칙 검사: 태그/플레이스홀더/숫자/줄바꿈 불일치, 금칙어, 길이 초과 등
 * - (C) LLM 심판(pairwise): 동일 기준표로 human vs ai를 비교, 승/패와 사유 JSON으로 반환
 * 5. 의사결정: 가중 합산(= QE 점수 − 규칙위반 패널티 + LLM 판정 가산점)으로 승자 선택
 * - 차이가 작으면(예: △<0.5) → 휴먼 리뷰 큐로 보류
 * - 둘 다 한계 이하(예: 점수<임계값) → 재번역 필요로 플래그
 * 6. 일관성 전파: 동일 원문은 동일 번역(Translation Memory & 용어집 적용)
 * 7. 학습·개선 루프: 사람이 고친 결과를 TM/용어집에 즉시 반영
 */
// Using Module + Strategy + Error Handling Patterns for comparative translation


// Using Strategy Pattern for multiline whitespace preservation
/**
 * 목적: 원문의 선행 공백(스페이스/탭/전각 공백 포함)을 번역문 각 라인에 1:1로 이식한다.
 * 규칙:
 * - 번역 라인이 이미 공백으로 시작하면 수정하지 않는다.
 * - 빈 라인은 그대로 둔다.
 * - 원본/번역 라인 수가 다르면, 존재하는 범위 내에서만 적용한다.
 * - 원본의 EOL(\r\n / \n)을 감지해 그대로 보존한다.
 */
function addLeadingWhitespace(originalText, translatedText) {
    const o = typeof originalText === 'string' ? originalText : String(originalText ?? '');
    const t = typeof translatedText === 'string' ? translatedText : String(translatedText ?? '');

    const eol = o.includes('\r\n') ? '\r\n' : '\n';
    const originalLines = o.split(/\r?\n/);
    const translatedLines = t.split(/\r?\n/);

    return translatedLines.map((line, i) => {
        if (!line) return line;                 // 빈 라인은 유지
        if (/^\s/.test(line)) return line;      // 이미 선행 공백이 있으면 유지
        const leading = (originalLines[i] || '').match(/^\s*/)?.[0] ?? '';
        return leading + line;
    }).join(eol);
}

// Using Strategy Pattern for safe AI text extraction
function extractTextFromResponse(resp) {
    if (!resp) return '';
    if (typeof resp.text === 'string' && resp.text.trim()) return resp.text.trim();
    const parts = resp.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
        const s = parts.map(p => p?.text).filter(Boolean).join('').trim();
        if (s) return s;
    }
    return '';
}

// Using Strategy Pattern for JSON parsing (judge 응답)
function parseJson(text) {
    try { return JSON.parse(text); } catch { return null; }
}

// Using Factory Pattern for glossary loading
function loadGlossary() {
    try {
        const glossaryPath = path.join(__dirname, '../../../json/ggfh/glossary.json');
        const raw = fs.readFileSync(glossaryPath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}
// 캐시 상태 (시스템 템플릿, glossary 파일)
let SYSTEM_CACHE = { name: null, hash: null, model: null, expiresAt: 0 };
const GLOSSARY_FILE_CACHE = new Map(); // hash -> { uri, expiresAt }
// ...existing code...

// 목적: 해시 헬퍼
function shortHash(obj) {
    return crypto.createHash('sha256')
        .update(typeof obj === 'string' ? obj : JSON.stringify(obj || ''))
        .digest('hex')
        .slice(0, 16);
}

async function deleteSystemInstructionCache(name) {
    await ai.caches.delete({ name });
}

async function listSystemInstructionCache(deleteList = false) {
    const getCached = await ai.caches.list({ config: { pageSize: 10 } })
    // 리스트 삭제하기
    if (deleteList && getCached.pageLength > 0) {
        console.log('캐시 리스트 삭제')
        for (const cache of getCached.page) {
            await deleteSystemInstructionCache(cache.name);
        }
    }
    return getCached.pageLength > 0 ? getCached.page : null;
}

// listSystemInstructionCache()
// glossary 포함 systemInstruction을 캐시에 저장하고 name 반환
async function ensureSystemInstructionCache(systemInstruction, model = 'gemini-3-pro-preview') {
    const ttlSec = 60 * 60 * 24; // 1 day
    const now = Date.now();
    const hash = crypto.createHash('sha256').update(String(systemInstruction || '')).digest('hex').slice(0, 16);

    const list = await listSystemInstructionCache()
    if (list && Array.isArray(list)) {
        const find = list.find(item => item.displayName === `zh→ko-translator-with-glossary-${hash}` && item.model === `models/${model}`)
        if (find) {
            return {
                name: find.name,
                hash: find.displayName.split('zh→ko-translator-with-glossary-')[1],
                model,
                expiresAt: find.expireTime,
            };
        }
    }

    // 서버 캐시 생성 (1일 TTL) — 최초 1회만 큰 토큰 소모
    const cache = await ai.caches.create({
        model,
        config: {
            displayName: `zh→ko-translator-with-glossary-${hash}`,
            ttl: `${ttlSec}s`,
            systemInstruction, // glossary가 포함된 systemInstruction 전문
        },
    });

    SYSTEM_CACHE = {
        name: cache.name,
        hash,
        model,
        expiresAt: now + ttlSec * 1000,
    };
    console.log(`🆕새 캐시 생성: ${JSON.stringify(SYSTEM_CACHE)}`);
    return SYSTEM_CACHE
}

// Using Strategy Pattern to build system instructions with glossary
function buildComparativeSystemInstruction(glossary) {
    //     return `ROLE - You are a professional zh→ko game/localization translator (ko-KR only).
    // OBJECTIVE - Given Source (Chinese) and Baseline (Korean, optional), output the BEST final Korean line.

    // ORDER OF OPERATIONS
    // 1) GLOSSARY (highest priority; exact-match, case-sensitive): replace with exact "translated".
    // 2) Produce AI-CANDIDATE by translating Source with 1:1 line alignment.
    // 3) Compare AI-CANDIDATE vs Baseline and SELECT the better one.

    // RUBRIC (priority)
    // - Accuracy/Faithfulness
    // - Glossary Compliance (no variations)
    // - Formatting Integrity (preserve tags/placeholders/whitespace/line breaks exactly; keep 1:1 lines)
    // - Style: formal, neutral, natural ko-KR UI/game phrasing
    // - Terminology Consistency
    // - Fluency/Readability

    // HARD RULES
    // - Do NOT translate tokens in DO-NOT-TRANSLATE.
    // - Preserve ALL formatting exactly: <color>, <size>, tags, placeholders ({...}, %s, {0}), punctuation, whitespace, \\n and \\r\\n.
    // - Output only the selected final Korean text (no explanations).

    // DO-NOT-TRANSLATE (verbatim)
    // { "<color=...>", "<color\\=...>", "<size=...>", "    ",  "    <b>...", "     （", "     {", "\\n    ", "\\r\\n", player names, item codes, ids, tags, file paths, code, regex tokens }

    // GLOSSARY (array of {original, translated}):
    // ${JSON.stringify(glossary)}`;
    return `ROLE You are a professional zh→ko game/localization translator (ko-KR only). OBJECTIVE Given Source (Chinese) and Baseline (Korean, optional), output the BEST final Korean line.

ORDER OF OPERATIONS

    GLOSSARY CHECK: Identify glossary terms. Translate them exactly as defined in the glossary.

    JOSA CORRECTION: When applying glossary terms, you MUST adjust the following Korean particle (Postposition/Josa) based on the final consonant (Batchim) of the translated term (e.g., change '를' to '을', '가' to '이' if necessary).

    DRAFTING: Translate Source to Korean. Reorder variables (e.g., {0}, %s) if necessary to fit natural Korean SOV word order.

    SELECTION: Compare your Draft vs Baseline.

        Select Baseline IF: It is accurate, fluent, and has no glossary/tag errors.

        Select Draft IF: Baseline has mistranslations, broken tags, awkward phrasing, or glossary violations.

RUBRIC (priority)

    Glossary Compliance: Use exact translated terms.

    Grammar (Josa): Ensure particles match the preceding noun (Batchim rule).

    Formatting Integrity: Preserve ALL formatting exactly (<tags>, placeholders, code). Do not add spaces inside tags (e.g., keep <color=red>, NOT <color = red>).

    Accuracy: Correct meaning transfer.

    Style: Natural Polite style (해요체) for UI/System, unless context implies otherwise.

HARD RULES

    Do NOT translate tokens in DO-NOT-TRANSLATE.

    Preserve ALL formatting exactly: tags, placeholders ({...}, %s, {0}), punctuation, whitespace, \n and \r\n.

    Do NOT output explanations or notes. Output ONLY the final translated text.

DO-NOT-TRANSLATE (verbatim) { "<color=...>", "<color=...>", "<size=...>", " ", " <b>...", " （", " {", "\n ", "\r\n", player names, item codes, ids, tags, file paths, code, regex tokens }

GLOSSARY (array of {original, translated}):
${JSON.stringify(glossary)}`
}

// Using Factory Pattern for OpenAI fallback (fetch 기반)
async function openAIChatCompletion(body) {
    if (!OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY 미설정 - OpenAI 폴백 불가');
        return null;
    }
    try {
        const res = await fetch(`${process.env.GITHUB_COPILOT_OPENAI_ENDPOINT}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            console.warn('OpenAI 오류:', res.status, err);
            return null;
        }
        const json = await res.json();
        return json?.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
        console.warn('OpenAI 호출 예외:', e?.message || e);
        return null;
    }
}

// Using Strategy Pattern for translation fallback to OpenAI
async function openAITranslateCandidate(source, systemInstruction) {
    try {
        const content = await openAIChatCompletion({
            model: 'gpt-5',
            temperature: 0.7,
            max_output_tokens: 65535,
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `Source:\n${source}\n\nTranslate to Korean. Keep formatting 1:1.` }
            ]
        });
        console.log(content)
        return content ? { text: content, success: true } : { text: null, success: false };
    } catch (e) {
        console.warn('OpenAI 번역 단계 실패 - 건너뜀:', e?.message || e);
        return { text: null, success: false };
    }
}

// Using Strategy Pattern for judge fallback to OpenAI (JSON 요청)
async function openAIJudgeAndSelect({ source, human, aiCandidate, systemInstruction }) {
    try {
        const userPrompt = `You will choose the BEST final Korean line between:
- Baseline (human): may be empty
- AI-CANDIDATE

Constraints:
- Apply GLOSSARY strictly
- Preserve formatting and whitespace
- 1 line in → 1 line out

Return ONLY JSON:
{"final":"<the best single-line Korean text>"}

Input:
<Source>
${source}

<Baseline>
${human ?? '없음'}

<AI-CANDIDATE>
${aiCandidate}`;
        const content = await openAIChatCompletion({
            model: 'gpt-5',
            temperature: 0.0,
            max_output_tokens: 65535,
            response_format: { type: 'json_object' }, // 가능하면 사용
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: userPrompt }
            ]
        });
        console.log(content)
        if (!content) return { text: null, success: false };
        const json = parseJson(content);
        return { text: json?.final || null, success: !!json?.final };
    } catch (e) {
        console.warn('OpenAI 판정 단계 실패 - 건너뜀:', e?.message || e);
        return { text: null, success: false }; // 호출부에서 translated:false 처리

    }
}

// Using Strategy Pattern for AI candidate translation
async function translateAiCandidate(source, systemInstruction, safetySettings = [{ category: 'HARM_CATEGORY_SEXUAL', threshold: 'BLOCK_NONE' }], model = 'gemini-3-pro-preview') {
    try {
        let cached = null;
        try { cached = await ensureSystemInstructionCache(systemInstruction, model); } catch { }
        const resp = await ai.models.generateContent({
            model,
            config: {
                temperature: 1.0,
                maxOutputTokens: 65535,
                responseMimeType: 'text/plain',
                // systemInstruction
                ...(cached ? { cachedContent: cached.name } : { systemInstruction }) // 캐시 실패 시 기존 방식
            },

            contents: [{ role: 'user', parts: [{ text: `Source:\n${source}\n\nTranslate to Korean. Keep formatting 1:1.` }] }],
            // 안전성 필터 완화 (필요 시)
            safetySettings,
        });
        const text = extractTextFromResponse(resp);
        return { text: text || null, success: !!text };

        // if (text) return { text: text, success: true };

        // // Fallback to OpenAI
        // console.warn('Gemini 결과 없음 → OpenAI 폴백 시도');
        // const content = await openAITranslateCandidate(source, systemInstruction);
        // return { text: content?.text || null, success: content.success };
    } catch (err) {
        console.warn('AI 후보 생성 실패 - 건너뜀:', err?.error?.status || err?.code || err?.message || err);
        // const content = await openAITranslateCandidate(source, systemInstruction);
        // if (content.success) return { text: content?.text || null, success: true };
        return { text: null, success: false };
    }
}

// Using Strategy Pattern for model-based judgment (JSON enforced)
async function judgeAndSelect({ source, human, aiCandidate, systemInstruction, safetySettings = [{ category: 'HARM_CATEGORY_SEXUAL', threshold: 'BLOCK_NONE' }], model = 'gemini-3-pro-preview' }) {
    // Gemini로 시도
    const judgePrompt = `You will choose the BEST final Korean line between:
- Baseline (human): may be empty
- AI-CANDIDATE

Constraints:
- Apply GLOSSARY strictly
- Preserve formatting and whitespace
- 1 line in → 1 line out

Return ONLY JSON:
{"final":"<the best single-line Korean text>"}

Input:
<Source>
${source}

<Baseline>
${human ?? '없음'}

<AI-CANDIDATE>
${aiCandidate}`;

    try {
        let cached = null;
        try { cached = await ensureSystemInstructionCache(systemInstruction, model); } catch { }
        const resp = await ai.models.generateContent({
            model,
            config: {
                temperature: 0.0,
                maxOutputTokens: 65535,
                responseMimeType: 'application/json',
                // systemInstruction
                ...(cached ? { cachedContent: cached.name } : { systemInstruction })

            },
            contents: [{ role: 'user', parts: [{ text: judgePrompt }] }],
            safetySettings,
        });
        const text = extractTextFromResponse(resp);
        const json = parseJson(text);
        return { text: json?.final || null, success: true };
        // if (json?.final) return { text: json.final, success: true };

        // // Fallback to OpenAI
        // console.warn('Gemini 판정 JSON 없음 → OpenAI 폴백 시도');
        // const content = await openAIJudgeAndSelect({ source, human, aiCandidate, systemInstruction });
        // return { text: content?.final || null, success: true };
    } catch (err) {
        console.warn('판정 단계 실패 - 건너뜀:', err?.error?.status || err?.code || err?.message || err);
        // const content = await openAIJudgeAndSelect({ source, human, aiCandidate, systemInstruction });
        // if (content.success) return { text: content?.text || null, success: true };
        return { text: null, success: false }; // 호출부에서 translated:false 처리
    }
}


// Using Async/Await + Error Handling Patterns for batch comparison
async function translateCompareBatch({ newJsonPath, oldJsonPath = null, idKey = 'id', textKey = 'dialogue', addKey, useAi = true }) {
    const glossary = loadGlossary();
    const checkGlossary = createGlossaryChecker(glossary);
    const systemInstruction = buildComparativeSystemInstruction(glossary);
    const targetKey = addKey || textKey;

    const newData = await sFiles.readJson(newJsonPath);           // { content, filename, path, ... }
    const oldData = oldJsonPath ? await (async () => {
        try { return await sFiles.readJson(oldJsonPath); } catch { return null; }
    })() : null;

    // Using Map Pattern for baseline lookup
    const baselineMap = new Map();
    if (oldData?.content?.length) {
        for (const it of oldData.content) {
            const key = (it && it[idKey]) ?? null;
            if (key != null) baselineMap.set(key, it[targetKey]);
        }
    }
    // 안전성 필터 완화 (필요 시)
    const safetySettings = [
        { category: 'HARM_CATEGORY_SEXUAL', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ];
    const out = [];
    for (const item of newData.content) {
        const source = item?.[textKey] ?? '';
        const targetText = !source.includes('drama') && !source.includes('role') && !source.includes('task') && source != "0" ? source : '';

        if (targetText != '' && !item.translated) {

            if (!source) { out.push({ ...item, translated: false }); continue; }

            // 이미 번역된 항목은 건너뜀
            if (checkGlossary(source)) {
                // console.log(`🔖용어집 일치: "${source}" → "${glossary.find(g => g.original === source).translated}"`);
                out.push({ ...item, [targetKey]: glossary.find(g => g.original === source).translated, translated: true });
                continue;
            }

            const human = baselineMap.get(item?.[idKey]) ?? null;
            // console.log(`useAi ::: type ${typeof useAi} value ${useAi} JSON.parse ${JSON.parse(useAi)}`)
            // return;
            if (!JSON.parse(useAi) && human != null && human != '') {
                console.log(`인간 번역 사용: ${human}`);
                const humanLeadingWhitespaceText = addLeadingWhitespace(source, human);
                out.push({ ...item, [targetKey]: humanLeadingWhitespaceText, translated: true });
                continue;
            }
            // console.log(`원문 : ${source} 인간: ${human}`);
            // 1) AI 후보 생성
            let aiCandidate = await translateAiCandidate(source, systemInstruction, safetySettings);
            if (!aiCandidate.success || !aiCandidate.text || aiCandidate.text == 'null') {
                aiCandidate = await translateAiCandidate(source, systemInstruction, safetySettings, 'gemini-2.5-flash');
            }
            if (!aiCandidate.success || !aiCandidate.text || aiCandidate.text == 'null') {
                console.log(`❌AI 후보 생성 실패 - 원문 유지 (원문 : ${source} 인간: ${human})`);
                out.push({ ...item, [textKey]: source, translated: false });
                continue;
            }
            // 원본 선행 공백 보존
            const leadingWhitespaceText = addLeadingWhitespace(source, aiCandidate.text);

            let chosen = null;
            // 인간이 번역한 내용이 존재할 경우 혹은 한글이 있는 경우
            if (human != null && human != '' && /[가-힣]/.test(human)) {
                console.log('심판 진행 중...');
                // 2) 심판으로 선택
                chosen = await judgeAndSelect({ source, human, aiCandidate: leadingWhitespaceText, systemInstruction, safetySettings });
                if (!chosen.success || !chosen.text || chosen.text == 'null') {
                    chosen = await judgeAndSelect({ source, human, aiCandidate: leadingWhitespaceText, systemInstruction, safetySettings, model: 'gemini-2.5-flash' });
                }
                if (chosen.success && (!chosen.text || chosen.text == 'null')) {
                    console.log(`⚠️판정 성공했으나 결과가 없을 경우 - 원문 유지 (원문 : ${source} 인간: ${human} AI: ${leadingWhitespaceText})`);
                    // 혹시 모를 체크가 필요하니 translated:false 처리
                    updateGlossary(source, chosen.text, human, leadingWhitespaceText);

                    out.push({ ...item, [targetKey]: leadingWhitespaceText || human || source, translated: false });
                    continue;
                } else if (!chosen.success) {
                    console.log(`❌판정 실패 - 원문 유지 (원문 : ${source} 인간: ${human} AI: ${leadingWhitespaceText})`);

                    // 혹시 모를 체크가 필요하니 translated:false 처리
                    updateGlossary(source, chosen.text, human, leadingWhitespaceText);

                    out.push({ ...item, [targetKey]: leadingWhitespaceText || source, translated: false });
                    continue;
                }
            } else {
                // 인간의 번역이 없을 경우 AI 후보를 바로 선택
                chosen = { text: leadingWhitespaceText, success: true };
            }
            console.log(`🆗최종 선택: ${chosen.text} (원문 : ${source} 인간: ${human}, AI: ${leadingWhitespaceText})`);
            const clearLeadingWhitespaceText = addLeadingWhitespace(source, chosen.text);

            // 용어집 업데이트
            updateGlossary(source, clearLeadingWhitespaceText, human, leadingWhitespaceText);
            // 3) 원본 선행 공백 보존
            // const finalText = addLeadingWhitespace(source, chosen);

            // 4) 결과 저장
            out.push({
                ...item,
                [targetKey]: clearLeadingWhitespaceText,
                translated: true
            });

            // Rate limit (안정성)
            await new Promise(r => setTimeout(r, 80));
        } else {
            out.push({ ...item, [textKey]: source, translated: true })
        }

    }

    const rel = newData.path.split('decrypt\\')[1] || '';
    const output = sFiles.output(out, newData.filename, `translated/${rel}`, 'decrypt');
    const result = {
        total: out.length,
        success: out.filter(x => x.translated).length,
        fail: out.filter(x => !x.translated).length,
        hasBaseline: !!oldData,
        output
    };
    listSystemInstructionCache(true)
    console.log(JSON.stringify(result));
    return result
}

// 사용 예시
// translateCompareBatch({
//     newJsonPath: 'decrypt/Mod_심진기2.4.4/ModExcel/patch_item/DramaDialogue.json',
//     // newJsonPath: 'decrypt/translated/Mod_심진기2.4.4/ModExcel/patch_feature/Complete_RoleCreateFeature.json',
//     oldJsonPath: 'lagacy/Mod_심진기2.0.0/ModExcel/patch_item/DramaDialogue.json',
//     idKey: 'id',
//     textKey: 'dialogue',
//     // addKey: 'kr'
// });

// 공백 재적용 함수
async function retryLeadingWhitespace(originalPath, translatedPath) {
    try {
        const originalJson = await sFiles.readJson(originalPath);
        const translatedJson = await sFiles.readJson(translatedPath);

        const originalData = originalJson.content;
        const translatedData = translatedJson.content;

        for (let i = 0; i < originalData.length; i++) {
            const originalText = originalData[i].ch;
            const translatedText = translatedData[i].kr;

            // 공백 추가
            const leadingWhitespaceText = addLeadingWhitespace(originalText, translatedText);
            console.log(leadingWhitespaceText)
            translatedData[i].kr = leadingWhitespaceText;
        }

        // 수정된 데이터를 다시 저장
        sFiles.output(translatedData, `retryLeadingWhitespace_${translatedJson.filename}`, `${translatedJson.path.split('decrypt\\')[1]}`, 'decrypt');
        console.log('공백 추가 완료');
    } catch (error) {
        console.error('공백 추가 오류:', error);
    }
}

// console.log(retryLeadingWhitespace('decrypt/Mod_심진기2.4.4/ModExcel/patch_item/LocalText.json', 'decrypt/translated/Mod_심진기2.4.4/ModExcel/patch_item/LocalText.json'));

/**
 * files.json을 읽어서 각 파일의 textKeys를 순차적으로 번역
 * @param {string} filesJsonPath - files.json 경로 (기본: json/ggfh/files.json)
 * @param {string} oldBasePath - 이전 버전 폴더 경로 (optional)
 * @param {boolean} useAi - AI 사용 여부
 * @returns {Promise<Object>} - 번역 결과 요약
 */
async function translateFromFilesJson(filesJsonPath = 'json/ggfh/files.json', oldBasePath = null, useAi = true) {
    try {
        console.log(filesJsonPath, oldBasePath, useAi)
        // files.json 읽기
        const filesData = await sFiles.readJson(filesJsonPath);
        const { baseFolder, files } = filesData.content;
        const results = {
            total: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            details: []
        };

        console.log(`📂 번역 시작: ${files.length}개 파일`);
        console.log(`📁 기본 폴더: ${baseFolder}`);

        for (const fileEntry of files) {
            const { path: relativePath, textKeys, addKey } = fileEntry;
            const fullPath = `${baseFolder}/${relativePath}`;

            // oldJsonPath 계산 (oldBasePath가 있는 경우)
            const oldJsonPath = oldBasePath ? `${oldBasePath}/${relativePath}` : null;

            console.log(`\n📄 파일: ${relativePath}`);
            console.log(`   textKeys: ${textKeys.join(', ')}`);

            // 각 textKey에 대해 순차적으로 번역
            for (const textKey of textKeys) {
                results.total++;

                try {
                    console.log(`   🔄 번역 중: ${textKey}${addKey ? ` → ${addKey}` : ''}`);

                    const translateResult = await translateCompareBatch({
                        newJsonPath: fullPath,
                        oldJsonPath: oldJsonPath,
                        idKey: 'id',
                        textKey: textKey,
                        addKey: addKey || null,
                        useAi: useAi
                    });

                    results.success++;
                    results.details.push({
                        file: relativePath,
                        textKey: textKey,
                        status: 'success',
                        result: translateResult
                    });

                    console.log(`   ✅ 완료: ${textKey}`);
                } catch (error) {
                    results.failed++;
                    results.details.push({
                        file: relativePath,
                        textKey: textKey,
                        status: 'failed',
                        error: error.message
                    });

                    console.error(`   ❌ 실패: ${textKey} - ${error.message}`);
                }
            }
        }

        console.log(`\n📊 번역 완료 요약:`);
        console.log(`   총: ${results.total}, 성공: ${results.success}, 실패: ${results.failed}`);

        return results;
    } catch (error) {
        throw new Error(`files.json 번역 실패: ${error.message}`);
    }
}

module.exports = {
    translateFileUpload,
    translateCompareBatch,
    completeTranslation,
    retryLeadingWhitespace,
    completeTranslationFolders,
    translateFromFilesJson
}