const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp();
const db = getFirestore();

const { GoogleGenerativeAI } = require("@google/generative-ai");

// 환경변수에서 API 키 가져오기
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

exports.askGemini = onRequest({ cors: true }, async (req, res) => {
  try {
    // --- [방어 시스템: 10분에 5회 제한] ---
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const ipKey = clientIp ? clientIp.replace(/[:.]/g, '_') : 'unknown';

    const LIMIT_COUNT = 5; 
    const LIMIT_TIME = 10 * 60 * 1000; 

    const docRef = db.collection('usage_logs').doc(ipKey);
    const doc = await docRef.get();
    const now = Date.now();

    if (doc.exists) {
      const data = doc.data();
      const diff = now - data.lastTime;

      if (diff < LIMIT_TIME) {
        if (data.count >= LIMIT_COUNT) {
          logger.warn(`차단된 사용자: ${clientIp}`);
          res.status(429).json({ reply: "🚫 사용량이 너무 많습니다. 10분 뒤에 다시 시도해주세요." });
          return;
        } else {
          await docRef.update({ count: data.count + 1, lastTime: now });
        }
      } else {
        await docRef.set({ count: 1, lastTime: now });
      }
    } else {
      await docRef.set({ count: 1, lastTime: now });
    }
    // --- [방어 시스템 끝] ---


    // --- [AI 요청 처리] ---
    const userText = req.query.text || "";
    const option = req.query.option || "business"; // 탭 옵션 (기본값: 비즈니스)
    
    if (!userText) {
      res.status(400).json({ reply: "내용을 입력해주세요." });
      return;
    }

    let prompt = "";

    // [옵션에 따른 프롬프트 분기]
    if (option === "travel") {
        // 1. 여행 영어 모드
        prompt = `
        당신은 친절한 여행 가이드이자 통역사입니다.
        사용자가 입력한 상황이나 한국어 문장에 대해 여행지에서 바로 쓸 수 있는 자연스러운 영어 표현 3가지를 알려주세요.
        
        [사용자 입력]: "${userText}"
        
        [출력 형식]:
        1. (가장 기본적인 표현)
        2. (조금 더 정중한 표현)
        3. (현지인처럼 자연스러운 표현)
        
        각 표현 아래에 한글 발음과 간단한 뉘앙스 설명을 덧붙여주세요.
        `;
    } else if (option === "oneliner") {
        // 2. 한줄 영어 모드
        prompt = `
        당신은 센스 있는 영어 선생님입니다.
        사용자가 입력한 키워드(감정, 상황)에 딱 맞는 '원어민들이 자주 쓰는 짧고 강렬한 한 문장(Idiom/Slang)'을 추천해주세요.
        
        [사용자 입력]: "${userText}"
        
        [출력 형식]:
        ✨ 추천 표현: (영어 문장)
        🗣️ 발음: (한글 발음)
        💡 뜻/설명: (이 표현이 어떤 상황에서 쓰이는지 재미있게 설명)
        `;
    } else {
        // 3. 비즈니스 교정 모드 (기본)
        prompt = `
        당신은 20년 경력의 미국 비즈니스 영어 전문가입니다. 
        [목표]: 가장 자연스럽고 프로페셔널한 비즈니스 이메일 톤으로 교정.
        [사용자 입력]: "${userText}"

        [출력 형식]:
        [교정된 문장]: 
        (원어민이 실제로 쓸 법한 세련된 문장 출력)

        [설명]: 
        (한국어로 핵심 포인트만 1~2줄 요약)
        `;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ reply: text });

  } catch (error) {
    logger.error("에러 발생:", error);
    res.status(500).json({ reply: "죄송합니다. 서버 오류가 발생했습니다." });
  }
});