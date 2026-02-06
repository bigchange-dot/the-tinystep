const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.askGemini = onRequest({ cors: true }, async (req, res) => {
  try {
    // 1. 사용자의 입력 받기 (Query 또는 Body)
    const question = req.query.text || req.body.text || "";

    // [안전장치 추가] 2. 글자 수 제한 검증 (500자)
    if (!question || question.trim().length === 0) {
      return res.status(400).send({ reply: "교정할 문장을 입력해주세요." });
    }
    if (question.length > 500) {
      return res.status(400).send({ reply: "문장이 너무 깁니다. 500자 이내로 입력해주세요." });
    }

    // 3. 모델 선택 (속도와 비용에 최적화된 1.5-flash)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 4. 프롬프트 고도화 (페르소나 강화 및 출력 형식 고정)
    const prompt = `
    당신은 20년 경력의 미국 비즈니스 영어 전문가입니다. 
    다음 가이드라인에 따라 사용자의 문장을 교정하세요.

    [목표]: 가장 자연스럽고 프로페셔널한 비즈니스 이메일 톤으로 교정.
    [사용자 입력]: "${question}"

    [출력 형식]:
    [교정된 문장]: 
    (원어민이 실제로 쓸 법한 세련된 문장 출력)

    [설명]: 
    (한국어로 핵심 포인트만 1~2줄 요약)
    `;

    // 5. Gemini API 호출
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text();

    // 6. 결과 반환
    res.send({ reply: answer });

  } catch (error) {
    console.error("에러 발생:", error);
    res.status(500).send({ reply: `죄송합니다. 서버 에러가 발생했습니다: ${error.message}` });
  }
});